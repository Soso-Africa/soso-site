import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import type { CommerceCatalogProduct } from "@workspace/api-client-react";
import type { PlatformContent, CatalogProduct } from "../../data/platformContent";
import type { SaveResult } from "./product/product-state";
import { ProductEditor } from "./product/ProductEditor";
import { PlatformEditorSupportInterface } from "./PlatformEditorRoutineCopy";
import { CopyPanel, PlatformCopyFields } from "./PlatformCopyFields";
import { CollectionEditor } from "./CollectionEditor";
import {
  isConfirmedMappingCurrent,
  isMappingPreviewFreshForReview,
} from "./product/mapping-staleness";
import {
  applyReviewFailure, applyReviewSuccess, mappingInputFingerprint, mergeWholeAnalysis,
  shouldAcceptReview, suggestionIfCurrent, toMappingProduct,
} from "./product/review-state";

export type MappingSuggestion = {
  slug: string;
  status: 'confident' | 'needs_review' | 'blocked';
  confidence: number;
  evidence: string[];
  productId?: string;
  productHash?: string;
  localHash?: string;
  variantIds: Record<string, string>;
  choiceLabels: Record<string, string>;
  issues: string[];
  /** Client-side: fingerprint of the exact mapping inputs this analysis was produced from. */
  inputFingerprint?: string;
};

export type MappingPreview = {
  snapshotHash: string;
  fetchedAt: string;
  suggestions: MappingSuggestion[];
};

type CatalogueData = Pick<PlatformContent, "products" | "collections" | "sizeGuide" | "productCopy" | "supportCopy" | "interfaceCopy">;

function newProductDraft(data: CatalogueData): CatalogProduct {
  const firstCollection = data.collections[0];
  const suffix = Date.now().toString(36);
  return {
    slug: `new-product-${suffix}`,
    name: "New catalogue product",
    img: "",
    images: [],
    materialTurnSets: [],
    price: 1,
    tag: "New",
    note: "",
    category: firstCollection?.category ?? "Uncategorised",
    department: firstCollection?.department ?? "men",
    releaseState: "placeholder",
    description: "",
    sizes: ["One Size"],
    relatedProductSlugs: [],
    colour: "Not specified",
    colourOptions: [{ id: "not-specified", label: "Not specified", hex: "#777777" }],
    allowCustomColour: false,
    fabric: "To be confirmed",
    fit: "To be confirmed",
    searchableTerms: [],
    merchandising: { isNew: true, label: "New", sortPriority: data.products.length },
    standardEligible: false,
    customEligible: false,
    standardSizes: [],
    readyNowSizes: [],
    fulfilmentState: "unavailable",
    dispatchMessage: "Dispatch timing will be confirmed before release.",
    unavailableMessage: "This product is being prepared for release.",
  };
}

