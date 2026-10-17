import React from "react";
import type { R2MediaOperations } from "@workspace/api-client-react";

export function MediaOperationsPanel({ report, now }: { report?: R2MediaOperations | null; now: number }) {
  const delivery = report?.delivery;
  const backup = report?.backup;
  const fresh = (value: string | null | undefined, hours: number) => {
    const timestamp = Date.parse(value || "");
    return Number.isFinite(timestamp) && timestamp <= now + 60_000 && now - timestamp < hours * 60 * 60_000;
  };
  const deliveryHealthy = delivery?.status === "healthy" && fresh(delivery.checkedAt, 2);
  const backupHealthy = backup?.status === "healthy" && fresh(backup.lastSuccessAt, 26);
  const time = (value?: string | null) => value ? new Date(value).toLocaleString() : "Not yet verified";
  return <div className="mt-6 border-t border-border pt-5" aria-labelledby="media-operations-heading">
    <h3 id="media-operations-heading" className="font-semibold">Automatic media protection</h3>
    <p className="mt-1 text-sm text-muted-foreground">Daily independent original backups and hourly anonymous delivery checks. Missing or stale evidence is not a successful check.</p>
    {!report && <p role="alert" className="mt-3 text-sm">Protection reports are unavailable. Check Cloudflare Workers before relying on automatic backups or photo delivery.</p>}
    <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
      <div><dt className="font-semibold">Storefront photo delivery</dt>
        <dd role={deliveryHealthy ? "status" : "alert"}>{deliveryHealthy ? "Verified" : delivery?.status === "failed" ? "Failed" : "Unverified or stale"}</dd>
        <dd>Last check: {time(delivery?.checkedAt)}</dd>
        <dd>{delivery?.checkedCases ?? 0} original/responsive cases; private access {delivery?.privateDenial ? "denied" : "not verified"}.</dd>
        {delivery?.message && <dd className="mt-1">{delivery.message}</dd>}
      </div>
      <div><dt className="font-semibold">Independent original backup</dt>
        <dd role={backupHealthy ? "status" : "alert"}>{backupHealthy ? "Verified" : backup?.status === "running" && fresh(backup.lastAttemptAt, 1 / 3) ? "Running — not yet verified" : "Incomplete, unavailable or stale"}</dd>
        <dd>Last completed backup: {time(backup?.lastSuccessAt)}</dd>
        <dd>Pending originals: {backup?.pending ?? "Unknown"}</dd>
        <dd>Additional storage reserved: {backup ? `${(backup.reservedBytes / 1_000_000).toFixed(1)} MB of 1,000 MB` : "Unknown"}</dd>
        {backup?.messages.map((message, index) => <dd className="mt-1" key={index}>{message}</dd>)}
      </div>
    </dl>
    <p className="mt-4 text-xs text-muted-foreground">The daily backup allows up to 100 MB and a bounded number of originals per run; unfinished files remain pending. The 1 GB additional-storage guard includes a metadata reserve. These are job safeguards, not account billing caps. Files uploaded since the last backup are not yet independently protected.</p>
    {(!deliveryHealthy || !backupHealthy) && <p role="alert" className="mt-3 border border-amber-500/60 p-3 text-sm">
      Open Cloudflare → Workers &amp; Pages → SOSO media operations → invocation errors and schedules.
      For delivery failures check the media custom domain, DNS/TLS and affected object first. For backup failures review the private checkpoint and limits.
      Do not expose drafts, delete old backups or switch back to Cloudinary to clear this warning.
    </p>}
  </div>;
}
