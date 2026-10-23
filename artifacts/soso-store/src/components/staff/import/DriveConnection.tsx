import { useCallback, useEffect, useRef, useState } from "react";
import {
  authorizeCatalogueGoogle, disconnectCatalogueGoogle, getCatalogueGoogleStatus,
  listCatalogueGoogleFolders, selectCatalogueGoogleFolder,
  type CatalogueGoogleStatus, type CatalogueGoogleFolder,
} from "@workspace/api-client-react";

const button = "min-h-10 border border-border bg-background px-3 text-xs disabled:opacity-50";
const message = (error: unknown) => error instanceof Error ? error.message : "Drive is unavailable. Retry or use local photo folders.";

/** This picker uses server-side read-only Drive API calls; Google credentials never enter the browser. */
export function DriveConnection({ folders, busy, onDisconnect, beforeConnect, onStatusChange }: {
  folders: { id: string; product: string }[];
  busy: boolean;
  onDisconnect: () => void;
  beforeConnect: () => Promise<void>;
  onStatusChange: (status: CatalogueGoogleStatus | null) => void;
}) {
  const [status, setStatus] = useState<CatalogueGoogleStatus | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(() => new URLSearchParams(window.location.search).get("drive") === "failed"
    ? "Google authorization was cancelled, expired, or could not be verified. Connect again or use local folders." : "");
  const [working, setWorking] = useState(false);
  const [search, setSearch] = useState("");
  const [choices, setChoices] = useState<CatalogueGoogleFolder[] | null>(null);
  const [more, setMore] = useState(false);
  const mounted = useRef(true);
  const onStatusRef = useRef(onStatusChange);
  onStatusRef.current = onStatusChange;
  const refresh = useCallback(async () => {
    try {
      const result = await getCatalogueGoogleStatus();
      if (mounted.current) { setStatus(result); setError(""); onStatusRef.current(result); }
    } catch (error) { if (mounted.current) { setStatus(null); setError(message(error)); onStatusRef.current(null); } }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const focus = () => { void refresh(); };
    window.addEventListener("focus", focus);
    const timer = window.setInterval(focus, 60_000);
    // OAuth parameters are only a hint to display; server status is authoritative.
    const url = new URL(window.location.href);
    if (url.searchParams.has("drive")) {
      url.searchParams.delete("drive");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
    return () => { mounted.current = false; window.clearInterval(timer); window.removeEventListener("focus", focus); };
  }, [refresh]);
  const run = async (action: () => Promise<void>) => {
    setWorking(true); setError(""); setNotice("");
    try { await action(); } catch (error) { if (mounted.current) setError(message(error)); }
    finally { if (mounted.current) setWorking(false); }
  };
  const select = (id: string) => run(async () => {
    onStatusRef.current(null);
    const selected = await selectCatalogueGoogleFolder({ folderId: id });
    setNotice(`Selected “${selected.name}”. Use Scan Drive on its matching spreadsheet group.`);
    await refresh();
  });
  const disabled = busy || working;
  const expected = new Set(folders.map((folder) => folder.id));
  return (
    <section className="space-y-3 border border-border bg-muted/20 p-3" aria-label="Google Drive connection" data-testid="drive-connection">
      <h3 className="text-xs font-semibold uppercase tracking-wider">Google Drive · Staff session only</h3>
      <p className="text-xs text-muted-foreground">
        Direct imports need a separate Google authorization on this host. Google grants read access to your Drive files, not write access.
        SOSO reads only the product folders you select here. No Google tokens are sent to this browser.
        The connection expires within one hour; sign in and reconnect when needed. Local photo folders remain available below.
      </p>
      {!status && !error && <p role="status" className="text-xs">Checking Drive connection…</p>}
      {status?.workspace && <p className="text-xs">Workspace connector available here only. It does not authorize the published Staff site.</p>}
      {status && !status.configured && !status.workspace && <p role="status" className="border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">Google Drive is not set up on this site. Scanning cannot connect it. You can still import photos: choose Add files or Add folder below, then assign those photos to the correct product. An owner must arrange the separate Google connection before direct Drive imports can work.</p>}
      {status?.configured && (
        <>
          <p className="text-xs" role="status">{status.connected
            ? `Connected · ${status.folders.length} selected folders · expires ${new Date(status.expiresAt!).toLocaleTimeString()}`
            : "Not connected or expired. Connect again to scan Drive folders."}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={button} disabled={disabled} onClick={() => void run(async () => {
              await beforeConnect();
              onStatusRef.current(null);
              const result = await authorizeCatalogueGoogle();
              window.location.assign(result.authorizationUrl);
            })}>{status.connected ? "Reconnect / change Google account" : "Connect Google Drive"}</button>
            <button type="button" className={button} disabled={disabled} onClick={() => void run(async () => {
              onStatusRef.current(null);
              const result = await disconnectCatalogueGoogle();
              onDisconnect(); setChoices(null);
              await refresh();
              setNotice(result.revoked ? "Drive disconnected. Local folders and draft review are unchanged."
                : "Disconnected from SOSO. Google revocation could not be confirmed. Remove SOSO in your Google Account’s third-party connections to revoke access there too.");
            })}>Disconnect Drive</button>
          </div>
        </>
      )}
      <button type="button" className={button} disabled={disabled} onClick={() => void refresh()}>Refresh connection status</button>
      {status?.connected && (
        <div className="space-y-2">
          <p className="text-xs">Select the exact Drive folders referenced by your spreadsheet. Folder selection does not approve product content or publish anything.</p>
          <div className="flex flex-wrap gap-2">
            <input className="staff-input max-w-sm text-xs" aria-label="Search Google Drive folders" placeholder="Folder name" maxLength={100} value={search} onChange={(e) => setSearch(e.target.value)} />
            <button type="button" className={button} disabled={disabled} onClick={() => void run(async () => {
              const result = await listCatalogueGoogleFolders({ search });
              setChoices(result.folders); setMore(result.more);
            })}>Find Drive folders</button>
          </div>
          {more && <p className="text-xs">Showing up to 50 folders. Search a more specific name or use the exact spreadsheet folder below.</p>}
          {choices && (
            <ul className="max-h-52 space-y-2 overflow-y-auto text-xs">
              {choices.length === 0 && <li>No folders found. Check the Google account, folder sharing, or search.</li>}
              {choices.map((folder) => (
                <li key={folder.id} className="flex flex-wrap items-center justify-between gap-2 border border-border p-2">
                  <span>{folder.name} <span className="text-muted-foreground">({folder.id})</span></span>
                  <button type="button" className={button} disabled={disabled || !expected.has(folder.id) || status.folders.includes(folder.id)} onClick={() => void select(folder.id)}>
                    {status.folders.includes(folder.id) ? "Selected" : expected.has(folder.id) ? "Select for import" : "Not in this spreadsheet"}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {folders.length === 0 && <p className="text-xs">Read a spreadsheet first to select its linked folders.</p>}
          <ul className="max-h-60 space-y-2 overflow-y-auto text-xs" aria-label="Spreadsheet Drive folders">
            {folders.map((folder) => (
              <li key={folder.id} className="flex flex-wrap items-center justify-between gap-2 border border-border p-2">
                <span className="min-w-0 break-all">{folder.product} · {folder.id}</span>
                <button type="button" className={button} disabled={disabled || status.folders.includes(folder.id)} onClick={() => void select(folder.id)}>
                  {status.folders.includes(folder.id) ? "Selected for this session" : "Select this spreadsheet folder"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {notice && <p role="status" className="text-xs">{notice}</p>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </section>
  );
}
