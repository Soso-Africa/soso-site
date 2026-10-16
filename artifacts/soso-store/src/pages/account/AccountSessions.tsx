import { useState, type FormEvent } from "react";
import { Link, Redirect } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListShopperSessionsQueryKey, useListShopperSessions, useRevokeShopperSession, useRevokeShopperSessions,
} from "@workspace/api-client-react";
import { useOwnedShopperAuth } from "@/components/account/OwnedShopperAuthProvider";
import { apiErrorInfo, shopperScopedKey } from "@/components/account/ShopperClerkProvider";

export default function AccountSessions() {
  const auth = useOwnedShopperAuth();
  const client = useQueryClient();
  const key = shopperScopedKey(getListShopperSessionsQueryKey(), auth.userId);
  const sessions = useListShopperSessions({
    query: { queryKey: key, enabled: auth.isLoaded && auth.isSignedIn, retry: false, staleTime: 0, refetchInterval: 60_000, refetchOnWindowFocus: true },
  });
  const [scope, setScope] = useState<"others" | "all" | null>(null);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const single = useRevokeShopperSession();
  const many = useRevokeShopperSessions();
  const busy = single.isPending || many.isPending;

  const failed = async (e: unknown) => {
    const info = apiErrorInfo(e);
    setError(info.message ?? "Nothing was signed out. Please try again.");
    if (info.status === 401) await auth.identityChanged();
  };
  const revoke = async (id: string) => {
    setError(""); setMessage("");
    try {
      const next = await single.mutateAsync({ data: { id } });
      client.setQueryData(key, next);
      setMessage("The other device has been signed out.");
    } catch (e) { await failed(e); }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!scope) return;
    const chosen = scope;
    setError(""); setMessage("");
    try {
      const next = await many.mutateAsync({ data: { scope: chosen, password } });
      client.setQueryData(key, next);
      setScope(null);
      if (chosen === "all") await auth.identityChanged();
      else setMessage("All other devices have been signed out. This device stays signed in.");
    } catch (e) { await failed(e); }
    finally { setPassword(""); many.reset(); }
  };
  if (!auth.isLoaded) return <p role="status" className="p-12">Loading your account…</p>;
  if (!auth.isSignedIn) return <Redirect to="/sign-in" />;
  return (
    <div className="mx-auto max-w-3xl px-6 py-12 lg:px-12">
      <Link href="/" className="text-sm underline underline-offset-4">Back to my account</Link>
      <h1 className="soso-display mt-6 text-4xl">Signed-in devices</h1>
      <p className="mt-4 text-sm text-secondary">Sign out a lost or unfamiliar device. Browser and device names are approximate hints, not verified identities. Last activity can be delayed by a few minutes. These controls affect only your shopper account, not Staff or guest checkout.</p>
      {message && <p role="status" className="mt-5 text-sm">{message}</p>}
      {error && <p role="alert" className="mt-5 text-sm text-destructive">{error}</p>}
      {sessions.isLoading && <p role="status" className="mt-6">Loading devices…</p>}
      {sessions.isError ? <div className="mt-6">
        <p role="alert">{apiErrorInfo(sessions.error).message ?? "Your devices could not be loaded."}</p>
        <button onClick={() => { void auth.refresh(); void sessions.refetch(); }} className="mt-3 underline">Refresh devices</button>
      </div> : <ul className="mt-8 divide-y border-y border-border">
        {sessions.data?.sessions.map((session) => <li key={session.id} className="flex flex-wrap items-center justify-between gap-4 py-5">
          <div>
            <p className="font-semibold">{session.deviceLabel}{session.current ? " · This device" : ""}</p>
            <p className="mt-1 text-xs text-secondary">Signed in: {new Date(session.createdAt).toLocaleString()}</p>
            <p className="mt-1 text-xs text-secondary">Last active: {new Date(session.lastActiveAt).toLocaleString()}</p>
            <p className="mt-1 text-xs text-secondary">Expires: {new Date(session.expiresAt).toLocaleString()}</p>
          </div>
          {!session.current && <button disabled={busy} onClick={() => void revoke(session.id)} className="border border-border px-4 py-3 text-xs uppercase tracking-wider disabled:opacity-50">Sign out this device</button>}
        </li>)}
      </ul>}
      <div className="mt-8 flex flex-wrap gap-4">
        <button disabled={busy} onClick={() => { setScope("others"); setPassword(""); setError(""); }} className="border border-border px-5 py-3 text-sm disabled:opacity-50">Sign out all other devices</button>
        <button disabled={busy} onClick={() => { setScope("all"); setPassword(""); setError(""); }} className="bg-foreground px-5 py-3 text-sm text-background disabled:opacity-50">Sign out everywhere</button>
      </div>
      {scope && <form onSubmit={submit} className="mt-6 border border-border p-6">
        <h2 className="font-semibold">{scope === "all" ? "Sign out every device, including this one?" : "Sign out every other device?"}</h2>
        <p className="mt-2 text-sm text-secondary">{scope === "all" ? "You will need to sign in again. Your cart is not deleted." : "This device stays signed in."} Confirm your current password to continue.</p>
        <label className="mt-4 block text-sm">Current password
          <input type="password" autoComplete="current-password" required maxLength={128} value={password} disabled={busy} onChange={(e) => setPassword(e.target.value)} className="soso-account-input mt-2" />
        </label>
        <div className="mt-4 flex gap-5">
          <button disabled={busy} className="bg-foreground px-5 py-3 text-sm text-background disabled:opacity-50">{busy ? "Signing out…" : "Confirm sign out"}</button>
          <button type="button" disabled={busy} onClick={() => { setScope(null); setPassword(""); }} className="text-sm underline">Cancel</button>
        </div>
      </form>}
    </div>
  );
}
