import React, { useEffect, useState } from "react";
import { useGetStaffMediaStorageStatus } from "@workspace/api-client-react";
import { CloudinaryUsagePanel } from "./CloudinaryUsagePanel";

export function MediaStoragePanel({ staffId, role }: { staffId: string; role: string }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const query = useGetStaffMediaStorageStatus({ query: {
    queryKey: ["staff-media-storage-status", staffId, role], staleTime: 60 * 60_000,
    retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false,
  } });
  if (query.isError) return <section className="mt-6 border border-border p-5">
    <p role="alert">Media storage status could not be loaded. No current capacity or billing information is available.</p>
    <button type="button" onClick={() => void query.refetch()} disabled={query.isFetching} className="mt-3 border border-border px-3 py-2">Retry status</button>
  </section>;
  if (!query.data) return <p role="status" className="mt-6">Loading media storage status…</p>;
  if (query.data.provider === "cloudinary") return <CloudinaryUsagePanel staffId={staffId} role={role} />;
  const usage = query.data.r2Usage;
  const snapshot = usage?.snapshot;
  const gb = (bytes: number) => `${(bytes / 1_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 3 })} GB (${bytes.toLocaleString()} bytes)`;
  const refreshBlocked = query.isFetching || Boolean(usage && now < Date.parse(usage.nextRefreshAt));
  return <section className="mt-6 max-w-4xl border border-border bg-background p-5 sm:p-7" aria-labelledby="r2-storage-heading">
    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">Active media service</p>
    <h2 id="r2-storage-heading" className="mt-1 text-2xl soso-display">Cloudflare R2 storage</h2>
    <p className="mt-2 text-sm text-muted-foreground">Stored objects in SOSO’s two application buckets. No Cloudinary usage request is made.</p>
    <p role="alert" className="mt-5 border border-amber-500/60 bg-amber-50/50 p-3 text-sm">
      Account billing and monthly request totals are not available here. The independent backup and other buckets are excluded.
      Check Cloudflare’s account usage and billing alerts before relying on free allowances. Alerts are not a hard spending cap.
    </p>
    {(!usage || usage.status !== "available" || !snapshot || now - Date.parse(snapshot.fetchedAt) >= 60 * 60_000) && <p role="status" className="mt-4 text-sm">
      {snapshot ? "Stale storage snapshot — not current capacity." : "No verified storage snapshot is available."} {usage?.message}
    </p>}
    {snapshot && <>
      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Private originals, drafts and renditions</dt><dd>{gb(snapshot.privateBytes)}</dd><dd>{snapshot.privateObjects.toLocaleString()} objects</dd></div>
        <div><dt className="text-muted-foreground">Approved public delivery</dt><dd>{gb(snapshot.publicBytes)}</dd><dd>{snapshot.publicObjects.toLocaleString()} objects</dd></div>
        <div><dt className="text-muted-foreground">Application subtotal — not account total</dt><dd>{gb(snapshot.privateBytes + snapshot.publicBytes)}</dd></div>
        <div><dt className="text-muted-foreground">Snapshot fetched</dt><dd>{new Date(snapshot.fetchedAt).toLocaleString()}</dd></div>
      </dl>
    </>}
    <p className="mt-4 text-xs text-muted-foreground">Staff share an hourly refresh limit, including failed inventories. Listing storage also consumes R2 requests. Next refresh: {usage ? new Date(usage.nextRefreshAt).toLocaleString() : "Unavailable"}.</p>
    <button type="button" onClick={() => void query.refetch()} disabled={refreshBlocked} className="mt-4 min-h-10 border border-border px-3 text-xs font-semibold uppercase tracking-wider disabled:opacity-50">
      {query.isFetching ? "Loading" : "Refresh storage"}
    </button>
  </section>;
}
