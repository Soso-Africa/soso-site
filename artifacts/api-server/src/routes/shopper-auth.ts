import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { pool } from "@workspace/db";
import {
  RegisterShopperAuthBody, LoginShopperAuthBody, VerifyShopperEmailBody,
  RequestShopperPasswordResetBody, ResetShopperPasswordBody, GetShopperAuthSessionResponse,
  ListShopperSessionsResponse, RevokeShopperSessionBody, RevokeShopperSessionsBody,
} from "@workspace/api-zod";
import { ShopperError } from "../lib/justicesureCustomers";
import { checkShopperPassword, hashShopperPassword, validShopperPassword } from "../lib/shopper-auth-passwords";
import { authRateLimit, consumeAuthToken, issueAuthToken, type AuthUserRow, type AuthTokenPurpose } from "../lib/shopper-auth-store";
import { cookieOptions, createShopperSession, deleteCurrentShopperSession, loadShopperSession, requireShopperSameOrigin, SHOPPER_SESSION_COOKIE } from "../lib/shopper-auth-session";
import { readyAccountMail, deliverMail } from "../lib/staff-mail-transport";
import { MailError } from "../lib/staff-mail-security";
import { shopperDevices } from "../lib/shopper-auth-devices";

type Mailer = {
  ready: () => Promise<{ publicOrigin: string }>;
  send: (input: { email: string; name: string; url: string; purpose: AuthTokenPurpose }) => Promise<void>;
};
const defaultMailer: Mailer = {
  ready: readyAccountMail,
  async send(input) {
    const verification = input.purpose === "verify_email";
    await deliverMail({
      id: randomUUID(), to: input.email, kind: "account",
      subject: verification ? "Verify your SOSO account email" : "Reset your SOSO account password",
      text: `Hello ${input.name},\n\n${verification ? "Confirm the email for the SOSO account you created" : "Set a new password for your SOSO account"}:\n${input.url}\n\nThis link expires in ${verification ? "60" : "30"} minutes and can be used only once.\nIf you did not request this, do not use the link. Your details will not be changed.\nCreating an account does not subscribe you to marketing emails.\n\nSOSO Africa`,
    });
  },
};
const DUMMY_HASH = `scrypt-v1$${"0".repeat(64)}$${"0".repeat(128)}`;
const emailSchema = z.string().trim().email().max(254);
const genericRegistration = "Request received. If this email needs verification, check its inbox and spam folder for your SOSO link. Delivery is not guaranteed; if no email arrives, sign in and request another link.";
const genericRecovery = "If a SOSO account exists for this email, check its inbox and spam folder for a recovery link. If no email arrives, wait a short while and try again.";

