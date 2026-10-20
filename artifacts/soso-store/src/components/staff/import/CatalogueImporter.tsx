import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowDown, ArrowUp, Check, CheckCircle2, ChevronDown, ChevronRight, FileSpreadsheet,
  FolderOpen, Image as ImageIcon, Loader2, RefreshCw, Star, Upload,
} from "lucide-react";
import {
  customFetch, getCatalogueImportDriveFolder, getStaffProfile, scanCatalogueImportSheet,
  type CatalogueImportRow, type CatalogueImportSheet,
} from "@workspace/api-client-react";
import type { CatalogProduct, ProductDepartment } from "../../../data/platformContent";
import {
  MAX_COLOURS, MAX_COLOUR_LABEL, MAX_PER_SAVE, MAX_SHEET_BYTES, PILOT_DEFAULT, UPLOADABLE_TYPES, applySharedFacts, canReuseGroup,
  categoriesFor, exactFolderSuggestion, isKnownCategory, folderCounts, markGroupsSaved, mergeDriveListing, moveItem, newGroupReview, readinessBlockers, rowIssues, safeUploadName, slugCounts, slugifyId, toCatalogProduct,
  type CollectionRef, type GroupReview, type PhotoItem, type SharedFacts,
} from "./import-model";
import { StaleTaskError, createSerialQueue } from "./drive-queue";
import { fileToBase64, importStore, sha256Hex } from "./import-store";
import { DriveConnection } from "./DriveConnection";
import { CatalogueImportGuide } from "./CatalogueImportGuide";

type Filter = "all" | "selected" | "ready" | "missing" | "ambiguous" | "conflicting" | "saved";
type Session = { sheet: CatalogueImportSheet; groups: Record<number, GroupReview>; selected: number[] };
type LocalDir = { dir: string; files: File[] };

const MAX_PREVIEWS = 6;
const label = "text-[10px] font-semibold uppercase tracking-wider";
const btn = `inline-flex min-h-10 items-center justify-center gap-2 border border-border bg-background px-3 ${label} text-primary hover:bg-muted/40 disabled:opacity-50 transition-colors`;
const btnPrimary = `inline-flex min-h-10 items-center justify-center gap-2 bg-primary px-3 ${label} text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors`;

