import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  useLoginShopperAuth, useRegisterShopperAuth, useRequestShopperPasswordReset, useResendShopperVerification,
  useResetShopperPassword, useVerifyShopperEmail,
} from "@workspace/api-client-react";
import { LogOut, MailCheck, RotateCw } from "lucide-react";
import { BrandLockup } from "@/components/BrandLockup";
import { PASSWORD_MAX, PASSWORD_MIN, parseFragmentToken, safeAccountNext, urlWithoutFragment, validateNewPassword } from "@/lib/shopper-auth";
import { useOwnedShopperAuth } from "./OwnedShopperAuthProvider";
import { apiErrorInfo, appHref } from "./ShopperClerkProvider";

const primary = "w-full bg-foreground py-4 text-xs font-bold uppercase tracking-[0.2em] text-background transition-opacity hover:opacity-85 disabled:opacity-50";
const label = "block text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground";
const linkCls = "font-semibold text-[#8a6a22] underline underline-offset-4";

export function AuthFrame({ eyebrow, note, children }: { eyebrow: string; note?: ReactNode; children: ReactNode }) {
  return (
    <div className="relative min-h-[80dvh] overflow-hidden bg-[#f6f1e7]">
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 hidden w-[38%] border-r border-[#e4ddcf] bg-[#262626] lg:block">
        <div className="flex h-full flex-col justify-between p-12 text-[#f6f1e7]">
          <BrandLockup variant="white" size="footer" />
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-[#d4b45a]">{eyebrow}</p>
            <p className="soso-display mt-5 max-w-xs text-3xl leading-snug">Your details saved. Your orders in view.</p>
          </div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-white/50">Lagos · Abuja · Worldwide</p>
        </div>
      </div>
      <div className="relative flex min-h-[80dvh] flex-col items-center justify-center px-4 py-14 lg:ml-[38%]">
        <div className="soso-rise w-full max-w-[440px]">{children}</div>
        {note && <div className="mt-6 max-w-[440px] text-center text-xs leading-relaxed text-[#5c564d]">{note}</div>}
      </div>
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="border border-[#e4ddcf] bg-[#fbf8f2] p-7 md:p-9">
      <h1 className="text-2xl font-medium tracking-[0.04em] text-[#262626]">{title}</h1>
      {subtitle && <p className="mt-2 text-sm leading-relaxed text-[#5c564d]">{subtitle}</p>}
      <div className="mt-7">{children}</div>
    </div>
  );
}

function Alert({ children, tone = "error", testId }: { children: ReactNode; tone?: "error" | "info"; testId?: string }) {
  const cls = tone === "error" ? "border-[#f1c6c0] bg-[#fdf1ef] text-[#7a1d14]" : "border-[#d9d0bf] bg-white text-[#262626]";
  return <div role={tone === "error" ? "alert" : "status"} data-testid={testId} className={`border px-4 py-3 text-sm leading-relaxed ${cls}`}>{children}</div>;
}

function requestError(error: unknown, fallback: string) {
  const info = apiErrorInfo(error);
  if (info.status === 429) return "Too many attempts. Please wait a few minutes and try again.";
  if (info.status === null) return "We could not reach SOSO. Check your connection and try again.";
  return info.message ?? fallback;
}

function Field(props: { id: string; label: string; type?: string; value: string; onChange: (v: string) => void; autoComplete?: string; maxLength?: number; minLength?: number }) {
  return (
    <label className={label} htmlFor={props.id}>{props.label}
      <input
        id={props.id} required type={props.type ?? "text"} value={props.value} autoComplete={props.autoComplete}
        maxLength={props.maxLength} minLength={props.minLength}
        onChange={(e) => props.onChange(e.target.value)} className="soso-account-input mt-2 bg-white text-sm normal-case tracking-normal"
        data-testid={`input-${props.id}`}
      />
    </label>
  );
}

/** Reads the fragment token once into state and removes it from the address bar. Never submits. */
function useFragmentToken() {
  const [token] = useState(() => (typeof window === "undefined" ? null : parseFragmentToken(window.location.hash)));
  useEffect(() => {
    if (window.location.hash) {
      try { window.history.replaceState(window.history.state, "", urlWithoutFragment(window.location.href)); } catch { /* ignore */ }
    }
  }, []);
  return token;
}

export function SignInPage() {
  const auth = useOwnedShopperAuth();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const next = safeAccountNext(new URLSearchParams(window.location.search).get("next"));
  const login = useLoginShopperAuth({
    mutation: {
      onSuccess: async (session) => {
        await auth.applySession(session);
        setLocation(appHref(next), { replace: true });
      },
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (login.isPending) return;
    login.mutate({ data: { email: email.trim(), password } });
  };
  const err = apiErrorInfo(login.error);
  return (
    <AuthFrame eyebrow="Shopper account" note={<Link href="~/" className="underline underline-offset-4" data-testid="link-continue-shopping">Continue shopping</Link>}>
      <Card title="Welcome back" subtitle="Sign in to your SOSO account">
        {auth.isSignedIn && (
          <div className="mb-5"><Alert tone="info">You are already signed in as {auth.email}. <Link href={appHref("/account")} className={linkCls}>Open my account</Link></Alert></div>
        )}
        <form onSubmit={submit} className="space-y-5" noValidate={false}>
          <Field id="email" label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" maxLength={254} />
          <Field id="password" label="Password" type="password" value={password} onChange={setPassword} autoComplete="current-password" maxLength={PASSWORD_MAX} />
          {login.isError && (
            <Alert testId="text-sign-in-error">
              {err.status === 401 || err.status === 400 ? "That email and password do not match an account." : requestError(login.error, "We could not sign you in.")}
            </Alert>
          )}
          <button disabled={login.isPending} className={primary} data-testid="button-sign-in">{login.isPending ? "Signing in..." : "Sign in"}</button>
        </form>
        <div className="mt-6 flex flex-wrap justify-between gap-3 text-xs">
          <Link href={appHref("/account/forgot-password")} className={linkCls} data-testid="link-forgot-password">Forgot password</Link>
          <span className="text-[#5c564d]">New here? <Link href={appHref("/account/sign-up")} className={linkCls} data-testid="link-sign-up">Create an account</Link></span>
        </div>
      </Card>
    </AuthFrame>
  );
}

export function SignUpPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);
  const register = useRegisterShopperAuth();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const problem = !name.trim() ? "Enter your name." : validateNewPassword(password, confirm);
    setClientError(problem);
    if (problem || register.isPending) return;
    register.mutate({ data: { name: name.trim(), email: email.trim(), password } });
  };
  const note = <>Creating an account never subscribes you to marketing emails. Guest checkout remains available at any time.</>;
  if (register.isSuccess) {
    return (
      <AuthFrame eyebrow="New account" note={note}>
        <Card title="Check your inbox">
          <p className="flex gap-3 text-sm leading-relaxed text-[#262626]" data-testid="text-sign-up-success">
            <MailCheck size={18} className="mt-0.5 shrink-0 text-[#8a6a22]" />
            <span>{register.data.message || "If this email can be used, we have sent a link to verify it."}</span>
          </p>
          <p className="mt-4 text-sm leading-relaxed text-[#5c564d]">Open the email from SOSO Africa and follow the verification link, then sign in. The link expires, so use it soon. If nothing arrives, check spam, or sign in and ask for a new link.</p>
          <Link href={appHref("/account/sign-in")} className={`${primary} mt-7 inline-block text-center`} data-testid="link-go-sign-in">Go to sign in</Link>
        </Card>
      </AuthFrame>
    );
  }
  return (
    <AuthFrame eyebrow="New account" note={note}>
      <Card title="Create your SOSO account" subtitle="Save your details and follow your orders">
        <form onSubmit={submit} className="space-y-5">
          <Field id="name" label="Full name" value={name} onChange={setName} autoComplete="name" maxLength={100} />
          <Field id="email" label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" maxLength={254} />
          <Field id="password" label={`Password (${PASSWORD_MIN}+ characters)`} type="password" value={password} onChange={setPassword} autoComplete="new-password" minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX} />
          <Field id="confirm-password" label="Confirm password" type="password" value={confirm} onChange={setConfirm} autoComplete="new-password" maxLength={PASSWORD_MAX} />
          {clientError && <Alert testId="text-sign-up-validation">{clientError}</Alert>}
          {register.isError && !clientError && <Alert testId="text-sign-up-error">{requestError(register.error, "We could not create your account.")}</Alert>}
          <button disabled={register.isPending} className={primary} data-testid="button-sign-up">{register.isPending ? "Creating..." : "Create account"}</button>
        </form>
        <p className="mt-6 text-xs text-[#5c564d]">Already registered? <Link href={appHref("/account/sign-in")} className={linkCls} data-testid="link-sign-in">Sign in</Link></p>
      </Card>
    </AuthFrame>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const request = useRequestShopperPasswordReset();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!request.isPending) request.mutate({ data: { email: email.trim() } });
  };
  return (
    <AuthFrame eyebrow="Password reset">
      <Card title="Reset your password" subtitle="Enter your account email and we will send a reset link.">
        {request.isSuccess ? (
          <>
            <Alert tone="info" testId="text-forgot-success">{request.data.message || "If an account uses that email, a reset link is on its way."}</Alert>
            <p className="mt-4 text-sm text-[#5c564d]">The link expires. Request another here if it does.</p>
            <button type="button" onClick={() => request.reset()} className={`${linkCls} mt-5 text-xs`} data-testid="button-forgot-again">Send to another email</button>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-5">
            <Field id="email" label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" maxLength={254} />
            {request.isError && <Alert testId="text-forgot-error">{requestError(request.error, "We could not send a reset link.")}</Alert>}
            <button disabled={request.isPending} className={primary} data-testid="button-send-reset">{request.isPending ? "Sending..." : "Send reset link"}</button>
          </form>
        )}
        <p className="mt-6 text-xs"><Link href={appHref("/account/sign-in")} className={linkCls} data-testid="link-back-sign-in">Back to sign in</Link></p>
      </Card>
    </AuthFrame>
  );
}