export function createShopperAuthRouter(mailer: Mailer = defaultMailer) {
  const router = Router();
  router.use("/shopper-auth", loadShopperSession, requireShopperSameOrigin);
  const run = (handler: (req: Request, res: Response) => Promise<void>) => async (req: Request, res: Response) => {
    try { await handler(req, res); }
    catch (error) {
      if (error instanceof ShopperError || error instanceof MailError) {
        if (error.status === 429) res.setHeader("Retry-After", "900");
        res.status(error.status).json({ error: error.message, code: error instanceof ShopperError ? error.code : "ACCOUNT_EMAIL_UNAVAILABLE" });
      } else if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Check your email, name and password. Passwords must contain 12–128 characters.", code: "AUTH_INPUT_INVALID" });
      } else {
        req.log?.error({ event: "shopper_auth_failure" }, "Shopper authentication failed");
        res.status(503).json({ error: "Shopper login is temporarily unavailable. Please try again.", code: "AUTH_UNAVAILABLE" });
      }
    }
  };
  const limit = async (req: Request, action: string, email?: string, maximum = 10, seconds = 900) => {
    await authRateLimit(`auth:ip:${req.ip ?? "unknown"}`, 60, 900);
    if (email) await authRateLimit(`auth:${action}:${email}`, maximum, seconds);
  };
  const mailToken = async (req: Request, user: AuthUserRow, purpose: AuthTokenPurpose, origin: string) => {
    const token = await issueAuthToken(user, purpose);
    const pathname = purpose === "verify_email" ? "/account/verify-email" : "/account/reset-password";
    const url = new URL(pathname, origin);
    if (url.protocol !== "https:" || url.username || url.password) throw new MailError("The configured account email origin is invalid.", 503);
    // Fragments never reach HTTP access logs or referrers. Tokens are posted only on explicit confirmation.
    url.hash = `token=${token}`;
    try { await mailer.send({ email: user.email, name: user.name, url: url.toString(), purpose }); }
    catch {
      // Sending failure is durable in Staff send history. Keep the public result
      // privacy-safe: never expose whether a particular email is registered.
      req.log?.warn({ event: "shopper_security_mail_unconfirmed" }, "Shopper security email could not be confirmed; review Staff email send history");
    }
  };

  router.get("/shopper-auth/session", run(async (req, res) => {
    res.json(GetShopperAuthSessionResponse.parse({ user: req.shopper ?? null }));
  }));
  const deviceLimit = async (req: Request, broad = false) => {
    if (!req.shopper) throw new ShopperError(401, "SIGN_IN_REQUIRED", "Sign in to manage your devices.");
    await authRateLimit(`auth:devices:ip:${req.ip ?? "unknown"}`, 120, 900);
    await authRateLimit(`auth:devices:${broad ? "credentials" : "actions"}:${req.shopper.id}`, broad ? 5 : 60, 900);
  };
  router.get("/shopper-auth/sessions", run(async (req, res) => {
    await deviceLimit(req);
    res.json(ListShopperSessionsResponse.parse(await shopperDevices(req)));
  }));
  router.post("/shopper-auth/sessions/revoke", run(async (req, res) => {
    await deviceLimit(req);
    const input = RevokeShopperSessionBody.strict().parse(req.body);
    res.json(ListShopperSessionsResponse.parse(await shopperDevices(req, input)));
  }));
  router.post("/shopper-auth/sessions/revoke-many", run(async (req, res) => {
    await deviceLimit(req, true);
    const input = RevokeShopperSessionsBody.strict().parse(req.body);
    const result = await shopperDevices(req, input);
    if (input.scope === "all") res.clearCookie(SHOPPER_SESSION_COOKIE, cookieOptions());
    res.json(ListShopperSessionsResponse.parse(result));
  }));
  router.post("/shopper-auth/register", run(async (req, res) => {
    const input = RegisterShopperAuthBody.strict().parse(req.body);
    const email = emailSchema.parse(input.email).toLowerCase();
    const name = input.name.trim();
    if (!name || /[\r\n\x00-\x1f]/.test(name) || !validShopperPassword(input.password)) {
      throw new ShopperError(400, "AUTH_INPUT_INVALID", "Enter your name and a password of 12–128 characters.");
    }
    await limit(req, "register", email, 3, 3600);
    const settings = await mailer.ready();
    const passwordHash = await hashShopperPassword(input.password);
    await pool.query("INSERT INTO soso_shopper_users(email,name,password_hash) VALUES($1,$2,$3) ON CONFLICT(email) DO NOTHING", [email, name, passwordHash]);
    const user = (await pool.query("SELECT * FROM soso_shopper_users WHERE email=$1", [email])).rows[0] as AuthUserRow;
    if (!user.email_verified_at) await mailToken(req, user, "verify_email", settings.publicOrigin);
    res.json({ message: genericRegistration });
  }));
  router.post("/shopper-auth/login", run(async (req, res) => {
    const input = LoginShopperAuthBody.strict().parse(req.body);
    const email = emailSchema.parse(input.email).toLowerCase();
    await limit(req, "login", email);
    const user = (await pool.query("SELECT * FROM soso_shopper_users WHERE email=$1", [email])).rows[0] as AuthUserRow | undefined;
    const valid = await checkShopperPassword(input.password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !valid) throw new ShopperError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    const current = await createShopperSession(req, res, user.id, user.password_hash);
    res.json(GetShopperAuthSessionResponse.parse({ user: current }));
  }));
  router.post("/shopper-auth/logout", run(async (req, res) => {
    await deleteCurrentShopperSession(req);
    res.clearCookie(SHOPPER_SESSION_COOKIE, cookieOptions());
    res.json({ message: "Signed out." });
  }));
  router.post("/shopper-auth/resend-verification", run(async (req, res) => {
    if (!req.shopper) throw new ShopperError(401, "SIGN_IN_REQUIRED", "Sign in before requesting another verification email.");
    await limit(req, "verification", req.shopper.email, 3, 3600);
    const settings = await mailer.ready();
    const user = (await pool.query("SELECT * FROM soso_shopper_users WHERE id=$1", [req.shopper.id])).rows[0] as AuthUserRow;
    if (!user.email_verified_at) await mailToken(req, user, "verify_email", settings.publicOrigin);
    res.json({ message: genericRegistration });
  }));
  router.post("/shopper-auth/verify-email", run(async (req, res) => {
    const input = VerifyShopperEmailBody.strict().parse(req.body);
    await limit(req, "verify", input.token);
    await consumeAuthToken(input.token, "verify_email", { verificationPassword: input.password });
    res.json({ message: "Your email is verified. Sign in to open your SOSO account." });
  }));
  router.post("/shopper-auth/forgot-password", run(async (req, res) => {
    const input = RequestShopperPasswordResetBody.strict().parse(req.body);
    const email = emailSchema.parse(input.email).toLowerCase();
    await limit(req, "recovery", email, 3, 3600);
    const settings = await mailer.ready();
    const user = (await pool.query("SELECT * FROM soso_shopper_users WHERE email=$1", [email])).rows[0] as AuthUserRow | undefined;
    if (user) await mailToken(req, user, "reset_password", settings.publicOrigin);
    res.json({ message: genericRecovery });
  }));
  router.post("/shopper-auth/reset-password", run(async (req, res) => {
    const input = ResetShopperPasswordBody.strict().parse(req.body);
    if (!validShopperPassword(input.password)) throw new ShopperError(400, "AUTH_INPUT_INVALID", "Use a password of 12–128 characters.");
    await limit(req, "reset", input.token);
    await consumeAuthToken(input.token, "reset_password", { newPasswordHash: await hashShopperPassword(input.password) });
    res.clearCookie(SHOPPER_SESSION_COOKIE, cookieOptions());
    res.json({ message: "Password changed. All previous shopper sessions have been signed out. Sign in with your new password." });
  }));
  return router;
}
export default createShopperAuthRouter();
