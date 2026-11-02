import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Loader2, RefreshCw, Search } from "lucide-react";
import { getStaffProductEditor, listStaffProductIndex, saveStaffProductEditor, type CommerceCatalogProduct, type StaffProductCommit, type StaffProductEditor } from "@workspace/api-client-react";
import type { CatalogProduct } from "../../data/platformContent";
import { ProductEditor } from "./product/ProductEditor";
import type { SaveResult } from "./product/product-state";
import type { MappingPreview } from "./PlatformEditorCatalogue";
import { platformActionError } from "./platform-action-error";
import {
  applyReviewFailure, applyReviewSuccess, mappingInputFingerprint, toMappingProduct, type ReviewedSuggestion,
} from "./product/review-state";
import {
  advanceSiblingVersions, applySaveConflict, applySaveSuccess, entryFromResponse, isEntryDirty, isVersionConflict, mergeKnown,
  rebaseOntoLatest, relatedCandidates, shouldAcceptLoad,
  type FocusedEntry, type ProductEditorResponse, type ProductEditorSaveResponse, type ProductIndexItem,
} from "./product/focused-workspace-state";

const PAGE_SIZE = 25;

/** Known boundary: the server validates product documents; the generated schema types them loosely. */
const toEditorResponse = (r: StaffProductEditor): ProductEditorResponse => ({
  ...r,
  product: r.product as unknown as CatalogProduct,
  publishedProduct: r.publishedProduct as unknown as CatalogProduct | null,
});
const toSaveResponse = (r: StaffProductCommit): ProductEditorSaveResponse => ({ ...r, product: r.product as unknown as CatalogProduct });