export function ResetPasswordPage() {
  const token = useFragmentToken();
  const auth = useOwnedShopperAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);
  const reset = useResetShopperPassword({ mutation: { onSuccess: () => { void auth.identityChanged(); } } });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const problem = validateNewPassword(password, confirm);
    setClientError(problem);
    if (problem || !token || reset.isPending) return;
    reset.mutate({ data: { token, password } });
  };
  const recover = <Link href={appHref("/account/forgot-password")} className={linkCls} data-testid="link-request-new-reset">Request a new reset link</Link>;
  return (
    <AuthFrame eyebrow="Password reset">
      <Card title="Choose a new password">
        {reset.isSuccess ? (
          <>
            <Alert tone="info" testId="text-reset-success">{reset.data.message || "Your password has been changed."} Every earlier session has been signed out.</Alert>
            <Link href={appHref("/account/sign-in")} className={`${primary} mt-6 inline-block text-center`} data-testid="link-reset-sign-in">Sign in with your new password</Link>
          </>
        ) : !token ? (
          <Alert testId="text-reset-missing-token">This reset link is incomplete or has already been opened here. {recover}.</Alert>
        ) : (
          <form onSubmit={submit} className="space-y-5">
            <Field id="password" label={`New password (${PASSWORD_MIN}+ characters)`} type="password" value={password} onChange={setPassword} autoComplete="new-password" minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX} />
            <Field id="confirm-password" label="Confirm new password" type="password" value={confirm} onChange={setConfirm} autoComplete="new-password" maxLength={PASSWORD_MAX} />
            {clientError && <Alert testId="text-reset-validation">{clientError}</Alert>}
            {reset.isError && !clientError && (
              <Alert testId="text-reset-error">
                {apiErrorInfo(reset.error).status === null || apiErrorInfo(reset.error).status === 429 || (apiErrorInfo(reset.error).status ?? 0) >= 500
                  ? requestError(reset.error, "We could not change your password.")
                  : <>This reset link is invalid, expired or already used. {recover}.</>}
              </Alert>
            )}
            <button disabled={reset.isPending} className={primary} data-testid="button-reset-password">{reset.isPending ? "Saving..." : "Change password"}</button>
          </form>
        )}
      </Card>
    </AuthFrame>
  );
}

