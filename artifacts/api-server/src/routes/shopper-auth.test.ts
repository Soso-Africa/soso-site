import assert from "node:assert/strict";
import { after, test } from "node:test";
import express from "express";
import cookieParser from "cookie-parser";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { GetShopperAuthSessionResponse } from "@workspace/api-zod";
import { createShopperAuthRouter } from "./shopper-auth";
import { loadShopperSession, requireShopperSameOrigin, SHOPPER_SESSION_COOKIE, tokenHash, createShopperSession } from "../lib/shopper-auth-session";
import { hashShopperPassword, checkShopperPassword } from "../lib/shopper-auth-passwords";
import { authRateLimit, consumeAuthToken, issueAuthToken } from "../lib/shopper-auth-store";
import { checkoutShopper, verifiedShopper } from "../lib/shopperIdentity";
import { ShopperError } from "../lib/justicesureCustomers";
import { shopperDevices } from "../lib/shopper-auth-devices";

after(async () => { await pool.end(); });

test("private device sessions: ownership, expiry, credential proof and concurrent revocation", async (t) => {
  const app = express();
  app.use(express.json(), cookieParser());
  app.use("/api", createShopperAuthRouter());
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const password = "Synthetic device account passphrase";
  const hash = await hashShopperPassword(password);
  const id = randomUUID(), otherId = randomUUID();
  await pool.query(`INSERT INTO soso_shopper_users(id,email,name,password_hash)
    VALUES($1,$2,'Synthetic devices',$3),($4,$5,'Other shopper',$3)`,
  [id, `${id}@example.test`, hash, otherId, `${otherId}@example.test`]);
  const call = (path: string, cookie?: string, body?: unknown, origin: string | null = base) => fetch(`${base}/api/shopper-auth/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...(cookie ? { cookie } : {}), ...(origin ? { origin } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const login = async (userId = id) => {
    const response = await call("login", undefined, { email: `${userId}@example.test`, password });
    assert.equal(response.status, 200);
    return response.headers.get("set-cookie")!.split(";")[0];
  };
  const list = async (cookie: string) => {
    const response = await call("sessions", cookie);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control")!, /private, no-store/);
    return await response.json() as { sessions: Array<{ id: string; current: boolean; deviceLabel: string; expiresAt: string }> };
  };
  let current = await login(), second = await login(), outsider = await login(otherId);
  try {
    await t.test("lists only owned active sessions and exposes opaque non-credential IDs", async () => {
      const result = await list(current);
      assert.equal(result.sessions.length, 2);
      assert.equal(result.sessions.filter((s) => s.current).length, 1);
      assert.equal((await call("sessions")).status, 401);
      const stored = (await pool.query("SELECT token_hash FROM soso_shopper_sessions WHERE user_id=$1", [id])).rows;
      for (const row of stored) assert(!JSON.stringify(result).includes(row.token_hash));
      assert(!JSON.stringify(result).includes(current.split("=")[1]));
      assert(!JSON.stringify(result).includes(otherId));
      assert.deepEqual(Object.keys(result.sessions[0]).sort(), ["createdAt","current","deviceLabel","expiresAt","id","lastActiveAt"].sort());
      assert.equal((await call("sessions/revoke", current, { id: (await list(outsider)).sessions[0].id })).status, 404);
      assert.equal((await call("sessions/revoke", current, { id: result.sessions.find((s) => s.current)!.id })).status, 404);
      assert.equal((await call("sessions/revoke", current, { id: randomUUID(), userId: otherId })).status, 400);
    });
    await t.test("same-origin proof, password proof and individual concurrent revocation", async () => {
      const target = (await list(current)).sessions.find((s) => !s.current)!.id;
      assert.equal((await call("sessions/revoke", current, { id: target }, null)).status, 403);
      assert.equal((await call("sessions/revoke-many", current, { scope: "all", password }, "https://evil.example")).status, 403);
      assert.equal((await call("sessions/revoke-many", current, { scope: "all", password: "wrong" })).status, 403);
      assert.equal((await list(current)).sessions.length, 2);
      const responses = await Promise.all([call("sessions/revoke", current, { id: target }), call("sessions/revoke", current, { id: target })]);
      assert.deepEqual(responses.map((r) => r.status).sort(), [200, 404]);
      assert.equal((await call("sessions", second)).status, 401);
      assert.equal((await list(outsider)).sessions.length, 1);
    });
    await t.test("expired sessions vanish and a revoked in-flight actor cannot revoke another device", async () => {
      second = await login();
      const staleReq = { shopper: { id }, shopperSessionHash: tokenHash(second.split("=")[1]) } as never;
      await pool.query("UPDATE soso_shopper_sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE token_hash=$1", [tokenHash(second.split("=")[1])]);
      assert.equal((await list(current)).sessions.length, 1);
      assert.equal((await call("sessions", second)).status, 401);
      await assert.rejects(shopperDevices(staleReq, { scope: "all", password }), { code: "SIGN_IN_REQUIRED" });
      second = await login();
      const secondHash = tokenHash(second.split("=")[1]);
      const staleActor = { shopper: { id }, shopperSessionHash: secondHash } as never;
      const target = (await list(current)).sessions.find((s) => !s.current)!.id;
      assert.equal((await call("sessions/revoke", current, { id: target })).status, 200);
      await assert.rejects(shopperDevices(staleActor, { scope: "all", password }), { code: "SIGN_IN_REQUIRED" });
      assert.equal((await list(current)).sessions.length, 1);
    });
    await t.test("user lock wait rechecks actual expiry, not transaction-start time", async () => {
      const waiter = await login();
      const waiterHash = tokenHash(waiter.split("=")[1]);
      const blocker = await pool.connect();
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM soso_shopper_users WHERE id=$1 FOR UPDATE", [id]);
      await blocker.query("UPDATE soso_shopper_sessions SET expires_at=clock_timestamp()+interval '100 milliseconds' WHERE token_hash=$1", [waiterHash]);
      const waiting = shopperDevices({ shopper: { id }, shopperSessionHash: waiterHash } as never);
      const rejection = assert.rejects(waiting, { code: "SIGN_IN_REQUIRED" });
      try {
        await new Promise((resolve) => setTimeout(resolve, 200));
        await blocker.query("COMMIT");
      } finally { blocker.release(); }
      await rejection;
    });
    await t.test("all-other revocation keeps current cookie, global revocation clears it and isolates shoppers", async () => {
      second = await login();
      const response = await call("sessions/revoke-many", current, { scope: "others", password });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("set-cookie"), null);
      assert.equal((await list(current)).sessions.length, 1);
      assert.equal((await call("sessions", second)).status, 401);
      const all = await call("sessions/revoke-many", current, { scope: "all", password });
      assert.equal(all.status, 200);
      assert.deepEqual(await all.json(), { sessions: [] });
      assert.match(all.headers.get("set-cookie")!, /Expires=Thu, 01 Jan 1970/);
      assert.equal((await call("sessions", current)).status, 401);
      assert.equal((await list(outsider)).sessions.length, 1);
    });
    await t.test("credential attempts are bounded per shopper across sessions", async () => {
      current = await login();
      await pool.query("DELETE FROM soso_shopper_auth_limits WHERE key=$1", [tokenHash(`auth:devices:credentials:${id}`)]);
      for (let i = 0; i < 5; i++) assert.equal((await call("sessions/revoke-many", current, { scope: "all", password: "wrong" })).status, 403);
      assert.equal((await call("sessions/revoke-many", current, { scope: "all", password })).status, 429);
      assert.equal((await list(current)).sessions.length, 1);
    });
    await t.test("concurrent global revocations have one winner; a waiting password check cannot outlive a credential change", async () => {
      const firstReq = { shopper: { id }, shopperSessionHash: tokenHash(current.split("=")[1]) } as never;
      second = await login();
      const secondReq = { shopper: { id }, shopperSessionHash: tokenHash(second.split("=")[1]) } as never;
      const outcomes = await Promise.allSettled([
        shopperDevices(firstReq, { scope: "all", password }),
        shopperDevices(secondReq, { scope: "all", password }),
      ]);
      assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal((outcomes.find((r) => r.status === "rejected") as PromiseRejectedResult).reason.code, "SIGN_IN_REQUIRED");
      current = await login();
      const actor = { shopper: { id }, shopperSessionHash: tokenHash(current.split("=")[1]) } as never;
      const blocker = await pool.connect();
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM soso_shopper_users WHERE id=$1 FOR UPDATE", [id]);
      const changedHash = await hashShopperPassword("Synthetic changed current passphrase");
      const waiting = shopperDevices(actor, { scope: "all", password });
      const rejection = assert.rejects(waiting, { code: "PASSWORD_REQUIRED" });
      try {
        // Observe the request waiting on the user lock after its credential check.
        let isWaiting = false;
        for (let i = 0; i < 100; i++) {
          const result = await pool.query(`SELECT 1 FROM pg_stat_activity
            WHERE pid<>pg_backend_pid() AND wait_event_type='Lock'
            AND query='SELECT password_hash FROM soso_shopper_users WHERE id=$1 FOR UPDATE'`);
          if (result.rowCount) { isWaiting = true; break; }
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        assert(isWaiting, "credential check reached the serialized operation");
        await blocker.query("UPDATE soso_shopper_users SET password_hash=$2 WHERE id=$1", [id, changedHash]);
        await blocker.query("COMMIT");
      } finally { await blocker.query("ROLLBACK"); blocker.release(); }
      await rejection;
      assert.equal((await list(current)).sessions.length, 1);
      assert.equal((await list(outsider)).sessions.length, 1);
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("shopper passwords use per-account salts and reject incorrect or corrupt hashes", async () => {
  const password = "an example long passphrase";
  const a = await hashShopperPassword(password);
  const b = await hashShopperPassword(password);
  assert.notEqual(a, b);
  assert(!a.includes(password));
  assert(await checkShopperPassword(password, a));
  assert.equal(await checkShopperPassword(`${password}!`, a), false);
  assert.equal(await checkShopperPassword(password, "scrypt-v1$broken$hash"), false);
});

test("owned shopper registration, verification, recovery, session isolation and CSRF boundaries", async (t) => {
  const sent: Array<{ email: string; url: string; purpose: string }> = [];
  let mailReady = true;
  let smtpFails = false;
  const app = express();
  app.use(express.json(), cookieParser());
  app.use("/api", createShopperAuthRouter({
    async ready() {
      if (!mailReady) throw new ShopperError(503, "ACCOUNT_EMAIL_UNAVAILABLE", "Configure the mailbox first.");
      return { publicOrigin: "https://shopper.example.test" };
    },
    async send(input) { if (smtpFails) throw new Error("Synthetic SMTP failure"); sent.push(input); },
  }));
  app.get("/api/protected", loadShopperSession, async (req, res) => {
    try { res.json(await verifiedShopper(req)); }
    catch (error) { res.status((error as ShopperError).status).json({ code: (error as ShopperError).code }); }
  });
  app.post("/api/protected", loadShopperSession, requireShopperSameOrigin, (_req, res) => { res.json({ ok: true }); });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const email = `owned-${randomUUID()}@example.test`;
  const password = "A shopper-owned passphrase 42";
  const input = { name: "Synthetic Shopper", email, password };
  let cookie = "";
  let oldHash = "";
  let userId = "";
  let verificationToken = "";
  const request = async (path: string, body?: unknown, session?: string, origin: string | null = base) => fetch(`${base}/api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(origin ? { origin } : {}), ...(session ? { cookie: session } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const post = (route: string, body: unknown, session?: string, origin?: string | null) => request(`shopper-auth/${route}`, body, session, origin);
  const session = async (value?: string) => GetShopperAuthSessionResponse.parse(await (await request("shopper-auth/session", undefined, value)).json());
  const tokenFrom = (url: string) => new URLSearchParams(new URL(url).hash.slice(1)).get("token")!;

  try {
    await t.test("mailbox configuration fails closed before signup; anonymous status is private", async () => {
      const response = await request("shopper-auth/session");
      assert.match(response.headers.get("cache-control")!, /no-store/);
      assert.deepEqual(await response.json(), { user: null });
      mailReady = false;
      assert.equal((await post("register", input)).status, 503);
      assert.equal((await pool.query("SELECT id FROM soso_shopper_users WHERE email=$1", [email])).rowCount, 0);
      mailReady = true;
    });
    await t.test("cross-origin, absent-origin, short passwords and client verification flags are refused", async () => {
      assert.equal((await post("register", input, undefined, "https://attacker.example")).status, 403);
      assert.equal((await post("login", input, undefined, null)).status, 403);
      assert.equal((await post("register", { ...input, password: "short" })).status, 400);
      assert.equal((await post("register", { ...input, emailVerified: true })).status, 400);
    });
    await t.test("signup stores only a salted hash; duplicates do not replace password or identity", async () => {
      const registered = await post("register", input);
      assert.equal(registered.status, 200);
      const firstResult = await registered.json();
      assert.equal(registered.headers.get("set-cookie"), null);
      const [user] = (await pool.query("SELECT * FROM soso_shopper_users WHERE email=$1", [email])).rows;
      userId = user.id;
      oldHash = user.password_hash;
      assert.notEqual(oldHash, password);
      assert.equal(user.email_verified_at, null);
      verificationToken = tokenFrom(sent[0].url);
      assert.equal(new URL(sent[0].url).search, "");
      const tokenRow = (await pool.query("SELECT token_hash FROM soso_shopper_auth_tokens WHERE user_id=$1", [userId])).rows[0];
      assert.equal(tokenRow.token_hash, tokenHash(verificationToken));
      assert.notEqual(tokenRow.token_hash, verificationToken);
      const duplicate = await post("register", { ...input, password: "replacement password not allowed" });
      assert.deepEqual(await duplicate.json(), firstResult);
      assert.equal((await pool.query("SELECT password_hash FROM soso_shopper_users WHERE id=$1", [userId])).rows[0].password_hash, oldHash);
      assert.equal(await checkShopperPassword("replacement password not allowed", oldHash), false);
    });
    await t.test("login is secure, pending email cannot access profiles, guessed passwords disclose no identity", async () => {
      const wrong = await post("login", { email, password: "an incorrect password" });
      const unknown = await post("login", { email: `absent-${randomUUID()}@example.test`, password });
      assert.equal(wrong.status, 401);
      assert.equal(unknown.status, 401);
      assert.deepEqual(await wrong.json(), await unknown.json());
      const login = await post("login", { email: email.toUpperCase(), password });
      assert.equal(login.status, 200);
      const setCookie = login.headers.get("set-cookie")!;
      assert.match(setCookie, /HttpOnly/);
      assert.match(setCookie, /SameSite=Lax/);
      assert.match(setCookie, /Path=\//);
      cookie = setCookie.split(";")[0];
      assert.equal(GetShopperAuthSessionResponse.parse(await login.json()).user!.emailVerified, false);
      assert.equal((await request("protected", undefined, cookie)).status, 403);
      const storedSession = (await pool.query("SELECT token_hash FROM soso_shopper_sessions WHERE user_id=$1", [userId])).rows[0];
      assert.equal(storedSession.token_hash, tokenHash(cookie.split("=")[1]));
      assert.equal((await request("protected", {}, cookie, null)).status, 403);
      assert.equal((await post("resend-verification", {}, cookie)).status, 200);
    });
    await t.test("one-time verification serializes, does not grant a session, and trusts only server identity", async () => {
      const wrong = await post("verify-email", { token: verificationToken, password: "replacement password not allowed" });
      assert.equal(wrong.status, 400);
      assert.equal((await wrong.json() as { code: string }).code, "AUTH_LINK_PASSWORD_MISMATCH");
      assert.equal((await session(cookie)).user!.emailVerified, false);
      const outcomes = await Promise.all([post("verify-email", { token: verificationToken, password }), post("verify-email", { token: verificationToken, password })]);
      assert.deepEqual(outcomes.map((response) => response.status).sort(), [200, 400]);
      for (const response of outcomes) assert.equal(response.headers.get("set-cookie"), null);
      const status = await session(cookie);
      assert.equal(status.user!.emailVerified, true);
      const identity = await (await request("protected", undefined, cookie)).json() as { email: string; subject: string; externalId: string };
      assert.equal(identity.email, email);
      assert.equal(identity.subject, userId);
      assert.match(identity.externalId, /^soso:[a-f0-9]{64}$/);
      assert.deepEqual(await session(`soso_staff_session=${cookie.split("=")[1]}`), { user: null });
      assert.deepEqual(await session(`${SHOPPER_SESSION_COOKIE}=malformed`), { user: null });
      assert.deepEqual(await checkoutShopper({} as never, email), {});
      assert.deepEqual(await checkoutShopper({ shopper: { id: userId, email, name: input.name, emailVerified: false } } as never, email), {});
    });
    await t.test("recovery never reveals account existence and wrong-purpose or expired links cannot change a password", async () => {
      const known = await post("forgot-password", { email });
      const unknown = await post("forgot-password", { email: `absent-${randomUUID()}@example.test` });
      assert.deepEqual(await known.json(), await unknown.json());
      const resetToken = tokenFrom(sent.at(-1)!.url);
      assert.equal((await post("verify-email", { token: resetToken, password })).status, 400);
      const user = (await pool.query("SELECT * FROM soso_shopper_users WHERE id=$1", [userId])).rows[0];
      const expired = await issueAuthToken(user, "reset_password");
      await pool.query("UPDATE soso_shopper_auth_tokens SET expires_at=now()-interval '1 second' WHERE token_hash=$1", [tokenHash(expired)]);
      assert.equal((await post("reset-password", { token: expired, password: "A new secure password" })).status, 400);
      assert.equal((await session(cookie)).user!.id, userId);
    });
    await t.test("password reset revokes all sessions, rejects replay, rotates credentials and fences stale logins", async () => {
      const login2 = await post("login", { email, password });
      const cookie2 = login2.headers.get("set-cookie")!.split(";")[0];
      const resetToken = tokenFrom(sent.filter((mail) => mail.purpose === "reset_password").at(-1)!.url);
      const newPassword = "The new shopper passphrase 43";
      const outcomes = await Promise.all([
        post("reset-password", { token: resetToken, password: newPassword }),
        post("reset-password", { token: resetToken, password: newPassword }),
      ]);
      assert.deepEqual(outcomes.map((response) => response.status).sort(), [200, 400]);
      assert.deepEqual(await session(cookie), { user: null });
      assert.deepEqual(await session(cookie2), { user: null });
      await assert.rejects(createShopperSession({} as never, { cookie() {} } as never, userId, oldHash), { code: "INVALID_CREDENTIALS" });
      assert.equal((await post("login", { email, password })).status, 401);
      const loggedIn = await post("login", { email, password: newPassword });
      assert.equal(loggedIn.status, 200);
      cookie = loggedIn.headers.get("set-cookie")!.split(";")[0];
      assert.equal((await post("logout", {}, cookie, "https://attacker.example")).status, 403);
      assert.equal((await session(cookie)).user!.id, userId);
      assert.equal((await post("logout", {}, cookie)).status, 200);
      assert.deepEqual(await session(cookie), { user: null });
      assert.equal((await request("protected", undefined, cookie)).status, 401);
    });
    await t.test("rate counters are shared, atomic and contain no raw email", async () => {
      const key = `auth:synthetic:${randomUUID()}@example.test`;
      const outcomes = await Promise.allSettled(Array.from({ length: 5 }, () => authRateLimit(key, 3, 900)));
      assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 3);
      const rows = await pool.query("SELECT key,hits FROM soso_shopper_auth_limits WHERE key=$1", [tokenHash(key)]);
      assert.equal(rows.rows[0].hits, 5);
      assert.equal(rows.rows[0].key.includes("@"), false);
    });
    await t.test("SMTP uncertainty is not falsely reported as delivered or used to enumerate accounts", async () => {
      smtpFails = true;
      const known = await post("forgot-password", { email });
      const unknown = await post("forgot-password", { email: `absent-${randomUUID()}@example.test` });
      assert.equal(known.status, 200);
      assert.deepEqual(await known.json(), await unknown.json());
      assert.equal(sent.filter((mail) => mail.purpose === "reset_password").length, 1);
      await assert.rejects(consumeAuthToken("a".repeat(43), "verify_email"), { code: "AUTH_LINK_INVALID" });
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
