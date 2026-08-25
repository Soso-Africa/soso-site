import React, { FormEvent, useState } from 'react';
import { useLocation } from "wouter";
import { customFetch } from "@workspace/api-client-react";

export default function SignInPage() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [initialSetup, setInitialSetup] = useState(false);
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSubmitting(true); setNotice("");
    try {
      await customFetch(initialSetup ? "/api/staff-auth/bootstrap" : "/api/staff-auth/login", {
        method: "POST",
        body: JSON.stringify(initialSetup ? { email, password, token: setupToken } : { email, password }),
      });
      navigate("/staff", { replace: true });
    } catch { setNotice("The email address or password is incorrect."); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center bg-background px-4 py-12 relative overflow-hidden fade-in">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[50%] bg-primary/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/5 blur-[120px] rounded-full" />
      </div>

      <div className="w-full max-w-md relative z-10 flex flex-col items-center">
        <div className="mb-10 text-center">
          <h1 className="text-4xl soso-display text-foreground mb-4">Welcome Back</h1>
          <p className="text-muted-foreground uppercase tracking-widest text-sm font-medium">
            SOSO staff portal
          </p>
        </div>

        <form onSubmit={submit} className="w-full border border-border/60 bg-card p-6 shadow-2xl">
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Staff email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="staff-input mt-2" autoComplete="email" /></label>
          {initialSetup && <label className="mt-5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">One-time setup token<input required type="password" value={setupToken} onChange={(event) => setSetupToken(event.target.value)} className="staff-input mt-2" autoComplete="off" /></label>}
          <label className="mt-5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">{initialSetup ? "Create owner password" : "Password"}<input required minLength={initialSetup ? 12 : undefined} type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="staff-input mt-2" autoComplete={initialSetup ? "new-password" : "current-password"} /></label>
          {notice && <p role="alert" className="mt-4 text-sm text-destructive">{notice}</p>}
          <button disabled={submitting} className="mt-6 min-h-12 w-full bg-primary text-xs font-semibold uppercase tracking-widest text-primary-foreground disabled:opacity-50">{submitting ? "Signing in…" : initialSetup ? "Create owner account" : "Sign in"}</button>
          <button type="button" onClick={() => { setInitialSetup(!initialSetup); setNotice(""); }} className="mt-4 w-full text-xs text-primary underline underline-offset-4">{initialSetup ? "Back to staff sign in" : "First SOSO owner setup"}</button>
          <p className="mt-5 text-center text-xs leading-relaxed text-muted-foreground">{initialSetup ? "Use this once only, with the setup token stored in the production environment-variable settings." : "Access is issued by a SOSO owner. Contact an owner if you need an account or password reset."}</p>
        </form>
      </div>
    </div>
  );
}