export function ResendVerification({ compact = false }: { compact?: boolean }) {
  const resend = useResendShopperVerification();
  return (
    <div className={compact ? "" : "mt-5"}>
      <button type="button" disabled={resend.isPending} onClick={() => resend.mutate()} className={`${linkCls} text-xs disabled:opacity-50`} data-testid="button-resend-verification">
        {resend.isPending ? "Sending..." : "Send a new verification link"}
      </button>
      {resend.isSuccess && <p role="status" className="mt-2 text-xs text-[#2f6b3a]" data-testid="text-resend-success">{resend.data.message || "A new link is on its way."}</p>}
      {resend.isError && <p role="alert" className="mt-2 text-xs text-destructive" data-testid="text-resend-error">{requestError(resend.error, "We could not send a new link.")}</p>}
    </div>
  );
}

export function VerifyEmailPage() {
  const token = useFragmentToken();
  const [password, setPassword] = useState("");
  const auth = useOwnedShopperAuth();
  const verify = useVerifyShopperEmail({ mutation: { onSuccess: () => { void auth.identityChanged(); } } });
  const recover = auth.isSignedIn
    ? <ResendVerification />
    : <p className="mt-4 text-sm">Sign in to request a new link. <Link href={appHref("/account/sign-in")} className={linkCls} data-testid="link-verify-sign-in">Sign in</Link></p>;
  return (
    <AuthFrame eyebrow="Verify email">
      <Card title="Confirm your email">
        {verify.isSuccess ? (
          <>
            <Alert tone="info" testId="text-verify-success">{verify.data.message || "Your email is verified."}</Alert>
            <Link href={appHref(auth.isSignedIn ? "/account" : "/account/sign-in")} className={`${primary} mt-6 inline-block text-center`} data-testid="link-verify-continue">
              {auth.isSignedIn ? "Open my account" : "Sign in"}
            </Link>
          </>
        ) : !token ? (
          <><Alert testId="text-verify-missing-token">This verification link is incomplete or has already been opened here.</Alert>{recover}</>
        ) : (
          <form onSubmit={(event) => { event.preventDefault(); if (password && !verify.isPending) verify.mutate({ data: { token, password } }); }} className="space-y-5">
            <p className="text-sm leading-relaxed text-[#5c564d]">Enter the password you chose at signup, then confirm your email. This protects you if someone else tried to register your address.</p>
            <Field id="verification-password" label="Account password" type="password" value={password} onChange={setPassword} autoComplete="current-password" maxLength={PASSWORD_MAX} />
            {verify.isError && (
              <div className="mt-5">
                <Alert testId="text-verify-error">
                  {apiErrorInfo(verify.error).code === "AUTH_LINK_PASSWORD_MISMATCH"
                    ? <>{apiErrorInfo(verify.error).message} <Link href={appHref("/account/forgot-password")} className={linkCls}>Forgot password</Link></>
                    : apiErrorInfo(verify.error).status === null || apiErrorInfo(verify.error).status === 429 || (apiErrorInfo(verify.error).status ?? 0) >= 500
                    ? requestError(verify.error, "We could not verify your email.")
                    : "This verification link is invalid, expired or already used."}
                </Alert>
                {recover}
              </div>
            )}
            <button disabled={verify.isPending} className={`${primary} mt-6`} data-testid="button-verify-email">
              {verify.isPending ? "Confirming..." : "Confirm my email"}
            </button>
          </form>
        )}
      </Card>
    </AuthFrame>
  );
}