export function FocusedProductWorkspace({
  initialProductSlug,
  onOpenFullTools,
  onDirtyChange,
  onUploadMedia,
}: {
  initialProductSlug?: string | null;
  onOpenFullTools: () => void;
  onDirtyChange?: (dirtySlugs: string[]) => void;
  onUploadMedia: (file: File) => Promise<string>;
}) {
  // ---- Bounded, searchable index ----
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ProductIndexItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [indexStatus, setIndexStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  const indexRequestRef = useRef(0);
  const knownNamesRef = useRef(new Map<string, string>());

  const remember = (list: ProductIndexItem[]) => { for (const item of list) knownNamesRef.current.set(item.slug, item.name); };

  const loadIndex = useCallback(async (q: string, after: string | null) => {
    const requestId = ++indexRequestRef.current;
    if (after) setLoadingMore(true); else setIndexStatus("loading");
    try {
      const page = await listStaffProductIndex({ limit: PAGE_SIZE, ...(q.trim() ? { q: q.trim() } : {}), ...(after ? { after } : {}) });
      if (requestId !== indexRequestRef.current) return;
      remember(page.items);
      setItems((prev) => after ? mergeKnown(prev, page.items) : page.items);
      setNextCursor(page.nextCursor);
      setIndexStatus("ready");
    } catch {
      if (requestId !== indexRequestRef.current) return;
      if (!after) setIndexStatus("error");
    } finally {
      if (requestId === indexRequestRef.current) setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadIndex(query, null), query ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [query, loadIndex]);

  // ---- Per-product entries (unsaved edits live here, keyed by slug) ----
  const [entries, setEntries] = useState<Record<string, FocusedEntry>>({});
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const [selectedSlug, setSelectedSlug] = useState<string | null>(initialProductSlug ?? null);
  const [detailStatus, setDetailStatus] = useState<Record<string, { loading: boolean; error: string }>>({});
  const detailRequestRef = useRef<Record<string, number>>({});
  const [notice, setNotice] = useState("");

  const dirtySlugs = useMemo(() => Object.values(entries).filter(isEntryDirty).map((e) => e.slug), [entries]);
  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;
  const dirtyKey = dirtySlugs.join("|");
  useEffect(() => { onDirtyChangeRef.current?.(dirtySlugs); }, [dirtyKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!dirtySlugs.length) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirtySlugs.length]);

  const fetchDetail = useCallback(async (slug: string, mode: "initial" | "replace" | "rebase") => {
    const requestId = (detailRequestRef.current[slug] ?? 0) + 1;
    detailRequestRef.current[slug] = requestId;
    setDetailStatus((s) => ({ ...s, [slug]: { loading: true, error: "" } }));
    try {
      const response = toEditorResponse(await getStaffProductEditor(slug));
      const hasEntry = Boolean(entriesRef.current[slug]);
      if (mode === "rebase") {
        if (requestId !== detailRequestRef.current[slug] || !entriesRef.current[slug]) return;
      } else if (!shouldAcceptLoad({ requestId, latestRequestId: detailRequestRef.current[slug] ?? 0, hasEntry, explicitReplace: mode === "replace" })) {
        return;
      }
      remember(response.relatedProducts);
      remember([{ slug: response.product.slug, name: response.product.name }]);
      setEntries((prev) => {
        const next = { ...prev };
        next[slug] = mode === "rebase" && prev[slug] ? rebaseOntoLatest(prev[slug]!, response) : entryFromResponse(slug, response);
        entriesRef.current = next;
        return next;
      });
      setDetailStatus((s) => ({ ...s, [slug]: { loading: false, error: "" } }));
    } catch (error) {
      if (requestId !== detailRequestRef.current[slug]) return;
      setDetailStatus((s) => ({ ...s, [slug]: { loading: false, error: platformActionError(error, "This product could not be loaded.") } }));
    }
  }, []);

  useEffect(() => {
    if (selectedSlug && !entriesRef.current[selectedSlug] && !detailStatus[selectedSlug]?.loading) void fetchDetail(selectedSlug, "initial");
    // Only fetch when the selection changes; retries are explicit.
  }, [selectedSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectProduct = (slug: string) => {
    setNotice("");
    setSelectedSlug(slug);
  };

  const updateLocal = (slug: string, product: CatalogProduct) => {
    setEntries((prev) => {
      const current = prev[slug];
      if (!current) return prev;
      // Slug is immutable in focused mode.
      const next = { ...prev, [slug]: { ...current, local: { ...product, slug: current.base.slug } } };
      entriesRef.current = next;
      return next;
    });
  };

  const refreshProduct = (slug: string) => {
    if (isEntryDirty(entriesRef.current[slug]) && !window.confirm("Reload the saved draft for this product? Your unsaved changes to this product will be discarded.")) return;
    setNotice("");
    void fetchDetail(slug, "replace");
  };

  const discardProduct = (slug: string) => {
    const entry = entriesRef.current[slug];
    if (!entry || !isEntryDirty(entry)) return;
    if (!window.confirm("Discard your unsaved changes to this product? This cannot be undone.")) return;
    setEntries((prev) => {
      const current = prev[slug];
      if (!current) return prev;
      const next = { ...prev, [slug]: { ...current, local: current.base, conflict: "" } };
      entriesRef.current = next;
      return next;
    });
    setNotice("Unsaved changes discarded. The saved draft is shown.");
  };

  const keepMineAfterConflict = (slug: string) => {
    if (!window.confirm("Load the latest saved version as the starting point but keep your edits on screen? When you save, your version of this whole product replaces whatever is in the saved draft for it, including any change made elsewhere.")) return;
    void fetchDetail(slug, "rebase");
  };

  // ---- Save (draft only) ----
  // One busy flag for all products: saves share the global draft fence, so they must not race.
  const savingRef = useRef(false);
  const saveProduct = async (slug: string): Promise<SaveResult> => {
    const entry = entriesRef.current[slug];
    if (!entry) return { ok: false, message: "Load this product before saving." };
    if (savingRef.current) return { ok: false, message: "Another product save is still running. Wait for it to finish, then save again. Your edits are kept." };
    if (entry.conflict) return { ok: false, message: "Resolve the version conflict above first. Your edits are kept." };
    const submitted = entry.local;
    const submittedVersion = entry.draftUpdatedAt;
    savingRef.current = true;
    try {
      const response = toSaveResponse(await saveStaffProductEditor(slug, {
        product: submitted as unknown as Record<string, unknown>, expectedDraftUpdatedAt: submittedVersion,
      }));
      setEntries((prev) => {
        const current = prev[slug];
        if (!current) return prev;
        const advanced = advanceSiblingVersions(prev, slug, submittedVersion, response.draftUpdatedAt);
        const next = { ...advanced, [slug]: applySaveSuccess(current, submitted, response) };
        entriesRef.current = next;
        return next;
      });
      remember([{ slug, name: response.product.name }]);
      setItems((prev) => prev.map((item) => item.slug === slug ? { slug, name: response.product.name } : item));
      return { ok: true, message: `${response.product.name} saved to the unpublished draft only. The storefront was not updated.` };
    } catch (error) {
      if (isVersionConflict(error)) {
        const message = "The saved draft changed after this product was loaded (another save, possibly of a different product). Your edits are kept on screen and were not saved.";
        setEntries((prev) => {
          const current = prev[slug];
          if (!current) return prev;
          const next = { ...prev, [slug]: applySaveConflict(current, message) };
          entriesRef.current = next;
          return next;
        });
        return { ok: false, message };
      }
      return { ok: false, message: `${platformActionError(error, "Product could not be saved.")} Your edits are kept.` };
    } finally {
      savingRef.current = false;
    }
  };

  // ---- JusticeSure mapping review (existing endpoints) ----
  const [commerceProducts, setCommerceProducts] = useState<CommerceCatalogProduct[]>([]);
  const [commerceStatus, setCommerceStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [suggestions, setSuggestions] = useState<ReviewedSuggestion[]>([]);
  const [previewMeta, setPreviewMeta] = useState<Record<string, Pick<MappingPreview, "snapshotHash" | "fetchedAt">>>({});
  const [reviewing, setReviewing] = useState<Record<string, number>>({});
  const [reviewErrors, setReviewErrors] = useState<Record<string, string>>({});
  const [webhookStale, setWebhookStale] = useState<string[]>([]);
  const reviewGenRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/staff/commerce/catalogue", { credentials: "include", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Commerce catalogue unavailable");
        const payload = await response.json() as { products?: CommerceCatalogProduct[] };
        if (!Array.isArray(payload.products)) throw new Error("Invalid Commerce catalogue");
        setCommerceProducts(payload.products);
        setCommerceStatus("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setCommerceStatus("unavailable");
      });
    return () => controller.abort();
  }, []);

  const selectedEntry = selectedSlug ? entries[selectedSlug] : undefined;
  const confirmationKey = selectedEntry?.base.commerceMappingConfirmation?.confirmedAt ?? "";
  useEffect(() => {
    if (commerceStatus !== "ready" || !selectedEntry) return;
    const product = selectedEntry.base;
    if (!product.commerceProductId || !product.commerceMappingConfirmation) return;
    const controller = new AbortController();
    void fetch("/api/staff/commerce/catalogue-mapping/invalidations", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", signal: controller.signal,
      body: JSON.stringify({ confirmations: [{
        slug: product.slug, productId: product.commerceProductId,
        variantIds: Object.values(product.commerceVariantIds ?? {}), confirmedAt: product.commerceMappingConfirmation.confirmedAt,
      }] }),
    }).then(async (response) => {
      if (!response.ok) return;
      const result = await response.json() as { staleSlugs?: string[] };
      if (!Array.isArray(result.staleSlugs)) return;
      const stale = result.staleSlugs.includes(product.slug);
      setWebhookStale((prev) => stale ? Array.from(new Set([...prev, product.slug])) : prev.filter((s) => s !== product.slug));
      if (stale) setSuggestions((prev) => applyReviewFailure(prev, product.slug));
    }).catch(() => { /* Saving still validates live mappings. */ });
    return () => controller.abort();
  }, [commerceStatus, selectedEntry?.slug, confirmationKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const reviewMapping = async (slug: string) => {
    const row = entriesRef.current[slug]?.local;
    if (!row) return;
    const submittedFp = mappingInputFingerprint(row);
    const gen = (reviewGenRef.current[slug] = (reviewGenRef.current[slug] ?? 0) + 1);
    const stillCurrent = () => {
      const current = entriesRef.current[slug]?.local;
      return reviewGenRef.current[slug] === gen && Boolean(current) && mappingInputFingerprint(current!) === submittedFp;
    };
    setReviewing((c) => ({ ...c, [slug]: gen }));
    setReviewErrors((c) => ({ ...c, [slug]: "" }));
    try {
      const response = await fetch("/api/staff/commerce/catalogue-mapping/preview", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ products: [toMappingProduct(row)] }),
      });
      let result = {} as Partial<MappingPreview> & { error?: string };
      try { result = await response.json(); } catch { /* non-JSON body */ }
      if (!response.ok) throw new Error(`${result.error || "The mapping service could not analyse this product"} (HTTP ${response.status}). Retry shortly.`);
      if (!Array.isArray(result.suggestions) || !result.snapshotHash || !result.fetchedAt) throw new Error("The server returned an incomplete analysis. Retry.");
      const incoming = result.suggestions.find((s) => s.slug === slug);
      if (!incoming) throw new Error("The server returned no analysis for this product. Retry.");
      if (!stillCurrent()) {
        setReviewErrors((c) => ({ ...c, [slug]: "Selections changed while the review was running, so the result was discarded. Review Mapping again." }));
        return;
      }
      setSuggestions((prev) => applyReviewSuccess(prev, slug, incoming, submittedFp));
      setPreviewMeta((m) => ({ ...m, [slug]: { snapshotHash: result.snapshotHash!, fetchedAt: result.fetchedAt! } }));
    } catch (error) {
      if (reviewGenRef.current[slug] !== gen) return;
      setSuggestions((prev) => applyReviewFailure(prev, slug));
      setReviewErrors((c) => ({ ...c, [slug]: error instanceof Error ? error.message : "Mapping review failed. Retry." }));
    } finally {
      setReviewing((c) => {
        if (c[slug] !== gen) return c;
        const next = { ...c };
        delete next[slug];
        return next;
      });
    }
  };

  // ---- Related-product search (paged index; absence from a page never means deletion) ----
  const [relatedQuery, setRelatedQuery] = useState("");
  const [relatedItems, setRelatedItems] = useState<ProductIndexItem[]>([]);
  const [relatedCursor, setRelatedCursor] = useState<string | null>(null);
  const [relatedStatus, setRelatedStatus] = useState<"idle" | "loading" | "error">("idle");
  const relatedRequestRef = useRef(0);
  const searchRelated = async (after: string | null) => {
    const requestId = ++relatedRequestRef.current;
    setRelatedStatus("loading");
    try {
      const page = await listStaffProductIndex({ limit: PAGE_SIZE, ...(relatedQuery.trim() ? { q: relatedQuery.trim() } : {}), ...(after ? { after } : {}) });
      if (requestId !== relatedRequestRef.current) return;
      remember(page.items);
      setRelatedItems((prev) => after ? mergeKnown(prev, page.items) : page.items);
      setRelatedCursor(page.nextCursor);
      setRelatedStatus("idle");
    } catch {
      if (requestId === relatedRequestRef.current) setRelatedStatus("error");
    }
  };

  const status = selectedSlug ? detailStatus[selectedSlug] : undefined;
  const candidates = selectedEntry ? relatedCandidates(selectedEntry.local, knownNamesRef.current, mergeKnown(selectedEntry.relatedProducts, relatedItems)) : [];

  return (
    <div className="mt-5 space-y-4" data-testid="focused-product-workspace">
      <div className="flex flex-wrap items-start justify-between gap-3 border border-primary/25 bg-primary/5 p-4">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-primary">Product editing · drafts only</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Change one product at a time. Saving here updates the unpublished draft only; nothing goes live from this view.
            Approval, publishing, deleting and new products use the full catalogue tools, which keep their usual safety checks.
          </p>
        </div>
        <button type="button" onClick={onOpenFullTools} data-testid="button-open-full-catalogue-tools"
          className="min-h-10 border border-primary px-3 text-xs font-semibold text-primary hover:bg-primary/10">
          Open full catalogue tools
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="border border-border bg-card" aria-label="Products">
          <label className="flex items-center gap-2 border-b border-border p-3">
            <Search size={14} className="text-muted-foreground" />
            <span className="sr-only">Search products</span>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or slug"
              className="staff-input text-xs" data-testid="input-focused-product-search" />
          </label>
          {indexStatus === "loading" ? (
            <div className="space-y-2 p-3" aria-busy="true">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-8 animate-pulse bg-muted/50" />)}</div>
          ) : indexStatus === "error" ? (
            <div className="p-3 text-xs">
              <p role="alert" className="text-destructive">Products could not be listed.</p>
              <button type="button" onClick={() => void loadIndex(query, null)} className="mt-2 border border-primary px-3 py-1.5 text-xs font-semibold text-primary">Retry</button>
            </div>
          ) : items.length === 0 ? (
            <p className="p-4 text-xs text-muted-foreground">{query ? "No products match this search." : "No saved products yet. Add products with the full catalogue tools."}</p>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto">
              {items.map((item) => {
                const selected = item.slug === selectedSlug;
                const dirty = isEntryDirty(entries[item.slug]);
                return <li key={item.slug}>
                  <button type="button" onClick={() => selectProduct(item.slug)} aria-current={selected ? "true" : undefined}
                    data-testid={`focused-product-${item.slug}`}
                    className={`flex w-full items-start justify-between gap-2 border-l-2 px-3 py-2 text-left ${selected ? "border-primary bg-primary/10" : "border-transparent hover:bg-muted/40"}`}>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium">{entries[item.slug]?.local.name ?? item.name}</span>
                      <span className="block truncate font-mono text-[10px] text-muted-foreground">{item.slug}</span>
                    </span>
                    {dirty && <span className="shrink-0 border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-800">Unsaved</span>}
                  </button>
                </li>;
              })}
            </ul>
          )}
          {nextCursor && indexStatus === "ready" && (
            <button type="button" disabled={loadingMore} onClick={() => void loadIndex(query, nextCursor)}
              className="w-full border-t border-border p-2 text-xs font-semibold text-primary disabled:opacity-50">
              {loadingMore ? "Loading…" : "Show more products"}
            </button>
          )}
          {dirtySlugs.length > 0 && <p className="border-t border-border p-3 text-[11px] text-amber-800">{dirtySlugs.length} product{dirtySlugs.length === 1 ? " has" : "s have"} unsaved changes. Switching products keeps them.</p>}
        </aside>

        <div className="min-w-0 space-y-3">
          {!selectedSlug ? (
            <div className="border border-dashed border-border bg-card p-8 text-center">
              <p className="text-sm font-medium">Choose a product to edit</p>
              <p className="mt-1 text-xs text-muted-foreground">Only the product you open is loaded, so this stays quick on slow connections.</p>
            </div>
          ) : !selectedEntry ? (
            status?.error ? (
              <div role="alert" className="border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                {status.error}
                <button type="button" onClick={() => void fetchDetail(selectedSlug, "initial")} className="ml-3 border border-destructive/40 px-3 py-1 text-xs font-semibold">Retry</button>
              </div>
            ) : (
              <div className="space-y-3 border border-border bg-card p-5" aria-busy="true">
                <div className="h-5 w-1/3 animate-pulse bg-muted/60" />
                <div className="h-24 animate-pulse bg-muted/40" />
                <div className="h-24 animate-pulse bg-muted/40" />
              </div>
            )
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border border-border bg-card px-4 py-3 text-xs">
                <span className="text-muted-foreground">
                  Draft saved {new Date(selectedEntry.draftUpdatedAt).toLocaleString()} · {selectedEntry.publishedAt ? `Site last published ${new Date(selectedEntry.publishedAt).toLocaleString()}` : "Not published yet"}
                </span>
                <span className="flex gap-2">
                  <button type="button" disabled={status?.loading} onClick={() => refreshProduct(selectedSlug)}
                    className="inline-flex min-h-9 items-center gap-1 border border-border px-3 font-semibold disabled:opacity-50" data-testid="button-focused-refresh">
                    {status?.loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Reload saved draft
                  </button>
                  <button type="button" disabled={!isEntryDirty(selectedEntry)} onClick={() => discardProduct(selectedSlug)}
                    className="min-h-9 border border-destructive/40 px-3 font-semibold text-destructive disabled:opacity-40" data-testid="button-focused-discard">
                    Discard changes
                  </button>
                </span>
              </div>
              {status?.error && <p role="alert" className="border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">{status.error} Your edits are unchanged.</p>}
              {selectedEntry.conflict && (
                <div role="alert" className="border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950" data-testid="focused-conflict">
                  <p className="flex items-center gap-2 font-semibold"><AlertCircle size={14} /> {selectedEntry.conflict}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => keepMineAfterConflict(selectedSlug)} className="min-h-9 border border-amber-400 bg-background px-3 font-semibold">Load the latest draft and keep my edits</button>
                    <button type="button" onClick={() => refreshProduct(selectedSlug)} className="min-h-9 border border-amber-400 bg-background px-3 font-semibold">Load their version (discard mine)</button>
                  </div>
                </div>
              )}
              {notice && <p role="status" className="border border-primary/25 bg-primary/5 p-3 text-xs">{notice}</p>}
              <ProductEditor
                key={selectedSlug}
                product={selectedEntry.local}
                allProducts={candidates}
                collections={selectedEntry.collections}
                isExpanded
                onToggle={() => undefined}
                onChange={(product) => updateLocal(selectedSlug, product)}
                onDelete={onOpenFullTools}
                onSave={() => saveProduct(selectedSlug)}
                onPublish={async () => "Publishing is not available in product editing. Open the full catalogue tools."}
                onUploadMedia={onUploadMedia}
                commerceProducts={commerceProducts}
                commerceStatus={commerceStatus}
                mappingSuggestion={suggestions.find((s) => s.slug === selectedSlug)}
                mappingPreviewMeta={previewMeta[selectedSlug]}
                isWebhookStale={webhookStale.includes(selectedSlug)}
                savedProduct={selectedEntry.base}
                publishedProduct={selectedEntry.published ?? undefined}
                onReviewMapping={() => void reviewMapping(selectedSlug)}
                isReviewingMapping={selectedSlug in reviewing}
                reviewMappingError={reviewErrors[selectedSlug] ?? ""}
                focusedMode={{ onOpenFullTools }}
              />
              <form className="border border-border bg-card p-4" onSubmit={(e) => { e.preventDefault(); void searchRelated(null); }}>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">Find products to link as related</p>
                <p className="mt-1 text-[11px] text-muted-foreground">Linked products always stay listed in Related Product Slugs above. Results you find here are added as extra choices.</p>
                <div className="mt-2 flex gap-2">
                  <input type="search" value={relatedQuery} onChange={(e) => setRelatedQuery(e.target.value)} placeholder="Name or slug" className="staff-input text-xs" data-testid="input-focused-related-search" />
                  <button type="submit" disabled={relatedStatus === "loading"} className="min-h-9 border border-primary px-3 text-xs font-semibold text-primary disabled:opacity-50">{relatedStatus === "loading" ? "Searching…" : "Search"}</button>
                </div>
                {relatedStatus === "error" && <p role="alert" className="mt-2 text-xs text-destructive">Search failed. Your edits are unchanged; try again.</p>}
                {relatedItems.length > 0 && <p className="mt-2 text-[11px] text-muted-foreground">{relatedItems.length} product{relatedItems.length === 1 ? "" : "s"} added to the choices above.</p>}
                {relatedCursor && <button type="button" disabled={relatedStatus === "loading"} onClick={() => void searchRelated(relatedCursor)} className="mt-2 text-xs font-semibold text-primary underline disabled:opacity-50">Show more results</button>}
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