export function PlatformEditorCatalogue({
  data,
  onChange,
  onUploadMedia,
  initialProductSlug,
  onDeleteProduct,
  onSaveProduct,
  savedProducts,
  onPublishProduct,
  publishedProducts,
  onPublishRemoval,
}: {
  data: CatalogueData;
  onChange: (data: CatalogueData) => void;
  onUploadMedia: (file: File) => Promise<string>;
  initialProductSlug?: string | null;
  onDeleteProduct: (slug: string) => Promise<string | null | undefined>;
  onSaveProduct: (slug: string) => Promise<SaveResult>;
  savedProducts: CatalogProduct[];
  onPublishProduct: (slug: string) => Promise<string>;
  publishedProducts: CatalogProduct[];
  onPublishRemoval: (slug: string) => Promise<string | undefined>;
}) {
  const [expandedProductIndex, setExpandedProductIndex] = useState<number | null>(() => {
    const index = initialProductSlug ? data.products.findIndex((product) => product.slug === initialProductSlug) : -1;
    return index >= 0 ? index : null;
  });
  const [commerceProducts, setCommerceProducts] = useState<CommerceCatalogProduct[]>([]);
  const [commerceStatus, setCommerceStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [deletingProductSlug, setDeletingProductSlug] = useState<string | null>(null);
  const [mappingPreview, setMappingPreview] = useState<MappingPreview | null>(null);
  const [mappingPreviewGeneration, setMappingPreviewGeneration] = useState(0);
  const [requiredPreviewGeneration, setRequiredPreviewGeneration] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [reviewingSlugs, setReviewingSlugs] = useState<Record<string, number>>({});
  const [reviewErrors, setReviewErrors] = useState<Record<string, string>>({});
  const [deleteError, setDeleteError] = useState("");
  const [deleteErrorSlug, setDeleteErrorSlug] = useState<string | null>(null);
  const [removingPublicSlug, setRemovingPublicSlug] = useState<string | null>(null);
  const [removalMessage, setRemovalMessage] = useState("");
  const [webhookStaleSlugs, setWebhookStaleSlugs] = useState<string[]>([]);
  const productsRef = useRef(data.products);
  const editorKeysRef = useRef<{ slug: string; key: number }[]>([]);
  const nextEditorKeyRef = useRef(0);
  const webhookStaleSlugsRef = useRef<string[]>([]);
  const analysisGenerationRef = useRef(0);
  const slugGenRef = useRef<Record<string, number>>({});
  const lastFpRef = useRef<Record<string, string>>({});
  const requiredGenRef = useRef(0);
  const setPreviewSuggestions = (update: (prev: MappingSuggestion[]) => MappingSuggestion[], meta?: { snapshotHash: string; fetchedAt: string }) =>
    setMappingPreview((prev) => {
      const base = prev ?? (meta ? { ...meta, suggestions: [] } : null);
      if (!base) return prev;
      return { ...base, ...(meta ?? {}), suggestions: update(base.suggestions) };
    });
  productsRef.current = data.products;
  requiredGenRef.current = requiredPreviewGeneration;
  const reviewedMappingPreview = useMemo(() => {
    if (!mappingPreview || !isMappingPreviewFreshForReview(mappingPreviewGeneration, requiredPreviewGeneration)) return null;
    // Only analyses produced from exactly the current editor inputs are usable.
    const suggestions = mappingPreview.suggestions.filter((s) => {
      const product = data.products.find((p) => p.slug === s.slug);
      return product ? Boolean(suggestionIfCurrent(s, product)) : false;
    });
    return { ...mappingPreview, suggestions };
  }, [data.products, mappingPreview, mappingPreviewGeneration, requiredPreviewGeneration]);

  // Any change to mapping inputs starts a new per-slug generation, invalidating in-flight reviews and old analysis.
  useEffect(() => {
    const changed: string[] = [];
    for (const product of data.products) {
      const fp = mappingInputFingerprint(product);
      if (lastFpRef.current[product.slug] !== undefined && lastFpRef.current[product.slug] !== fp) {
        slugGenRef.current[product.slug] = (slugGenRef.current[product.slug] ?? 0) + 1;
        changed.push(product.slug);
      }
      lastFpRef.current[product.slug] = fp;
    }
    if (changed.length === 0) return;
    setReviewingSlugs((c) => {
      const next = { ...c };
      for (const slug of changed) if (slug in next) {
        delete next[slug];
        setReviewErrors((e) => ({ ...e, [slug]: "Selections changed while the review was running, so the result was discarded. Review Mapping again." }));
      }
      return next;
    });
  }, [data.products]);

  useEffect(() => {
    if (!initialProductSlug) return;
    const index = data.products.findIndex((product) => product.slug === initialProductSlug);
    if (index < 0) return;
    setExpandedProductIndex(index);
    window.requestAnimationFrame(() => {
      document.getElementById(`catalogue-product-${initialProductSlug}`)?.scrollIntoView({ block: "start" });
    });
  }, [data.products, initialProductSlug]);

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

  const mappingSummary = useMemo(() => {
    const mapped = data.products.filter((product) => product.commerceProductId);
    const verified = mapped.filter((product) => commerceProducts.some((remote) => remote.id === product.commerceProductId));
    
    let analysis = null;
    if (reviewedMappingPreview) {
      const confirmed = data.products.filter(p => {
        const sugg = reviewedMappingPreview.suggestions.find(s => s.slug === p.slug);
        return isConfirmedMappingCurrent(p, sugg, webhookStaleSlugs.includes(p.slug));
      }).length;
      
      const stale = data.products.filter(p => {
        const sugg = reviewedMappingPreview.suggestions.find(s => s.slug === p.slug);
         return webhookStaleSlugs.includes(p.slug) || (p.commerceMappingConfirmation && sugg && (
           p.commerceMappingConfirmation.productHash !== sugg.productHash
           || p.commerceMappingConfirmation.localHash !== sugg.localHash
          ));
      }).length;
      
      const confident = reviewedMappingPreview.suggestions.filter(s => {
        const p = data.products.find(prod => prod.slug === s.slug);
        const isConfirmed = p ? isConfirmedMappingCurrent(p, s, webhookStaleSlugs.includes(p.slug)) : false;
        return !isConfirmed && s.status === 'confident';
      }).length;
      
      const needsReview = reviewedMappingPreview.suggestions.filter(s => {
        const p = data.products.find(prod => prod.slug === s.slug);
        const isConfirmed = p ? isConfirmedMappingCurrent(p, s, webhookStaleSlugs.includes(p.slug)) : false;
        return !isConfirmed && s.status === 'needs_review';
      }).length;
      
      const blocked = reviewedMappingPreview.suggestions.filter(s => {
        const p = data.products.find(prod => prod.slug === s.slug);
        const isConfirmed = p ? isConfirmedMappingCurrent(p, s, webhookStaleSlugs.includes(p.slug)) : false;
        return !isConfirmed && s.status === 'blocked';
      }).length;
      
      analysis = { confirmed, stale, confident, needsReview, blocked };
    }

    return { mapped: mapped.length, verified: verified.length, total: data.products.length, analysis };
  }, [commerceProducts, data.products, reviewedMappingPreview, webhookStaleSlugs]);

  const handleAnalyzeProduct = useCallback(async (slug: string) => {
    const row = productsRef.current.find((p) => p.slug === slug);
    if (!row) return;
    const submittedFp = mappingInputFingerprint(row);
    // Generation is bumped when the request STARTS, so any earlier in-flight response is stale.
    const requestEpoch = requiredGenRef.current; // webhook invalidation epoch at launch
    const requestGen = (slugGenRef.current[slug] = (slugGenRef.current[slug] ?? 0) + 1);
    const stillCurrent = () => shouldAcceptReview({
      submittedFp,
      currentFp: (() => { const p = productsRef.current.find((x) => x.slug === slug); return p ? mappingInputFingerprint(p) : undefined; })(),
      requestGen,
      currentGen: slugGenRef.current[slug] ?? 0,
      requestEpoch,
      currentEpoch: requiredGenRef.current,
    });
    setReviewingSlugs((c) => ({ ...c, [slug]: requestGen }));
    setReviewErrors((c) => ({ ...c, [slug]: "" }));
    try {
      const response = await fetch("/api/staff/commerce/catalogue-mapping/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ products: [toMappingProduct(row)] }),
        credentials: "include",
      });
      let result = {} as Partial<MappingPreview> & { error?: string };
      try { result = await response.json(); } catch { /* non-JSON body */ }
      if (!response.ok) {
        throw new Error(`${result.error || "The mapping service could not analyse this product"} (HTTP ${response.status}). ${response.status >= 500 ? "JusticeSure or the analysis service is unavailable; retry shortly." : "Check the selections and retry."}`);
      }
      if (!Array.isArray(result.suggestions) || !result.snapshotHash || !result.fetchedAt) throw new Error("The server returned an incomplete analysis. Retry.");
      const incoming = result.suggestions.find((s) => s.slug === slug);
      if (!incoming) throw new Error("The server returned no analysis for this product. Retry.");
      if (!stillCurrent()) return; // newer request or edit owns this slug now
      setPreviewSuggestions((prev) => applyReviewSuccess(prev, slug, incoming, submittedFp), { snapshotHash: result.snapshotHash, fetchedAt: result.fetchedAt });
      setMappingPreviewGeneration((g) => Math.max(g, analysisGenerationRef.current, requestEpoch));
    } catch (error) {
      if (!stillCurrent()) return;
      // A failed review must not leave an earlier analysis available for Confirm. Selections are untouched.
      setPreviewSuggestions((prev) => applyReviewFailure(prev, slug));
      setReviewErrors((c) => ({ ...c, [slug]: error instanceof Error ? error.message : "Mapping review failed. Retry." }));
    } finally {
      setReviewingSlugs((c) => {
        if (c[slug] !== requestGen) return c;
        const next = { ...c };
        delete next[slug];
        return next;
      });
    }
  }, []);

  const handleAnalyze = useCallback(async () => {
    const generation = ++analysisGenerationRef.current;
    setIsAnalyzing(true);
    setAnalysisError("");
    try {
      const rows = productsRef.current;
      const submitted: Record<string, { fp: string; gen: number }> = {};
      for (const p of rows) submitted[p.slug] = { fp: mappingInputFingerprint(p), gen: slugGenRef.current[p.slug] ?? 0 };
      const payload = { products: rows.map(toMappingProduct) };

      const response = await fetch("/api/staff/commerce/catalogue-mapping/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include"
      });

      const result = await response.json() as MappingPreview & { error?: string };
      if (!response.ok) throw new Error(result.error || "Catalogue analysis failed.");
      if (generation !== analysisGenerationRef.current) return;
      const current: Record<string, { fp: string; gen: number }> = {};
      for (const p of productsRef.current) current[p.slug] = { fp: mappingInputFingerprint(p), gen: slugGenRef.current[p.slug] ?? 0 };
      setMappingPreview((prev) => ({
        snapshotHash: result.snapshotHash,
        fetchedAt: result.fetchedAt,
        suggestions: mergeWholeAnalysis(prev?.suggestions ?? [], result.suggestions, submitted, current),
      }));
      setMappingPreviewGeneration(generation);
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "Catalogue analysis failed.");
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  useEffect(() => {
    if (commerceStatus !== "ready") return;
    void handleAnalyze();
    const interval = window.setInterval(() => { void handleAnalyze(); }, 60_000);
    return () => window.clearInterval(interval);
  }, [commerceStatus, handleAnalyze]);

  useEffect(() => {
    if (commerceStatus !== "ready") return;
    const controller = new AbortController();
    let active = true;
    const checkInvalidations = async () => {
      const confirmations = productsRef.current.flatMap((product) =>
        product.commerceProductId && product.commerceMappingConfirmation
          ? [{
            slug: product.slug,
            productId: product.commerceProductId,
            variantIds: Object.values(product.commerceVariantIds ?? {}),
            confirmedAt: product.commerceMappingConfirmation.confirmedAt,
          }]
          : []);
      try {
        const response = await fetch("/api/staff/commerce/catalogue-mapping/invalidations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmations }),
          credentials: "include",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const result = await response.json() as { staleSlugs?: string[] };
        if (!active || !Array.isArray(result.staleSlugs)) return;
        const newlyStale = result.staleSlugs.some((slug) => !webhookStaleSlugsRef.current.includes(slug));
        webhookStaleSlugsRef.current = result.staleSlugs;
        setWebhookStaleSlugs(result.staleSlugs);
        if (newlyStale) {
          const requiredGeneration = analysisGenerationRef.current + 1;
          requiredGenRef.current = requiredGeneration;
          setRequiredPreviewGeneration(requiredGeneration);
          setMappingPreview(null);
          const firstAffectedIndex = productsRef.current.findIndex((product) => result.staleSlugs!.includes(product.slug));
          if (firstAffectedIndex >= 0) setExpandedProductIndex(firstAffectedIndex);
          void handleAnalyze();
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    };
    void checkInvalidations();
    const interval = window.setInterval(() => { void checkInvalidations(); }, 5_000);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(interval);
    };
  }, [commerceStatus, handleAnalyze]);

  const handleBulkConfirm = () => {
    if (!reviewedMappingPreview) return;
    const now = new Date().toISOString();
    let updatedCount = 0;
    
    const nextProducts = data.products.map(p => {
      const suggestion = reviewedMappingPreview.suggestions.find(s => s.slug === p.slug);
      if (!suggestion || suggestion.status !== 'confident') return p;
      const confirmation = p.commerceMappingConfirmation;
      if (confirmation
        && confirmation.productHash === suggestion.productHash
        && confirmation.localHash === suggestion.localHash
        && !webhookStaleSlugs.includes(p.slug)) return p;
      
      updatedCount++;
      return {
        ...p,
        commerceProductId: suggestion.productId,
        commerceVariantIds: suggestion.variantIds,
        commerceMappingConfirmation: {
          productHash: suggestion.productHash!,
           localHash: suggestion.localHash!,
          snapshotHash: reviewedMappingPreview.snapshotHash,
          snapshotFetchedAt: reviewedMappingPreview.fetchedAt,
          confirmedAt: now,
          confidence: suggestion.confidence,
          source: "automatic" as const,
          evidence: suggestion.evidence,
          choiceLabels: suggestion.choiceLabels
        }
      };
    });
    
    if (updatedCount > 0) {
      onChange({ ...data, products: nextProducts });
    }
  };

  const updateProduct = (index: number, product: CatalogProduct) => {
    const products = [...data.products];
    products[index] = product;
    onChange({ ...data, products });
  };

  const addProduct = () => {
    const products = [newProductDraft(data), ...data.products];
    onChange({ ...data, products });
    setExpandedProductIndex(0);
  };
  const deleteProduct = async (slug: string) => {
    if (deletingProductSlug) return;
    setDeleteError("");
    setDeleteErrorSlug(slug);
    setDeletingProductSlug(slug);
    try {
      const error = await onDeleteProduct(slug);
      setDeleteError(error ?? "");
      if (error === null) setExpandedProductIndex(null);
    } catch {
      setDeleteError("Product deletion failed. Reload the catalogue and try again.");
    } finally {
      setDeletingProductSlug(null);
    }
  };
  const pendingPublicRemovals = publishedProducts.filter(
    (product) => !data.products.some((draftProduct) => draftProduct.slug === product.slug),
  );
  // A slug is editable: using it as React's key remounts the input on every keystroke.
  // Match existing products by slug across insertions/removals, then by position for a rename.
  const previousEditorKeys = editorKeysRef.current;
  const usedEditorKeys = new Set<number>();
  const editorKeys = data.products.map((product, index) => {
    const match = previousEditorKeys.find((entry) => entry.slug === product.slug && !usedEditorKeys.has(entry.key));
    const previousAtIndex = previousEditorKeys[index];
    const renamedAtIndex = previousEditorKeys.length === data.products.length &&
      previousAtIndex && !data.products.some((item) => item.slug === previousAtIndex.slug) &&
      !usedEditorKeys.has(previousAtIndex.key);
    const key = match?.key ?? (renamedAtIndex ? previousAtIndex.key : nextEditorKeyRef.current++);
    usedEditorKeys.add(key);
    return { slug: product.slug, key };
  });
  editorKeysRef.current = editorKeys;

  return (
    <div className="mt-5 space-y-5">
      <section className="border border-border bg-card p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">Catalogue Products</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Select exact JusticeSure inventory records. SOSO never silently matches products by name.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="border border-border bg-background px-3 py-2 text-[10px] uppercase tracking-wider">
              {commerceStatus === "loading" && <span className="text-muted-foreground">Loading JusticeSure catalogue…</span>}
              {commerceStatus === "unavailable" && <span className="text-destructive">JusticeSure catalogue unavailable</span>}
              {commerceStatus === "ready" && (
                <span className={mappingSummary.verified === mappingSummary.total ? "text-emerald-700" : "text-amber-700"}>
                  {mappingSummary.verified} IDs found · {mappingSummary.mapped} mapped · {mappingSummary.total} SOSO products
                </span>
              )}
            </div>
            
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={addProduct}
                data-testid="button-add-catalogue-product"
                className="inline-flex items-center gap-2 bg-primary px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="h-3 w-3" />
                Add new product
              </button>
              {commerceStatus === "ready" && (
                <>
                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={isAnalyzing}
                  className="flex items-center gap-2 border border-border bg-background px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-primary hover:bg-muted/30 disabled:opacity-50 transition-colors"
                >
                  {isAnalyzing && <Loader2 className="h-3 w-3 animate-spin" />}
                  {reviewedMappingPreview ? "Re-analyze Catalogue" : "Analyze Catalogue"}
                </button>
                
                {reviewedMappingPreview && mappingSummary.analysis && mappingSummary.analysis.confident > 0 && (
                  <button
                    type="button"
                    onClick={handleBulkConfirm}
                    data-testid="button-confirm-safe-matches"
                    className="border border-emerald-300 bg-emerald-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 hover:bg-emerald-100 transition-colors"
                  >
                    Confirm {mappingSummary.analysis.confident} Safe Match{mappingSummary.analysis.confident === 1 ? '' : 'es'}
                  </button>
                )}
                </>
              )}
            </div>
          </div>
        </div>

        {mappingPreview && mappingSummary.analysis && (
          <div className="mb-4 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-wider" data-testid="catalogue-mapping-summary">
            <span className="border border-emerald-200 bg-emerald-50/50 px-2 py-1 text-emerald-700">
              Confirmed: {mappingSummary.analysis.confirmed}
            </span>
            {mappingSummary.analysis.stale > 0 && (
              <span className="border border-amber-200 bg-amber-50/50 px-2 py-1 text-amber-700">
                Stale: {mappingSummary.analysis.stale}
              </span>
            )}
            <span className="border border-emerald-200 bg-emerald-50/50 px-2 py-1 text-emerald-700">
              Confident: {mappingSummary.analysis.confident}
            </span>
            <span className="border border-amber-200 bg-amber-50/50 px-2 py-1 text-amber-700">
              Needs Review: {mappingSummary.analysis.needsReview}
            </span>
            <span className="border border-destructive/20 bg-destructive/10 px-2 py-1 text-destructive">
              Blocked: {mappingSummary.analysis.blocked}
            </span>
          </div>
        )}
        {webhookStaleSlugs.length > 0 && (
          <p role="alert" className="mb-4 border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            JusticeSure reported a change to: {data.products
              .filter((product) => webhookStaleSlugs.includes(product.slug))
              .map((product) => product.name)
              .join(", ")}. Review and confirm {webhookStaleSlugs.length === 1 ? "this mapping" : "these mappings"} again before saving or publishing.
          </p>
        )}
        {webhookStaleSlugs.length > 0 && !reviewedMappingPreview && (
          <p role="status" className="mb-4 border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            Refreshing the JusticeSure catalogue. Reconfirmation stays disabled until the current catalogue is available.
          </p>
        )}
        {analysisError && (
          <p role="alert" className="mb-4 border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {analysisError}
          </p>
        )}
        {pendingPublicRemovals.length > 0 && (
          <div className="mb-4 space-y-3 border border-amber-300 bg-amber-50 p-4" data-testid="pending-public-product-removals">
            <p className="text-xs font-semibold text-amber-900">Removed from the draft, but still on the live storefront</p>
            <p className="text-xs text-amber-900">You can publish the removal of an unavailable, unmapped product without changing the rest of the catalogue. Save any other edits and clear public references first.</p>
            {pendingPublicRemovals.map((product) => (
              <div key={product.slug} className="flex flex-wrap items-center justify-between gap-2 border-t border-amber-200 pt-3">
                <span className="text-xs text-amber-950">{product.name} <span className="font-mono text-[10px]">({product.slug})</span></span>
                {product.fulfilmentState === "unavailable" && !product.commerceProductId && !product.commerceVariantIds && !product.commerceMappingConfirmation
                  ? <button type="button" disabled={removingPublicSlug !== null}
                      data-testid={`button-publish-product-removal-${product.slug}`}
                      onClick={async () => {
                        setRemovingPublicSlug(product.slug);
                        setRemovalMessage("");
                        try { setRemovalMessage(await onPublishRemoval(product.slug) ?? ""); }
                        finally { setRemovingPublicSlug(null); }
                      }}
                      className="min-h-10 border border-destructive/50 bg-background px-3 text-[10px] font-semibold uppercase tracking-wider text-destructive hover:bg-destructive/10 disabled:opacity-50">
                      {removingPublicSlug === product.slug ? "Removing…" : "Publish removal"}
                    </button>
                  : <span className="text-xs text-amber-900">Available or mapped: use full catalogue publication after mapping review.</span>}
              </div>
            ))}
            {removalMessage && <p role="status" data-testid="product-removal-status" className="border border-amber-300 bg-background p-3 text-xs text-amber-950">{removalMessage}</p>}
          </div>
        )}

        <div className="space-y-4">
        {data.products?.map((product, index) => {
          const suggestion = reviewedMappingPreview?.suggestions.find(s => s.slug === product.slug);
          return (
            <ProductEditor
              key={editorKeys[index]!.key}
              product={product}
              allProducts={data.products}
              collections={data.collections}
              isExpanded={expandedProductIndex === index}
              onToggle={() => setExpandedProductIndex(expandedProductIndex === index ? null : index)}
              onChange={(updatedProduct) => updateProduct(index, updatedProduct)}
              onDelete={() => void deleteProduct(product.slug)}
              deleting={deletingProductSlug === product.slug}
              deleteError={deleteErrorSlug === product.slug ? deleteError : ""}
              onSave={() => onSaveProduct(product.slug)}
              onPublish={() => onPublishProduct(product.slug)}
              onUploadMedia={onUploadMedia}
              commerceProducts={commerceProducts}
              commerceStatus={commerceStatus}
              mappingSuggestion={suggestion}
              isWebhookStale={webhookStaleSlugs.includes(product.slug)}
              savedProduct={savedProducts.find((item) => item.slug === product.slug)}
              publishedProduct={publishedProducts.find((item) => item.slug === product.slug)}
              onReviewMapping={() => void handleAnalyzeProduct(product.slug)}
              isReviewingMapping={product.slug in reviewingSlugs}
              reviewMappingError={reviewErrors[product.slug] ?? ""}
              mappingPreviewMeta={reviewedMappingPreview ? { snapshotHash: reviewedMappingPreview.snapshotHash, fetchedAt: reviewedMappingPreview.fetchedAt } : undefined}
            />
          );
        })}
        </div>
      </section>
      <CopyPanel title="Collections" description="Collection names, departments, storefront introductions and search metadata.">
        <CollectionEditor
          collections={data.collections}
          onChange={(collections) => onChange({ ...data, collections })}
          onUploadMedia={onUploadMedia}
        />
      </CopyPanel>
      <CopyPanel title="Size guide" description="Shared size-guide headings, measurements and custom-sizing guidance.">
        <PlatformCopyFields
          value={data.sizeGuide}
          path={["sizeGuide"]}
          onChange={(sizeGuide) => onChange({ ...data, sizeGuide: sizeGuide as PlatformContent["sizeGuide"] })}
        />
      </CopyPanel>
      <CopyPanel title="Product page copy" description="Shared product labels, fit guidance, assurances and product-page interface text.">
        <PlatformCopyFields
          value={data.productCopy}
          path={["productCopy"]}
          onChange={(productCopy) => onChange({ ...data, productCopy: productCopy as PlatformContent["productCopy"] })}
        />
      </CopyPanel>
      <PlatformEditorSupportInterface
        supportCopy={data.supportCopy}
        interfaceCopy={data.interfaceCopy}
        onSupportChange={(supportCopy) => onChange({ ...data, supportCopy })}
        onInterfaceChange={(interfaceCopy) => onChange({ ...data, interfaceCopy })}
      />
    </div>
  );
}