export function SignOutButton({ className = "", redirectTo = "/" }: { className?: string; redirectTo?: string }) {
  const auth = useOwnedShopperAuth();
  const [, setLocation] = useLocation();
  const [failed, setFailed] = useState(false);
  const run = () => {
    setFailed(false);
    auth.signOut().then(() => setLocation(appHref(redirectTo), { replace: true }), () => setFailed(true));
  };
  return (
    <span className="inline-flex flex-col gap-1">
      <button type="button" data-testid="button-sign-out" disabled={auth.signOutPending} onClick={run}
        className={`inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-secondary hover:text-foreground disabled:opacity-50 ${className}`}>
        <LogOut size={14} /> {auth.signOutPending ? "Signing out..." : "Sign out"}
      </button>
      {failed && <span role="alert" className="text-xs normal-case tracking-normal text-destructive" data-testid="text-sign-out-error">Sign-out did not complete. Check your connection and try again.</span>}
    </span>
  );
}

/** Pending-email shoppers land here; no private data hook runs. */
export function VerifyPendingPanel() {
  const auth = useOwnedShopperAuth();
  const [checking, setChecking] = useState(false);
  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-lg flex-col justify-center px-6 py-16" data-testid="panel-verify-pending">
      <p className="text-[11px] uppercase tracking-[0.3em] text-secondary">Your account</p>
      <h1 className="soso-display mt-3 text-3xl md:text-4xl">Verify your email first</h1>
      <p className="mt-6 flex gap-3 text-sm leading-relaxed text-secondary">
        <MailCheck className="mt-0.5 shrink-0 text-[#8a6a22]" size={18} />
        <span>Your saved details, measurements and orders open once <span className="font-semibold text-foreground">{auth.email}</span> is verified. Follow the link we emailed you.</span>
      </p>
      <ResendVerification />
      <div className="mt-7 flex flex-wrap items-center gap-5">
        <button type="button" disabled={checking} onClick={() => { setChecking(true); void auth.refresh().finally(() => setChecking(false)); }}
          className="inline-flex items-center gap-2 bg-foreground px-5 py-3 text-xs font-bold uppercase tracking-[0.2em] text-background disabled:opacity-50" data-testid="button-check-verified">
          <RotateCw size={14} /> I have verified
        </button>
        <SignOutButton />
        <Link href="/sessions" className="text-sm underline underline-offset-4">Signed-in devices</Link>
      </div>
    </div>
  );
}