function errText(error: unknown, fallback: string): string {
  const status = (error as { status?: number })?.status;
  if (status === 503) return "Google Drive is not reachable from this host (HTTP 503). Use the photo folder upload below and assign folders to groups explicitly.";
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function Chip({ tone, children, testId }: { tone: "ok" | "warn" | "bad" | "info" | "muted"; children: React.ReactNode; testId?: string }) {
  const cls = {
    ok: "border-emerald-300 bg-emerald-50 text-emerald-800",
    warn: "border-amber-300 bg-amber-50 text-amber-900",
    bad: "border-destructive/30 bg-destructive/10 text-destructive",
    info: "border-primary/40 bg-accent text-accent-foreground",
    muted: "border-border bg-muted/40 text-muted-foreground",
  }[tone];
  return <span data-testid={testId} className={`inline-flex items-center gap-1 border px-1.5 py-0.5 ${label} ${cls}`}>{children}</span>;
}

function Meter({ value, total }: { value: number; total: number }) {
  const ratio = total > 0 ? Math.min(1, value / total) : 0;
  return (
    <div className="h-1 w-full overflow-hidden bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={value}>
      <div className="h-full w-full origin-left bg-primary transition-transform duration-500 ease-out" style={{ transform: `scaleX(${ratio})` }} />
    </div>
  );
}

export function CatalogueImporter({
  savedProducts,
  editorProducts,
  collections,
  onUploadMedia,
  onImportProducts,
}: {
  savedProducts: CatalogProduct[];
  editorProducts: CatalogProduct[];
  /** Saved/draft collections; categories must match one exactly. */
  collections?: CollectionRef[];
  onUploadMedia: (file: File) => Promise<string>;
  onImportProducts: (products: CatalogProduct[]) => Promise<void>;
}) {
  const [open, setOpen] = useState(() => new URLSearchParams(window.location.search).has("drive"));
  const [staffId, setStaffId] = useState<string | null>(null);
  const [identityError, setIdentityError] = useState("");
  const [sheet, setSheet] = useState<CatalogueImportSheet | null>(null);
  const [groups, setGroups] = useState<Record<number, GroupReview>>({});
  const [selected, setSelected] = useState<number[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [reading, setReading] = useState(false);
  const [sheetError, setSheetError] = useState("");
  const [restored, setRestored] = useState(false);
  const [scanning, setScanning] = useState<{ done: number; total: number } | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [thumbErrors, setThumbErrors] = useState<Record<string, string>>({});
  const [localDirs, setLocalDirs] = useState<LocalDir[]>([]);
  const [facts, setFacts] = useState<SharedFacts>({ fabric: "", fit: "", sizes: "", colourLabel: "", colourHex: "#8a6a22", rights: "" });
  const [factsMessage, setFactsMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; text: string } | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [persistError, setPersistError] = useState("");
  const [retrying, setRetrying] = useState<string | null>(null);

  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  // Uploads may take minutes. Recheck the latest editor, not its upload-start closure.
  const importCallbackRef = useRef(onImportProducts);
  importCallbackRef.current = onImportProducts;
  const localFilesRef = useRef(new Map<string, File>());
  const thumbsRef = useRef(thumbs);
  thumbsRef.current = thumbs;
  const persistTimer = useRef<number | null>(null);
  const identityStarted = useRef(false);
  const mountedRef = useRef(true);
  const thumbGen = useRef(0);
  const thumbInflight = useRef(new Set<string>());
  const driveQueue = useRef(createSerialQueue()).current;
  const [thumbLoadingGroup, setThumbLoadingGroup] = useState<number | null>(null);

  const revokeThumbs = useCallback((keep?: (key: string) => boolean) => {
    const next: Record<string, string> = {};
    for (const [k, u] of Object.entries(thumbsRef.current)) {
      if (keep?.(k)) next[k] = u; else URL.revokeObjectURL(u);
    }
    thumbsRef.current = next;
    setThumbs(next);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (persistTimer.current) window.clearTimeout(persistTimer.current);
      persistTimer.current = null;
      thumbGen.current++;
      Object.values(thumbsRef.current).forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  // Identity scopes persisted receipts. Without it, nothing is persisted.
  // Runs once per mount; identity is only set after the restore attempt finishes, so no effect cleanup can discard it.
  useEffect(() => {
    if (!open || identityStarted.current) return;
    identityStarted.current = true;
    void (async () => {
      let me: { id: string };
      try { me = await getStaffProfile(); } catch {
        if (mountedRef.current) setIdentityError("Staff identity could not be confirmed, so progress will not be kept after reload.");
        return;
      }
      let session: Session | undefined;
      try { session = await importStore.getSession<Session>(me.id); } catch {
        if (mountedRef.current) setPersistError("This browser could not open local storage (IndexedDB). Review progress and upload receipts will NOT survive a reload.");
      }
      if (!mountedRef.current) return;
      if (session?.sheet && !sheetRef.current) { setSheet(session.sheet); setGroups(Object.fromEntries(Object.entries(session.groups).map(([k, g]) => [k, { ...g, category: typeof g.category === "string" ? g.category : "", accepted: typeof g.category === "string" ? g.accepted : false }]))); setSelected(session.selected); setRestored(true); }
      setStaffId(me.id);
    })();
  }, [open]);

  useEffect(() => {
    if (!staffId || !sheet) return;
    if (persistTimer.current) window.clearTimeout(persistTimer.current);
    const owner = staffId;
    const value: Session = { sheet, groups, selected };
    persistTimer.current = window.setTimeout(() => {
      persistTimer.current = null;
      if (!mountedRef.current) return; // never write after unmount (e.g. a different Staff session)
      importStore.putSession(owner, value)
        .then(() => { if (mountedRef.current) setPersistError(""); })
        .catch(() => { if (mountedRef.current) setPersistError("Progress could not be saved in this browser. Keep this tab open until the batch is saved; a reload will lose the review."); });
    }, 400);
  }, [staffId, sheet, groups, selected]);

  const existingSlugs = useMemo(() => new Set(savedProducts.map((p) => p.slug)), [savedProducts]);
  const editorOnlySlugs = useMemo(() => new Set(editorProducts.map((p) => p.slug).filter((s) => !existingSlugs.has(s))), [editorProducts, existingSlugs]);
  const rows = useMemo(() => sheet?.rows ?? [], [sheet]);
  const counts = useMemo(() => slugCounts(rows), [rows]);
  const fCounts = useMemo(() => folderCounts(rows), [rows]);
  const rowByNumber = useMemo(() => new Map(rows.map((r) => [r.rowNumber, r])), [rows]);

  /** Product-affecting edits always clear acceptance; only the acceptance tick and upload results keep it. */
  const patchGroup = useCallback((n: number, fn: (g: GroupReview) => GroupReview, keepAccepted = false) => {
    setGroups((prev) => {
      if (!prev[n]) return prev;
      const next = fn(prev[n]!);
      return { ...prev, [n]: keepAccepted ? next : { ...next, accepted: false } };
    });
  }, []);
  const patchPhoto = useCallback((n: number, key: string, patch: Partial<PhotoItem>) => {
    patchGroup(n, (g) => ({ ...g, photos: g.photos.map((p) => (p.key === key ? { ...p, ...patch } : p)) }), true);
  }, [patchGroup]);

  // ---------- Spreadsheet ----------
  const readSheet = async (file: File) => {
    setSheetError("");
    if (file.size > MAX_SHEET_BYTES) { setSheetError(`${file.name} is ${(file.size / 1024).toFixed(1)} KiB. The limit is 650 KiB — remove embedded images or export as CSV.`); return; }
    setReading(true);
    try {
      const result = await scanCatalogueImportSheet({ name: file.name, contentBase64: await fileToBase64(file) });
      const next: Record<number, GroupReview> = {};
      for (const r of result.rows) {
        const prevRow = sheet?.rows.find((x) => x.rowNumber === r.rowNumber);
        next[r.rowNumber] = groupsRef.current[r.rowNumber] && canReuseGroup(prevRow, r) ? { ...groupsRef.current[r.rowNumber]!, accepted: false } : newGroupReview(r, collections);
      }
      revokeThumbs();
      setSheet(result); setGroups(next); setRestored(false);
      setSelected(result.rows.filter((r) => !existingSlugs.has(r.slug)).slice(0, PILOT_DEFAULT).map((r) => r.rowNumber));
    } catch (error) {
      setSheetError(errText(error, "The spreadsheet could not be read. Check it is .xlsx or .csv and retry."));
    } finally { setReading(false); }
  };

  // ---------- Drive ----------
  const scanOne = useCallback(async (n: number) => {
    const row = rowByNumber.get(n);
    if (!row?.driveFolderId) return;
    patchGroup(n, (g) => ({ ...g, scan: { status: "scanning" } }), true);
    try {
      const folder = await getCatalogueImportDriveFolder(row.driveFolderId);
      const driveKeys = new Set((groupsRef.current[n]?.photos ?? []).filter((p) => p.source === "drive").map((p) => p.key));
      revokeThumbs((k) => !driveKeys.has(k)); // previews may no longer match the bytes
      patchGroup(n, (g) => {
        const { photos, changed } = mergeDriveListing(g, folder.folderId, folder.files);
        return { ...g, photos, accepted: changed ? false : g.accepted, coverKey: photos.some((p) => p.key === g.coverKey) ? g.coverKey : null, scan: { status: "done", folderName: folder.name, warnings: folder.warnings } };
      }, true);
    } catch (error) {
      patchGroup(n, (g) => ({ ...g, scan: { status: "failed", error: errText(error, "Drive folder could not be listed. Retry.") } }), true);
    }
  }, [patchGroup, rowByNumber]);

  const scanSelected = async () => {
    const targets = selected.filter((n) => rowByNumber.get(n)?.driveFolderId);
    setScanning({ done: 0, total: targets.length });
    for (let i = 0; i < targets.length; i++) {
      await scanOne(targets[i]!); // sequential: one folder at a time
      setScanning({ done: i + 1, total: targets.length });
    }
    setScanning(null);
  };

  const fetchPhotoBlob = async (p: PhotoItem, shouldRun?: () => boolean): Promise<Blob> => {
    if (p.source === "local") {
      const file = localFilesRef.current.get(p.key);
      if (!file) throw new Error("Reselect this local file — browsers do not keep file access after reload.");
      return file;
    }
    // Shared serial queue: one Drive download at a time across previews and uploads (server allows few readers).
    return driveQueue.run(
      () => customFetch<Blob>(`/api/staff/catalogue-import/drive/${encodeURIComponent(p.folderId!)}/files/${encodeURIComponent(p.driveFileId!)}`, { responseType: "blob" }),
      shouldRun,
    );
  };

  // Previews are bounded to the expanded group; collapsing or switching groups revokes them.
  useEffect(() => {
    thumbGen.current++;
    thumbInflight.current.clear();
    const keys = new Set(expanded !== null ? (groupsRef.current[expanded]?.photos ?? []).map((p) => p.key) : []);
    revokeThumbs((k) => keys.has(k));
  }, [expanded, revokeThumbs]);

  const loadThumbs = async (n: number) => {
    const g = groupsRef.current[n];
    if (!g || expanded !== n || thumbLoadingGroup !== null) return;
    const gen = thumbGen.current;
    const current = () => gen === thumbGen.current && mountedRef.current;
    setThumbLoadingGroup(n);
    try {
    for (const p of g.photos.filter((x) => x.included).slice(0, MAX_PREVIEWS)) {
      if (!current()) break;
      if (thumbsRef.current[p.key] || thumbInflight.current.has(p.key)) continue;
      thumbInflight.current.add(p.key);
      try {
        const blob = await fetchPhotoBlob(p, current);
        if (!current()) break;
        const url = URL.createObjectURL(blob);
        thumbsRef.current = { ...thumbsRef.current, [p.key]: url };
        setThumbs(thumbsRef.current);
        setThumbErrors((e) => { const next = { ...e }; delete next[p.key]; return next; });
      } catch (error) {
        if (error instanceof StaleTaskError || !current()) break;
        setThumbErrors((e) => ({ ...e, [p.key]: errText(error, "Preview failed") }));
      } finally { thumbInflight.current.delete(p.key); }
    }
    } finally { if (mountedRef.current) setThumbLoadingGroup((x) => (x === n ? null : x)); }
  };

  // ---------- Local fallback ----------
  const addLocalFiles = (list: FileList | null) => {
    if (!list) return;
    const byDir = new Map<string, File[]>();
    for (const file of Array.from(list)) {
      if (!file.type.startsWith("image/")) continue;
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || "";
      const parts = rel.split("/");
      const dir = parts.length > 1 ? parts.slice(0, -1).join("/") : "Loose files";
      byDir.set(dir, [...(byDir.get(dir) ?? []), file]);
    }
    setLocalDirs((prev) => {
      const next = [...prev];
      for (const [dir, files] of byDir) {
        const existing = next.find((d) => d.dir === dir);
        if (existing) existing.files = [...existing.files, ...files.filter((f) => !existing.files.some((e) => e.name === f.name && e.size === f.size && e.lastModified === f.lastModified))];
        else next.push({ dir, files });
      }
      return next;
    });
  };

  const assignDir = (dir: LocalDir, n: number) => {
    const items: PhotoItem[] = dir.files.map((file) => {
      const key = `l:${dir.dir}/${file.name}:${file.size}:${file.lastModified}`;
      localFilesRef.current.set(key, file);
      return { key, name: file.name, source: "local", size: file.size, mimeType: file.type, included: true };
    });
    if (busy) return;
    patchGroup(n, (g) => {
      const prior = new Map(g.photos.map((p) => [p.key, p]));
      const merged = [...g.photos, ...items.filter((i) => !prior.has(i.key))].map((p) => (prior.has(p.key) ? { ...p, error: undefined } : p));
      return { ...g, photos: merged };
    });
    setLocalDirs((prev) => prev.filter((d) => d !== dir));
  };

  const driveFolderNames = useMemo(() => Object.fromEntries(Object.values(groups).map((g) => [g.rowNumber, g.scan.folderName])), [groups]);
  const missingLocalFiles = (g: GroupReview) => g.photos.filter((p) => p.source === "local" && p.included && !p.path && !localFilesRef.current.has(p.key)).length;

  // ---------- Filters ----------
  const visibleRows = useMemo(() => rows.filter((r) => {
    const g = groups[r.rowNumber];
    const issues = rowIssues(r, g, existingSlugs, counts);
    switch (filter) {
      case "selected": return selected.includes(r.rowNumber);
      case "ready": return g ? readinessBlockers(r, g, existingSlugs, counts, fCounts, collections).length === 0 : false;
      case "saved": return Boolean(g?.savedAt) || existingSlugs.has(r.slug);
      case "missing": case "ambiguous": case "conflicting": return issues.includes(filter);
      default: return true;
    }
  }), [rows, groups, existingSlugs, counts, fCounts, collections, filter, selected]);

  const filterCount = (f: Filter) => rows.filter((r) => {
    const g = groups[r.rowNumber];
    if (f === "all") return true;
    if (f === "selected") return selected.includes(r.rowNumber);
    if (f === "ready") return g ? readinessBlockers(r, g, existingSlugs, counts, fCounts, collections).length === 0 : false;
    if (f === "saved") return Boolean(g?.savedAt) || existingSlugs.has(r.slug);
    return rowIssues(r, g, existingSlugs, counts).includes(f);
  }).length;

  const toggleSelect = (n: number) => setSelected((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n]));

  const batch = selected.filter((n) => {
    const r = rowByNumber.get(n); const g = groups[n];
    return r && g && !g.savedAt && readinessBlockers(r, g, existingSlugs, counts, fCounts, collections).length === 0;
  });
  const overLimit = batch.length > MAX_PER_SAVE;
  const busy = saving || Boolean(scanning) || retrying !== null;

  // ---------- Upload + save ----------
  /** Uploads one photo, reusing any receipt for identical bytes. Never writes to the draft. */
  const uploadPhoto = async (n: number, p: PhotoItem, sessionHashes: Map<string, string>): Promise<boolean> => {
    try {
      if (!UPLOADABLE_TYPES.includes(p.mimeType)) throw new Error(`${p.mimeType || "Unknown type"} cannot be uploaded; export JPEG, PNG or WebP.`);
      const blob = await fetchPhotoBlob(p);
      const hash = await sha256Hex(blob);
      let path = sessionHashes.get(hash);
      if (!path && staffId) path = (await importStore.getReceipt(staffId, hash).catch(() => undefined))?.path;
      if (!path) {
        path = await onUploadMedia(new File([blob], safeUploadName(p.name, p.mimeType), { type: p.mimeType }));
        if (staffId) await importStore.putReceipt(staffId, { hash, path, name: p.name, size: blob.size, uploadedAt: new Date().toISOString() })
          .catch(() => setPersistError("An upload receipt could not be stored locally; after a reload this photo may upload again."));
      }
      sessionHashes.set(hash, path);
      patchPhoto(n, p.key, { hash, path, error: undefined });
      const cur = groupsRef.current[n]!;
      groupsRef.current = { ...groupsRef.current, [n]: { ...cur, photos: cur.photos.map((x) => (x.key === p.key ? { ...x, hash, path, error: undefined } : x)) } };
      return true;
    } catch (error) {
      patchPhoto(n, p.key, { error: errText(error, "Upload failed. Retry this photo.") });
      return false;
    }
  };

  const retryPhoto = async (n: number, key: string) => {
    const p = groupsRef.current[n]?.photos.find((x) => x.key === key);
    if (!p || saving || retrying || scanning) return;
    thumbGen.current++;
    setRetrying(key);
    try { await uploadPhoto(n, p, new Map()); } finally { setRetrying(null); }
  };

  const uploadAndSave = async () => {
    if (busy || batch.length === 0 || overLimit) return;
    thumbGen.current++; // queued previews are discarded before they reach the network
    setSaving(true); setSaveError(""); setSaveMessage("");
    const sessionHashes = new Map<string, string>();
    const work = batch.flatMap((n) => groupsRef.current[n]!.photos.filter((p) => p.included && !p.path).map((p) => ({ n, p })));
    let done = 0;
    setProgress({ done, total: work.length, text: "Preparing photos" });
    const failedGroups = new Set<number>();
    for (const { n, p } of work) {
      setProgress({ done, total: work.length, text: `Uploading ${p.name}` });
      if (!(await uploadPhoto(n, p, sessionHashes))) failedGroups.add(n);
      done++;
      setProgress({ done, total: work.length, text: `Uploaded ${done} of ${work.length}` });
    }
    const toSave = batch.filter((n) => !failedGroups.has(n));
    if (toSave.length === 0) {
      setSaveError("No group finished uploading, so nothing was saved. Fix the photo errors shown on each group and retry.");
      setSaving(false); setProgress(null); return;
    }
    let products: CatalogProduct[];
    try {
      products = toSave.map((n, i) => toCatalogProduct(rowByNumber.get(n)!, groupsRef.current[n]!, savedProducts.length + i));
    } catch (error) {
      setSaveError(errText(error, "A product could not be prepared.")); setSaving(false); setProgress(null); return;
    }
    setProgress({ done: work.length, total: work.length, text: `Saving ${products.length} draft product${products.length === 1 ? "" : "s"}` });
    try {
      await importCallbackRef.current(products); // single attempt; validates current unsaved edits
      const at = new Date().toISOString();
      const committed = markGroupsSaved(groupsRef.current, toSave, at);
      const remaining = selectedRef.current.filter((n) => !toSave.includes(n));
      groupsRef.current = committed;
      selectedRef.current = remaining;
      setGroups(committed);
      setSelected(remaining);
      if (persistTimer.current) window.clearTimeout(persistTimer.current);
      persistTimer.current = null;
      // The success message is a reload boundary: wait for the IDB transaction to commit.
      if (staffId && sheetRef.current) {
        await importStore.putSession(staffId, { sheet: sheetRef.current, groups: committed, selected: remaining } satisfies Session)
          .catch(() => setPersistError("Products were saved, but this browser could not save their review labels. Reload the saved catalogue before continuing."));
      }
      setSaveMessage(`${products.length} product${products.length === 1 ? "" : "s"} saved to the unpublished draft as non-selling placeholders. Price is unknown on each; nothing was published.${failedGroups.size ? ` ${failedGroups.size} group(s) held back by photo errors.` : ""}`);
    } catch (error) {
      const message = errText(error, "The draft could not be saved.");
      setSaveError(`${message} Save not confirmed — the server may still have committed it. Reload the saved catalogue before retrying; completed uploads are kept.`);
      setGroups((prev) => { const next = { ...prev }; for (const n of toSave) next[n] = { ...next[n]!, saveError: message }; return next; });
    } finally { setSaving(false); setProgress(null); }
  };

  const resetSession = async () => {
    if (busy) return;
    if (!window.confirm("Clear this import review? Upload receipts are kept so finished photos are not uploaded again.")) return;
    setSheet(null); setGroups({}); setSelected([]); setLocalDirs([]); setRestored(false);
    if (staffId) await importStore.clearSession(staffId).catch(() => undefined);
  };

  const savedCount = Object.values(groups).filter((g) => g.savedAt).length;
  const readyCount = filterCount("ready");

  return (
    <section className="border border-primary/40 bg-card" data-testid="catalogue-importer">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} data-testid="button-toggle-importer"
        className="flex w-full items-center justify-between gap-3 p-5 text-left hover:bg-muted/30">
        <span>
          <span className={`${label} flex items-center gap-2 text-primary`}><FileSpreadsheet className="h-3.5 w-3.5" /> Bulk catalogue import · pilot</span>
          <span className="mt-1 block text-xs text-muted-foreground">Turn reviewed spreadsheet groups and atelier photos into unpublished, non-selling drafts. Up to {MAX_PER_SAVE} per save.</span>
        </span>
        <span className="flex items-center gap-2">
          {sheet && <Chip tone="info">{rows.length} groups · {savedCount} saved</Chip>}
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
      </button>

      {open && (
        <div className="space-y-5 border-t border-border p-5">
          <CatalogueImportGuide />
          <div className="border-l-2 border-primary bg-accent px-3 py-2 text-xs text-accent-foreground" data-testid="text-import-rules">
            Every import is saved as a <strong>placeholder</strong>, <strong>unavailable</strong>, with no JusticeSure mapping and no standard or custom eligibility.
            Price is <strong>unknown</strong>: an internal value of 1 and size “To confirm” satisfy the schema only. Spreadsheet descriptions stay unverified draft copy. Existing slugs are never replaced.
          </div>
          {persistError && <p role="alert" data-testid="text-persist-error" className="border border-amber-400 bg-amber-50 px-3 py-2 text-xs text-amber-900">{persistError}</p>}
          {identityError && <p role="status" className="border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">{identityError}</p>}
          {restored && <p role="status" data-testid="status-import-restored" className="border border-border bg-muted/30 px-3 py-2 text-xs">Restored your previous review. Drive photos are available; reselect any local photo folders to continue — finished uploads are recognised by content hash and not sent again.</p>}
          <DriveConnection
            folders={Array.from(new Map((sheet?.rows ?? []).filter((r) => r.driveFolderId).map((r) => [r.driveFolderId!, { id: r.driveFolderId!, product: r.name }])).values())}
            busy={busy}
            beforeConnect={async () => {
              if (!sheetRef.current) return;
              if (!staffId || persistError) throw new Error("Save the batch first or restore browser storage before connecting Google. Leaving this page could lose this review.");
              if (persistTimer.current) window.clearTimeout(persistTimer.current);
              persistTimer.current = null;
              await importStore.putSession(staffId, { sheet: sheetRef.current, groups: groupsRef.current, selected: selectedRef.current });
            }}
            onDisconnect={() => {
              thumbGen.current++;
              revokeThumbs((key) => !Object.values(groupsRef.current).some((g) => g.photos.some((p) => p.key === key && p.source === "drive")));
            }}
          />

          {/* Step 1 */}
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <p className={`${label} text-primary`}>1 · Spreadsheet</p>
              <p className="mt-1 text-xs text-muted-foreground">Excel or CSV, 650 KiB maximum. Read-only — the file is parsed, never stored.</p>
              {sheet && <p className="mt-1 text-xs" data-testid="text-sheet-name">{sheet.sheetName} · {rows.length} rows</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <label className={`${btnPrimary} cursor-pointer`} data-testid="button-read-sheet">
                {reading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {reading ? "Reading…" : sheet ? "Read another sheet" : "Read spreadsheet"}
                <input type="file" className="sr-only" accept=".xlsx,.xls,.csv,text/csv" disabled={reading || busy}
                  data-testid="input-sheet" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void readSheet(f); }} />
              </label>
              {sheet && <button type="button" className={btn} disabled={busy} onClick={() => void resetSession()} data-testid="button-reset-import">Clear review</button>}
            </div>
          </div>
          {sheetError && <p role="alert" data-testid="text-sheet-error" className="border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{sheetError}</p>}
          {sheet && sheet.warnings.length > 0 && (
            <ul className="space-y-1 border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">{sheet.warnings.map((w) => <li key={w} className="flex gap-2"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{w}</li>)}</ul>
          )}

          {!sheet && !reading && (
            <div className="border border-dashed border-border bg-background p-8 text-center">
              <FileSpreadsheet className="mx-auto h-8 w-8 text-primary/60" />
              <p className="mt-3 text-sm">No spreadsheet read yet.</p>
              <p className="mt-1 text-xs text-muted-foreground">Start with the atelier product sheet. The first {PILOT_DEFAULT} new groups are selected for the pilot.</p>
            </div>
          )}
          {reading && <div className="space-y-2" aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i} className="h-12 animate-pulse bg-muted" />)}</div>}

          {sheet && (
            <>
              {/* Step 2: browse */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className={`${label} text-primary`}>2 · Review groups</p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={btn} disabled={busy || selected.length === 0} onClick={() => void scanSelected()} data-testid="button-scan-selected">
                      {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderOpen className="h-3.5 w-3.5" />}
                      {scanning ? `Scanning ${scanning.done}/${scanning.total}` : `Scan Drive for ${selected.length} selected`}
                    </button>
                  </div>
                </div>
                {scanning && <Meter value={scanning.done} total={scanning.total} />}
                <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter groups">
                  {(["all", "selected", "ready", "missing", "ambiguous", "conflicting", "saved"] as Filter[]).map((f) => (
                    <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} data-testid={`filter-${f}`}
                      className={`min-h-9 border px-2.5 ${label} transition-colors ${filter === f ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-muted/40"}`}>
                      {f} <span className="opacity-70">{filterCount(f)}</span>
                    </button>
                  ))}
                </div>

                <div className="max-h-[34rem] divide-y divide-border overflow-y-auto border border-border bg-background">
                  {visibleRows.length === 0 && <p className="p-6 text-center text-xs text-muted-foreground">No groups match this filter.</p>}
                  {visibleRows.map((r) => (
                    <GroupRow key={r.rowNumber} row={r} group={groups[r.rowNumber]!} selected={selected.includes(r.rowNumber)}
                      expanded={expanded === r.rowNumber} existing={existingSlugs.has(r.slug)} editorOnly={editorOnlySlugs.has(r.slug)}
                      issues={rowIssues(r, groups[r.rowNumber], existingSlugs, counts)}
                      blockers={groups[r.rowNumber] ? readinessBlockers(r, groups[r.rowNumber]!, existingSlugs, counts, fCounts, collections) : []}
                      missingLocal={groups[r.rowNumber] ? missingLocalFiles(groups[r.rowNumber]!) : 0}
                      thumbs={thumbs} thumbErrors={thumbErrors} busy={busy} retrying={retrying}
                      collections={collections} selectionLocked={busy || reading} previewsLoading={thumbLoadingGroup === r.rowNumber}
                      sharedFolder={Boolean(r.driveFolderId && (fCounts.get(r.driveFolderId) ?? 0) > 1)}
                      onRetryPhoto={(key) => void retryPhoto(r.rowNumber, key)}
                      onToggleSelect={() => toggleSelect(r.rowNumber)}
                      onToggleExpand={() => setExpanded(expanded === r.rowNumber ? null : r.rowNumber)}
                      onScan={() => void scanOne(r.rowNumber)} onLoadThumbs={() => void loadThumbs(r.rowNumber)}
                      onPatch={(fn, keep) => { if (!busy) patchGroup(r.rowNumber, fn, keep); }} />
                  ))}
                </div>
              </div>

              {/* Local fallback */}
              <div className="space-y-3 border border-border bg-background p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className={`${label} text-primary`}>Photo folders from this device</p>
                    <p className="mt-1 text-xs text-muted-foreground">Use when Drive is unavailable. Each folder must be assigned to a group by you — exact name matches are offered, never applied automatically.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <label className={`${btn} cursor-pointer`} data-testid="button-add-folder">
                      <FolderOpen className="h-3.5 w-3.5" /> Add folder
                      <input type="file" multiple className="sr-only" accept="image/*" data-testid="input-local-folder"
                        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
                        onChange={(e) => { addLocalFiles(e.target.files); e.target.value = ""; }} />
                    </label>
                    <label className={`${btn} cursor-pointer`} data-testid="button-add-files">
                      <ImageIcon className="h-3.5 w-3.5" /> Add files
                      <input type="file" multiple className="sr-only" accept="image/*" data-testid="input-local-files" onChange={(e) => { addLocalFiles(e.target.files); e.target.value = ""; }} />
                    </label>
                  </div>
                </div>
                {localDirs.length === 0 ? <p className="text-xs text-muted-foreground">No unassigned local photos.</p> : (
                  <ul className="divide-y divide-border border border-amber-300" data-testid="list-unmatched-folders">
                    {localDirs.map((d) => {
                      const suggestion = exactFolderSuggestion(d.dir, rows, driveFolderNames);
                      return (
                        <li key={d.dir} className="flex flex-wrap items-center gap-2 bg-amber-50/50 p-3 text-xs">
                          <Chip tone="warn">Unmatched</Chip>
                          <span className="font-medium">{d.dir}</span><span className="text-muted-foreground">{d.files.length} photos</span>
                          <span className="ml-auto flex flex-wrap items-center gap-2">
                            {suggestion !== null && (
                              <button type="button" className={btn} onClick={() => assignDir(d, suggestion)} data-testid={`button-assign-suggested-${d.dir}`}>
                                Assign to row {suggestion} ({rowByNumber.get(suggestion)?.slug})
                              </button>
                            )}
                            <select className="staff-input !min-h-10 !w-56 !py-1 text-xs" defaultValue="" aria-label={`Assign ${d.dir} to group`} data-testid={`select-assign-${d.dir}`}
                              onChange={(e) => { if (e.target.value) assignDir(d, Number(e.target.value)); }}>
                              <option value="">Assign to group…</option>
                              {rows.map((r) => <option key={r.rowNumber} value={r.rowNumber}>Row {r.rowNumber} · {r.name}</option>)}
                            </select>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Shared facts */}
              <div className="space-y-3 border border-border bg-background p-4">
                <div>
                  <p className={`${label} text-primary`}>3 · Atelier-confirmed shared facts</p>
                  <p className="mt-1 text-xs text-muted-foreground">Only enter facts the atelier has confirmed. Applied to the {selected.length} selected group{selected.length === 1 ? "" : "s"} only when you click Apply; blank fields change nothing.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {([["fabric", "Fabric"], ["fit", "Fit"], ["sizes", "Sizes (comma separated)"], ["rights", "Image rights"]] as [keyof SharedFacts, string][]).map(([k, l]) => (
                    <label key={k} className="text-xs"><span className={`${label} text-muted-foreground`}>{l}</span>
                      <input className="staff-input mt-1 text-sm" value={facts[k]} onChange={(e) => setFacts({ ...facts, [k]: e.target.value })} data-testid={`input-shared-${k}`} />
                    </label>
                  ))}
                  <div className="grid grid-cols-[1fr_auto] gap-2 text-xs">
                    <label><span className={`${label} text-muted-foreground`}>Colour name</span>
                      <input className="staff-input mt-1 text-sm" value={facts.colourLabel} onChange={(e) => setFacts({ ...facts, colourLabel: e.target.value })} data-testid="input-shared-colour" />
                    </label>
                    <label><span className={`${label} text-muted-foreground`}>Swatch</span>
                      <input type="color" className="mt-1 h-11 w-14 border border-border" value={facts.colourHex} onChange={(e) => setFacts({ ...facts, colourHex: e.target.value })} data-testid="input-shared-hex" />
                    </label>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" className={btn} disabled={busy || selected.length === 0} data-testid="button-apply-shared"
                    onClick={() => { setGroups((g) => applySharedFacts(g, selected, facts)); setFactsMessage(`Applied to ${selected.length} selected group${selected.length === 1 ? "" : "s"}.`); }}>
                    <Check className="h-3.5 w-3.5" /> Apply to selected
                  </button>
                  {factsMessage && <span role="status" className="text-xs text-emerald-800">{factsMessage}</span>}
                </div>
              </div>

              {/* Save */}
              <div className="sticky bottom-0 z-10 space-y-3 border border-primary/50 bg-card p-4 shadow-[0_-8px_24px_-16px_rgba(33,29,24,0.35)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs">
                    <p className={`${label} text-primary`}>4 · Upload & save to draft</p>
                    <p className="mt-1" data-testid="text-batch-summary">
                      {batch.length} ready in selection · {readyCount} ready overall · {savedCount} saved this session
                      {overLimit && <span className="text-destructive"> — deselect to {MAX_PER_SAVE} or fewer</span>}
                    </p>
                  </div>
                  <button type="button" className={btnPrimary} disabled={busy || batch.length === 0 || overLimit} onClick={() => void uploadAndSave()} data-testid="button-upload-save">
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    {saving ? "Working…" : `Upload & save ${batch.length} as drafts`}
                  </button>
                </div>
                {progress && <div className="space-y-1" role="status"><Meter value={progress.done} total={progress.total} /><p className="text-[11px] text-muted-foreground">{progress.text}</p></div>}
                {saveMessage && <p role="status" data-testid="text-import-success" className="flex gap-2 border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900"><CheckCircle2 className="h-4 w-4 shrink-0" />{saveMessage}</p>}
                {saveError && <p role="alert" data-testid="text-import-error" className="border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{saveError}</p>}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function GroupRow({
  row, group, selected, expanded, existing, editorOnly, issues, blockers, missingLocal, thumbs, thumbErrors, busy, retrying, sharedFolder, collections, selectionLocked, previewsLoading,
  onToggleSelect, onToggleExpand, onScan, onLoadThumbs, onPatch, onRetryPhoto,
}: {
  row: CatalogueImportRow; group: GroupReview; selected: boolean; expanded: boolean; existing: boolean; editorOnly: boolean;
  issues: string[]; blockers: string[]; missingLocal: number; thumbs: Record<string, string>; thumbErrors: Record<string, string>;
  onToggleSelect: () => void; onToggleExpand: () => void; onScan: () => void; onLoadThumbs: () => void;
  collections?: CollectionRef[]; selectionLocked: boolean; previewsLoading: boolean;
  busy: boolean; retrying: string | null; sharedFolder: boolean; onRetryPhoto: (key: string) => void;
  onPatch: (fn: (g: GroupReview) => GroupReview, keepAccepted?: boolean) => void;
}) {
  const included = group.photos.filter((p) => p.included);
  const uploaded = included.filter((p) => p.path).length;
  const failed = group.photos.filter((p) => p.error).length;
  const [newColour, setNewColour] = useState({ label: "", hex: "#8a6a22" });
  const status = group.savedAt ? <Chip tone="ok" testId={`status-group-${row.rowNumber}`}><Check className="h-3 w-3" />Saved to draft</Chip>
    : existing ? <Chip tone="bad" testId={`status-group-${row.rowNumber}`}>Slug exists</Chip>
    : blockers.length === 0 ? <Chip tone="ok" testId={`status-group-${row.rowNumber}`}>Ready · preview</Chip>
    : <Chip tone="muted" testId={`status-group-${row.rowNumber}`}>{blockers.length} to resolve</Chip>;

  return (
    <div className={selected ? "bg-accent/40" : ""} data-testid={`row-import-${row.rowNumber}`}>
      <div className="flex items-center gap-2 px-3 py-2">
        <input type="checkbox" checked={selected} onChange={onToggleSelect} disabled={selectionLocked || Boolean(group.savedAt) || existing}
          className="h-5 w-5 shrink-0 accent-[hsl(var(--primary))]" aria-label={`Select ${row.name}`} data-testid={`checkbox-select-${row.rowNumber}`} />
        <button type="button" onClick={onToggleExpand} aria-expanded={expanded} className="flex min-h-11 min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-left" data-testid={`button-expand-${row.rowNumber}`}>
          <span className="w-10 shrink-0 font-mono text-[10px] text-muted-foreground">#{row.rowNumber}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{row.name || "Untitled"}</span>
            <span className="block truncate font-mono text-[10px] text-muted-foreground">{row.slug} · {row.category || "No category"} · {group.department || <em className="text-amber-800">dept. “{row.department || "blank"}” unresolved</em>}</span>
          </span>
          <span className="flex flex-wrap items-center gap-1">
            {issues.includes("missing") && <Chip tone="warn">Missing photos</Chip>}
            {issues.includes("ambiguous") && <Chip tone="warn">Ambiguous</Chip>}
            {issues.includes("conflicting") && <Chip tone="bad">Conflict</Chip>}
            {editorOnly && <Chip tone="warn">In unsaved editor</Chip>}
            {group.scan.status === "scanning" && <Chip tone="info"><Loader2 className="h-3 w-3 animate-spin" />Scanning</Chip>}
            {group.scan.status === "failed" && <Chip tone="bad">Scan failed</Chip>}
            {group.photos.length > 0 && <Chip tone={failed ? "bad" : "muted"}>{uploaded}/{included.length} uploaded{failed ? ` · ${failed} failed` : ""}</Chip>}
            {status}
          </span>
        </button>
      </div>

      {expanded && (
        <div className="space-y-4 border-t border-border bg-card/60 px-3 py-4 sm:px-5">
          {(row.warnings.length > 0 || group.scan.warnings?.length) && (
            <ul className="space-y-1 border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {[...row.warnings, ...(group.scan.warnings ?? [])].map((w, i) => <li key={i} className="flex gap-2"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{w}</li>)}
            </ul>
          )}
          {group.saveError && <p role="alert" className="border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">Last save failed: {group.saveError}</p>}

          <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
            <div className="space-y-3">
              <label className="block text-xs"><span className={`${label} text-muted-foreground`}>Department (required)</span>
                <select className="staff-input mt-1 text-sm" value={group.department} data-testid={`select-department-${row.rowNumber}`}
                  onChange={(e) => { const dept = e.target.value as ProductDepartment | ""; onPatch((g) => ({ ...g, department: dept, category: isKnownCategory(collections, dept, g.category) ? g.category : "" })); }}>
                  <option value="">Resolve — sheet says “{row.department || "blank"}”</option>
                  <option value="men">Men</option><option value="women">Women</option><option value="accessories">Accessories</option>
                </select>
              </label>
              <label className="block text-xs"><span className={`${label} text-muted-foreground`}>Collection category (required)</span>
                <select className="staff-input mt-1 text-sm" value={group.category} disabled={!group.department || busy} data-testid={`select-category-${row.rowNumber}`}
                  onChange={(e) => onPatch((g) => ({ ...g, category: e.target.value }))}>
                  <option value="">{group.department ? "Choose a saved collection…" : "Resolve department first"}</option>
                  {group.category && !isKnownCategory(collections, group.department, group.category) && <option value={group.category}>{group.category} (no longer a saved collection)</option>}
                  {categoriesFor(collections, group.department).map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <span className="mt-1 block text-[11px] text-muted-foreground" data-testid={`text-source-category-${row.rowNumber}`}>
                  Sheet proposed: “{row.category || "blank"}”{group.department && categoriesFor(collections, group.department).length === 0 ? " · no saved collections in this department" : ""}
                </span>
                {group.department && !group.category && (
                  <span className="mt-1 block text-[11px] text-amber-900">Nothing is renamed or mapped automatically. If no listed collection fits, create and save it in Collections below first.</span>
                )}
              </label>
              <label className="block text-xs"><span className={`${label} text-muted-foreground`}>Image rights (required)</span>
                <input className="staff-input mt-1 text-sm" value={group.rights} placeholder="e.g. Photographed for SOSO by the atelier" data-testid={`input-rights-${row.rowNumber}`}
                  onChange={(e) => onPatch((g) => ({ ...g, rights: e.target.value }))} />
              </label>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border border-border bg-background p-3 text-xs">
                <dt className="text-muted-foreground">Fabric</dt><dd>{group.fabric || "To be confirmed"}</dd>
                <dt className="text-muted-foreground">Fit</dt><dd>{group.fit || "To be confirmed"}</dd>
                <dt className="text-muted-foreground">Sizes</dt><dd>{group.sizes.join(", ") || "To confirm (placeholder)"}</dd>
                <dt className="text-muted-foreground">Price</dt><dd className="font-semibold text-destructive">Unknown · not for sale</dd>
              </dl>
              <details className="border border-border bg-background text-xs">
                <summary className={`cursor-pointer px-3 py-2 ${label}`}>Spreadsheet fields ({Object.keys(row.fields).length}) · unverified</summary>
                <dl className="max-h-56 overflow-y-auto border-t border-border p-3">
                  {Object.entries(row.fields).map(([k, v]) => (
                    <div key={k} className="grid grid-cols-[minmax(6rem,35%)_1fr] gap-2 py-0.5"><dt className="text-muted-foreground">{k}</dt><dd className="break-words">{v || <span className="text-muted-foreground">—</span>}</dd></div>
                  ))}
                </dl>
              </details>
              <div className="space-y-2 border border-border bg-background p-3">
                <p className={`${label} text-muted-foreground`}>Colours</p>
                {group.colours.length === 0 && <p className="text-xs text-muted-foreground">None confirmed — saved as “Colour to confirm”.</p>}
                <ul className="flex flex-wrap gap-1.5">
                  {group.colours.map((c) => (
                    <li key={c.id} className="flex items-center gap-1.5 border border-border px-2 py-1 text-xs">
                      <span className="h-3 w-3 border border-border" style={{ background: c.hex }} />{c.label}
                      <button type="button" className="ml-1 text-muted-foreground hover:text-destructive" aria-label={`Remove ${c.label}`}
                        onClick={() => onPatch((g) => ({ ...g, colours: g.colours.filter((x) => x.id !== c.id), photos: g.photos.map((p) => (p.colourId === c.id ? { ...p, colourId: undefined } : p)) }))}>×</button>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <input className="staff-input !min-h-10 text-xs" placeholder="Confirmed colour" maxLength={MAX_COLOUR_LABEL} value={newColour.label} onChange={(e) => setNewColour({ ...newColour, label: e.target.value })} data-testid={`input-colour-${row.rowNumber}`} />
                  <input type="color" className="h-10 w-12 shrink-0 border border-border" value={newColour.hex} onChange={(e) => setNewColour({ ...newColour, hex: e.target.value })} aria-label="Swatch" />
                  <button type="button" className={btn} disabled={busy || !newColour.label.trim() || group.colours.length >= MAX_COLOURS} data-testid={`button-add-colour-${row.rowNumber}`}
                    onClick={() => { const id = slugifyId(newColour.label); onPatch((g) => (g.colours.some((c) => c.id === id) ? g : { ...g, colours: [...g.colours, { id, label: newColour.label.trim(), hex: newColour.hex }] })); setNewColour({ label: "", hex: newColour.hex }); }}>Add</button>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className={`${label} text-muted-foreground`}>
                  Photos · {included.length} included{group.scan.folderName ? ` · Drive “${group.scan.folderName}”` : ""}
                </p>
                <div className="flex flex-wrap gap-2">
                  {row.driveFolderId && (
                    <button type="button" className={btn} onClick={onScan} disabled={busy || group.scan.status === "scanning"} data-testid={`button-scan-${row.rowNumber}`}>
                      <RefreshCw className={`h-3.5 w-3.5 ${group.scan.status === "scanning" ? "animate-spin" : ""}`} />{group.scan.status === "idle" ? "Scan Drive" : "Rescan"}
                    </button>
                  )}
                  {group.photos.length > 0 && <button type="button" className={btn} disabled={busy || previewsLoading} onClick={onLoadThumbs} data-testid={`button-thumbs-${row.rowNumber}`}>{previewsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}{previewsLoading ? "Loading previews…" : "Show previews"}</button>}
                </div>
              </div>
              {included.length > MAX_PREVIEWS && <p className="text-[11px] text-muted-foreground" data-testid={`text-preview-limit-${row.rowNumber}`}>Previews show the first {MAX_PREVIEWS} included photos, one download at a time, to respect Drive limits. Reorder to preview others.</p>}
              {group.scan.status === "failed" && <p role="alert" className="border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{group.scan.error}</p>}
              {sharedFolder && (
                <label className="flex items-start gap-2 border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={Boolean(group.folderAck)} disabled={busy}
                    onChange={(e) => onPatch((g) => ({ ...g, folderAck: e.target.checked }))} data-testid={`checkbox-folder-ack-${row.rowNumber}`} />
                  This Drive folder is also used by another spreadsheet row. Tick only after confirming the included photos belong to this product.
                </label>
              )}
              {!row.driveFolderId && <p className="text-xs text-amber-900">No Drive folder on this row. Add a local folder below and assign it here.</p>}
              {missingLocal > 0 && <p className="border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">{missingLocal} local photo(s) need reselecting after reload before upload.</p>}
              {group.photos.length === 0 && group.scan.status !== "scanning" && <div className="border border-dashed border-border p-6 text-center text-xs text-muted-foreground">No photos yet.</div>}
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {group.photos.map((p, i) => {
                  const isCover = group.coverKey === p.key;
                  return (
                    <li key={p.key} className={`border bg-background transition-opacity ${p.included ? "" : "opacity-50"} ${isCover ? "border-primary ring-1 ring-primary" : "border-border"}`} data-testid={`photo-${row.rowNumber}-${i}`}>
                      <div className="relative flex aspect-[4/5] items-center justify-center overflow-hidden bg-muted">
                        {thumbs[p.key] ? <img src={thumbs[p.key]} alt={p.name} className="h-full w-full object-cover" loading="lazy" />
                          : <span className="px-2 text-center text-[10px] text-muted-foreground">{thumbErrors[p.key] ?? "Preview not loaded"}</span>}
                        {isCover && <span className={`absolute left-1 top-1 bg-primary px-1.5 py-0.5 ${label} text-primary-foreground`}>Cover</span>}
                        {p.path && <span className="absolute right-1 top-1 bg-emerald-700 p-0.5 text-white" title="Uploaded"><Check className="h-3 w-3" /></span>}
                      </div>
                      <div className="space-y-1.5 p-1.5">
                        <p className="truncate text-[10px]" title={p.name}>{p.name} <span className="text-muted-foreground">· {(p.size / 1024 / 1024).toFixed(2)} MB</span></p>
                        {!UPLOADABLE_TYPES.includes(p.mimeType) && <p className="text-[10px] text-destructive">{p.mimeType || "Unknown"} not supported</p>}
                        {p.error && <p role="alert" className="text-[10px] text-destructive">{p.error}</p>}
                        <select className="staff-input !min-h-9 !py-1 text-[11px]" value={p.colourId ?? ""} aria-label={`Colour for ${p.name}`} disabled={group.colours.length === 0}
                          onChange={(e) => onPatch((g) => ({ ...g, photos: g.photos.map((x) => (x.key === p.key ? { ...x, colourId: e.target.value || undefined } : x)) }))}>
                          <option value="">{group.colours.length ? "No colour" : "Add colours first"}</option>
                          {group.colours.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>
                        <div className="grid grid-cols-4 gap-1">
                          <button type="button" className="flex min-h-9 items-center justify-center border border-border hover:bg-muted/40 disabled:opacity-40" disabled={!p.included} aria-label="Set as cover" aria-pressed={isCover}
                            onClick={() => onPatch((g) => ({ ...g, coverKey: p.key, accepted: false }))} data-testid={`button-cover-${row.rowNumber}-${i}`}><Star className={`h-3.5 w-3.5 ${isCover ? "fill-primary text-primary" : ""}`} /></button>
                          <button type="button" className="flex min-h-9 items-center justify-center border border-border hover:bg-muted/40 disabled:opacity-40" disabled={i === 0} aria-label="Move earlier"
                            onClick={() => onPatch((g) => ({ ...g, photos: moveItem(g.photos, i, i - 1) }))}><ArrowUp className="h-3.5 w-3.5" /></button>
                          <button type="button" className="flex min-h-9 items-center justify-center border border-border hover:bg-muted/40 disabled:opacity-40" disabled={i === group.photos.length - 1} aria-label="Move later"
                            onClick={() => onPatch((g) => ({ ...g, photos: moveItem(g.photos, i, i + 1) }))}><ArrowDown className="h-3.5 w-3.5" /></button>
                          <button type="button" className={`flex min-h-9 items-center justify-center border border-border text-[10px] font-semibold hover:bg-muted/40`} aria-pressed={p.included} aria-label={p.included ? "Exclude photo" : "Include photo"}
                            onClick={() => onPatch((g) => ({ ...g, accepted: false, coverKey: g.coverKey === p.key && p.included ? null : g.coverKey, photos: g.photos.map((x) => (x.key === p.key ? { ...x, included: !x.included } : x)) }))}
                            data-testid={`button-include-${row.rowNumber}-${i}`}>{p.included ? "Out" : "In"}</button>
                        </div>
                        {p.error && <button type="button" disabled={busy} className="flex min-h-9 w-full items-center justify-center gap-1 border border-destructive/40 text-[10px] font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50" onClick={() => onRetryPhoto(p.key)} data-testid={`button-retry-photo-${row.rowNumber}-${i}`}>
                          {retrying === p.key ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}Retry upload</button>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
            {blockers.filter((b) => !/^Accept/.test(b)).length > 0
              ? <ul className="space-y-0.5 text-xs text-amber-900" data-testid={`list-blockers-${row.rowNumber}`}>{blockers.filter((b) => !/^Accept/.test(b)).map((b) => <li key={b}>· {b}</li>)}</ul>
              : <p className="text-xs text-emerald-800">Reviewed fields complete. This is still a preview until saved.</p>}
            <label className={`flex min-h-11 cursor-pointer items-center gap-2 border px-3 ${group.accepted ? "border-emerald-400 bg-emerald-50 text-emerald-900" : "border-border bg-background"} ${label}`}>
              <input type="checkbox" className="h-5 w-5" checked={group.accepted} disabled={busy || Boolean(group.savedAt) || existing}
                onChange={(e) => onPatch((g) => ({ ...g, accepted: e.target.checked }), true)} data-testid={`checkbox-accept-${row.rowNumber}`} />
              I reviewed this group
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
