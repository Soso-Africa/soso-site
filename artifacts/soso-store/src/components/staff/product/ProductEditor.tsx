import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, AlertCircle, Loader2 } from "lucide-react";
import type { CommerceCatalogProduct } from "@workspace/api-client-react";
import type { CatalogProduct, PlatformCollection } from "../../../data/platformContent";
import type { MappingSuggestion, MappingPreview } from "../PlatformEditorCatalogue";
import { validateProduct } from "./ProductValidation";
import {
  handleToggleCustomEligible,
  handleToggleStandardEligible,
  handleUpdateAvailableSizes,
  handleUpdateStandardSizes,
  handleUpdateFulfilmentState,
  handleUpdateDepartment,
} from "./ProductTransitions";
import { StringListEditor } from "./StringListEditor";
import { ImagesEditor } from "./ImagesEditor";
import { MaterialTurnSetsEditor } from "./MaterialTurnSetsEditor";
import { ColourEditor } from "./ColourEditor";
import { canConfirmMapping, isConfirmedMappingCurrent } from "./mapping-staleness";

type MappingHistoryEntry = {
  id: string;
  confirmedAt: string;
  confirmedByClerkUserId: string;
  confirmedByEmail?: string;
  confidence: number;
  evidence: string[];
  source: "automatic" | "manual";
  sosoFingerprintChangedLater: boolean;
  justiceSureFingerprintChangedLater: boolean;
};

export function ProductEditor({
  product,
  allProducts,
  collections,
  isExpanded,
  onToggle,
  onChange,
  onUploadMedia,
  commerceProducts,
  commerceStatus,
  mappingSuggestion,
  mappingPreviewMeta,
  isWebhookStale = false,
}: {
  product: CatalogProduct;
  allProducts: CatalogProduct[];
  collections: Pick<PlatformCollection, "slug" | "label" | "category" | "department">[];
  isExpanded: boolean;
  onToggle: () => void;
  onChange: (product: CatalogProduct) => void;
  onUploadMedia: (file: File) => Promise<string>;
  commerceProducts: CommerceCatalogProduct[];
  commerceStatus: "loading" | "ready" | "unavailable";
  mappingSuggestion?: MappingSuggestion;
  mappingPreviewMeta?: Pick<MappingPreview, "snapshotHash" | "fetchedAt">;
  isWebhookStale?: boolean;
}) {
  const categoryOptions = useMemo(
    () => Array.from(new Set(collections
      .filter((collection) => collection.department === product.department)
      .map((collection) => collection.category))),
    [collections, product.department],
  );
  const validations = useMemo(
    () => validateProduct(product, allProducts, categoryOptions),
    [allProducts, categoryOptions, product],
  );
  const mappedCommerceProduct = useMemo(
    () => commerceProducts.find((remote) => remote.id === product.commerceProductId),
    [commerceProducts, product.commerceProductId],
  );
  const eligibleCommerceChoices = [
    ...(product.standardEligible ? product.standardSizes : []),
    ...(product.customEligible ? ["Custom"] : []),
  ];
  const mappedVariantCount = eligibleCommerceChoices.filter((choice) => product.commerceVariantIds?.[choice]).length;
  const confirmedCurrent = isConfirmedMappingCurrent(product, mappingSuggestion, isWebhookStale);
  const canConfirm = canConfirmMapping(product, mappingSuggestion, isWebhookStale);
  const [mappingHistoryOpen, setMappingHistoryOpen] = useState(false);
  const [mappingHistory, setMappingHistory] = useState<MappingHistoryEntry[] | null>(null);
  const [mappingHistoryLoading, setMappingHistoryLoading] = useState(false);
  const [mappingHistoryError, setMappingHistoryError] = useState("");

  const toggleMappingHistory = async () => {
    const nextOpen = !mappingHistoryOpen;
    setMappingHistoryOpen(nextOpen);
    if (!nextOpen || mappingHistory !== null || mappingHistoryLoading) return;
    setMappingHistoryLoading(true);
    setMappingHistoryError("");
    try {
      const response = await fetch(`/api/staff/commerce/catalogue-mapping/${encodeURIComponent(product.slug)}/history`, {
        credentials: "include",
      });
      const result = await response.json() as { history?: MappingHistoryEntry[]; error?: string };
      if (!response.ok || !Array.isArray(result.history)) {
        throw new Error(result.error || "Mapping history could not be loaded.");
      }
      setMappingHistory(result.history);
    } catch (error) {
      setMappingHistoryError(error instanceof Error ? error.message : "Mapping history could not be loaded.");
    } finally {
      setMappingHistoryLoading(false);
    }
  };

  const handleApplySuggestion = (suggestion: MappingSuggestion) => {
    if (!mappingPreviewMeta || suggestion.status !== "confident" || !suggestion.productId || !suggestion.productHash || !suggestion.localHash) return;
    const alreadySelected = product.commerceProductId === suggestion.productId
      && Object.entries(suggestion.variantIds).every(([choice, variantId]) => product.commerceVariantIds?.[choice] === variantId);
    onChange({
      ...product,
      commerceProductId: suggestion.productId,
      commerceVariantIds: suggestion.variantIds,
      commerceMappingConfirmation: {
        productHash: suggestion.productHash!,
        localHash: suggestion.localHash,
        snapshotHash: mappingPreviewMeta.snapshotHash,
        snapshotFetchedAt: mappingPreviewMeta.fetchedAt,
        confirmedAt: new Date().toISOString(),
        confidence: suggestion.confidence,
        source: alreadySelected ? "manual" : "automatic",
        evidence: suggestion.evidence,
        choiceLabels: suggestion.choiceLabels,
      }
    });
  };

  const suggestedCommerceProduct = useMemo(
    () => mappingSuggestion?.productId ? commerceProducts.find((remote) => remote.id === mappingSuggestion.productId) : null,
    [commerceProducts, mappingSuggestion?.productId]
  );

  return (
    <div id={`catalogue-product-${product.slug}`} className="scroll-mt-6 border border-border bg-background" data-testid={`catalogue-product-${product.slug}`}>
      <button
        type="button"
        className="flex w-full cursor-pointer items-center justify-between p-4 hover:bg-muted/30"
        onClick={onToggle}
        aria-expanded={isExpanded}
        data-testid={`catalogue-product-header-${product.slug}`}
      >
        <div className="flex items-center gap-4 text-left">
          <div className="flex h-6 w-6 items-center justify-center text-muted-foreground">
            {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </div>
          <div>
            <h4 className="text-sm font-bold text-primary">{product.name}</h4>
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{product.slug}</p>
            {isWebhookStale && (
              <span className="mt-1 inline-block border border-amber-300 bg-amber-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-800">
                JusticeSure change reported
              </span>
            )}
          </div>
        </div>
        {validations.length > 0 && (
          <div className="flex items-center gap-1 text-destructive">
            <AlertCircle size={14} />
            <span className="text-[10px] font-semibold uppercase tracking-wider">{validations.length} Issue{validations.length > 1 ? "s" : ""}</span>
          </div>
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-border p-5 space-y-8 bg-muted/10">

          <div className="space-y-4">
            <h5 className="text-[10px] font-semibold uppercase tracking-wider text-primary border-b border-border pb-2">Core Details & Merchandising</h5>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Slug</span>
                  <input
                    type="text"
                    value={product.slug || ""}
                    onChange={(e) => onChange({ ...product, slug: e.target.value })}
                    className="staff-input text-xs font-mono"
                    data-testid={`input-product-slug-${product.slug}`}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Name</span>
                  <input
                    type="text"
                    value={product.name || ""}
                    onChange={(e) => onChange({ ...product, name: e.target.value })}
                    className="staff-input text-xs"
                    data-testid={`input-product-name-${product.slug}`}
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="block flex-1">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Price</span>
                    <input
                      type="number"
                       min={1}
                       step={1}
                      value={product.price || 0}
                      onChange={(e) => onChange({ ...product, price: parseFloat(e.target.value) || 0 })}
                      className="staff-input text-xs"
                      data-testid={`input-product-price-${product.slug}`}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Department</span>
                    <select
                      value={product.department}
                      onChange={(event) => {
                        const nextDepartment = event.target.value as CatalogProduct["department"];
                        const nextCategories = Array.from(new Set(collections
                          .filter((collection) => collection.department === nextDepartment)
                          .map((collection) => collection.category)));
                        const updated = handleUpdateDepartment(product, nextDepartment, nextCategories, window.confirm);
                        if (updated) onChange(updated);
                      }}
                      className="staff-input text-xs"
                      data-testid={`select-product-department-${product.slug}`}
                    >
                      <option value="men">Men</option>
                      <option value="women">Women</option>
                      <option value="accessories">Accessories</option>
                    </select>
                  </label>
                  <label className="block flex-1">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Collection category</span>
                    <select
                      value={product.category || ""}
                      onChange={(e) => onChange({ ...product, category: e.target.value })}
                      className="staff-input text-xs"
                      data-testid={`select-product-category-${product.slug}`}
                    >
                      <option value="" disabled>Select category...</option>
                      {categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
                      {!categoryOptions.includes(product.category) && product.category && (
                        <option value={product.category}>{product.category} (Unknown)</option>
                      )}
                    </select>
                  </label>
                </div>
                {product.department === "accessories" && (
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Accessory release state</span>
                    <select
                      value={product.releaseState}
                      onChange={(event) => onChange({
                        ...product,
                        releaseState: event.target.value as CatalogProduct["releaseState"],
                      })}
                      className="staff-input text-xs"
                      data-testid={`select-product-release-state-${product.slug}`}
                    >
                      <option value="placeholder">Placeholder · browse only</option>
                      <option value="approved">Approved · validate for publication</option>
                    </select>
                    <p className="mt-2 text-[10px] text-muted-foreground">
                      Approved accessories publish only after real copy, governed photography, price, stock, fulfilment, and every eligible JusticeSure mapping pass validation.
                    </p>
                  </label>
                )}
                <div className="grid gap-4 md:grid-cols-3">
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Colour</span>
                    <input
                      type="text"
                      value={product.colour || ""}
                      onChange={(e) => onChange({ ...product, colour: e.target.value })}
                      className="staff-input text-xs"
                      data-testid={`input-product-colour-${product.slug}`}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Fabric</span>
                    <input
                      type="text"
                      value={product.fabric || ""}
                      onChange={(e) => onChange({ ...product, fabric: e.target.value })}
                      className="staff-input text-xs"
                      data-testid={`input-product-fabric-${product.slug}`}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Fit</span>
                    <input
                      type="text"
                      value={product.fit || ""}
                      onChange={(e) => onChange({ ...product, fit: e.target.value })}
                      className="staff-input text-xs"
                      data-testid={`input-product-fit-${product.slug}`}
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Description</span>
                  <textarea
                    value={product.description || ""}
                    onChange={(e) => onChange({ ...product, description: e.target.value })}
                    className="staff-input text-xs"
                    rows={4}
                    data-testid={`input-product-description-${product.slug}`}
                  />
                </label>
              </div>

              <div className="space-y-4">
                <div className="border border-border bg-background p-4 space-y-4">
                  <h6 className="text-[10px] font-semibold uppercase tracking-wider text-primary">Merchandising Overrides</h6>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={product.featured || false}
                      onChange={(e) => onChange({ ...product, featured: e.target.checked })}
                      className="h-4 w-4 rounded-sm border-border bg-background text-primary accent-primary"
                      data-testid={`input-product-featured-${product.slug}`}
                    />
                    <span className="text-[10px] font-semibold uppercase tracking-wider">Featured</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={product.merchandising?.isNew || false}
                      onChange={(e) => onChange({ ...product, merchandising: { ...product.merchandising, isNew: e.target.checked } })}
                      className="h-4 w-4 rounded-sm border-border bg-background text-primary accent-primary"
                      data-testid={`input-product-is-new-${product.slug}`}
                    />
                    <span className="text-[10px] font-semibold uppercase tracking-wider">Is New</span>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Badge Label (Optional)</span>
                    <input
                      type="text"
                      value={product.merchandising?.label || ""}
                      onChange={(e) => onChange({ ...product, merchandising: { ...product.merchandising, label: e.target.value || undefined } })}
                      className="staff-input text-xs"
                      data-testid={`input-product-merch-label-${product.slug}`}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sort Priority</span>
                    <input
                      type="number"
                      value={product.merchandising?.sortPriority ?? 0}
                      onChange={(e) => onChange({ ...product, merchandising: { ...product.merchandising, sortPriority: parseInt(e.target.value) || 0 } })}
                      className="staff-input text-xs"
                      data-testid={`input-product-merch-priority-${product.slug}`}
                    />
                  </label>
                  <div className="flex gap-4">
                    <label className="block flex-1">
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Legacy Tag</span>
                      <input
                        type="text"
                        value={product.tag || ""}
                        onChange={(e) => onChange({ ...product, tag: e.target.value })}
                        className="staff-input text-xs"
                        data-testid={`input-product-tag-${product.slug}`}
                      />
                    </label>
                    <label className="block flex-1">
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Legacy Note</span>
                      <input
                        type="text"
                        value={product.note || ""}
                        onChange={(e) => onChange({ ...product, note: e.target.value })}
                        className="staff-input text-xs"
                        data-testid={`input-product-note-${product.slug}`}
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <MaterialTurnSetsEditor product={product} onChange={onChange} onUploadMedia={onUploadMedia} />

          <ColourEditor product={product} onChange={onChange} onUploadMedia={onUploadMedia} />

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <h5 className="text-[10px] font-semibold uppercase tracking-wider text-primary border-b border-border pb-2">Information & Copy</h5>
              <label className="block">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Composition (Optional)</span>
                <textarea
                  value={product.composition || ""}
                  onChange={(e) => onChange({ ...product, composition: e.target.value || undefined })}
                  className="staff-input text-xs"
                  rows={2}
                  data-testid={`input-product-composition-${product.slug}`}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Care Instructions (Optional)</span>
                <textarea
                  value={product.care || ""}
                  onChange={(e) => onChange({ ...product, care: e.target.value || undefined })}
                  className="staff-input text-xs"
                  rows={2}
                  data-testid={`input-product-care-${product.slug}`}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Delivery (Optional)</span>
                <textarea
                  value={product.delivery || ""}
                  onChange={(e) => onChange({ ...product, delivery: e.target.value || undefined })}
                  className="staff-input text-xs"
                  rows={2}
                  data-testid={`input-product-delivery-${product.slug}`}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Returns (Optional)</span>
                <textarea
                  value={product.returns || ""}
                  onChange={(e) => onChange({ ...product, returns: e.target.value || undefined })}
                  className="staff-input text-xs"
                  rows={2}
                  data-testid={`input-product-returns-${product.slug}`}
                />
              </label>
            </div>

            <div className="space-y-4">
              <h5 className="text-[10px] font-semibold uppercase tracking-wider text-primary border-b border-border pb-2">Discovery</h5>

              <div>
                <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Searchable Terms</span>
                <StringListEditor
                  items={product.searchableTerms || []}
                  onChange={(terms) => onChange({ ...product, searchableTerms: terms })}
                  placeholder="e.g. wedding"
                  testIdPrefix={`search-term-${product.slug}`}
                  inputLabel={`Add a searchable term for ${product.name}`}
                />
              </div>

              <div className="pt-2">
                <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Related Product Slugs</span>
                <div className="space-y-2 border border-border bg-background p-3">
                  {allProducts.filter((candidate) => candidate.slug !== product.slug).map((candidate) => {
                    const checked = product.relatedProductSlugs?.includes(candidate.slug) || false;
                    return (
                      <label key={candidate.slug} className="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            const selected = new Set(product.relatedProductSlugs || []);
                            if (event.target.checked) selected.add(candidate.slug);
                            else selected.delete(candidate.slug);
                            onChange({ ...product, relatedProductSlugs: selected.size ? Array.from(selected) : undefined });
                          }}
                          className="h-4 w-4 accent-primary"
                          data-testid={`input-product-related-${product.slug}-${candidate.slug}`}
                        />
                        <span className="text-xs">{candidate.name} <span className="font-mono text-muted-foreground">({candidate.slug})</span></span>
                      </label>
                    );
                  })}
                  {allProducts.length <= 1 && <p className="text-xs text-muted-foreground">No other catalogue products are available.</p>}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h5 className="text-[10px] font-semibold uppercase tracking-wider text-primary border-b border-border pb-2">Commerce, Eligibility & Fulfilment</h5>

            {validations.length > 0 && (
              <div className="bg-destructive/10 border border-destructive/30 p-3 text-destructive text-xs space-y-1 mb-4" data-testid={`validation-errors-${product.slug}`}>
                {validations.map((val, i) => <div key={i}>{val}</div>)}
              </div>
            )}

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <div className="border border-border bg-background p-4 mb-4">
                  <h6 className="text-[10px] font-semibold uppercase tracking-wider text-primary mb-3">All Available Sizes</h6>
                  <StringListEditor
                    items={(product.sizes || []).filter(s => s !== "Custom")}
                    onChange={(sizes) => {
                      const next = handleUpdateAvailableSizes(product, sizes, window.confirm);
                      if (next) onChange(next);
                    }}
                    placeholder="e.g. S, M, L"
                    testIdPrefix={`available-size-${product.slug}`}
                    inputLabel={`Add an available size for ${product.name}`}
                  />
                  <p className="text-[10px] text-muted-foreground mt-2 italic">Custom size is managed automatically via the eligibility toggle.</p>
                </div>

                <div className="flex flex-col gap-3 border border-border bg-background p-4">
                  <h6 className="text-[10px] font-semibold uppercase tracking-wider text-primary">Eligibility & Sizes</h6>

                  <label className="flex items-center gap-2 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={product.customEligible || false}
                      onChange={(e) => {
                        const next = handleToggleCustomEligible(product, e.target.checked, window.confirm);
                        if (next) onChange(next);
                      }}
                      className="h-4 w-4 rounded-sm border-border bg-background text-primary accent-primary"
                      data-testid={`input-product-custom-eligible-${product.slug}`}
                    />
                    <span className="text-[10px] font-semibold uppercase tracking-wider">Custom Eligible</span>
                  </label>

                  <div className="border-t border-border mt-1 pt-3">
                    <label className="flex items-center gap-2 cursor-pointer pb-2">
                      <input
                        type="checkbox"
                        checked={product.standardEligible || false}
                        onChange={(e) => {
                          const next = handleToggleStandardEligible(product, e.target.checked, window.confirm);
                          if (next) onChange(next);
                        }}
                        className="h-4 w-4 rounded-sm border-border bg-background text-primary accent-primary"
                        data-testid={`input-product-standard-eligible-${product.slug}`}
                      />
                      <span className="text-[10px] font-semibold uppercase tracking-wider">Standard Eligible</span>
                    </label>

                    {product.standardEligible && (
                      <div className="pl-6 space-y-2 mt-2">
                        <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Select Standard Sizes</span>
                        {(product.sizes || []).filter(s => s !== "Custom").map(size => (
                          <label key={size} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={product.standardSizes?.includes(size) || false}
                              onChange={(e) => {
                                const next = handleUpdateStandardSizes(product, size, e.target.checked, window.confirm);
                                if (next) onChange(next);
                              }}
                              className="h-3 w-3 rounded-sm border-border bg-background text-primary accent-primary"
                              data-testid={`input-product-standard-size-${product.slug}-${size}`}
                            />
                            <span className="text-[10px] font-medium uppercase tracking-wider text-foreground">{size}</span>
                          </label>
                        ))}
                        {(product.sizes || []).filter(s => s !== "Custom").length === 0 && (
                          <p className="text-[10px] italic text-muted-foreground">Add available sizes above to configure Standard eligibility.</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-4">

                <div className="border border-border bg-background p-4 space-y-4">
                  <h6 className="text-[10px] font-semibold uppercase tracking-wider text-primary">Fulfilment</h6>

                  <label className="block">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">State</span>
                    <select
                      value={product.fulfilmentState || "made_immediately"}
                      onChange={(e) => {
                        const state = e.target.value as "ready_now" | "made_immediately" | "unavailable";
                        const next = handleUpdateFulfilmentState(product, state, window.confirm);
                        if (next) onChange(next);
                      }}
                      className="staff-input text-xs"
                      data-testid={`select-product-fulfilment-${product.slug}`}
                    >
                      <option value="made_immediately">Made Immediately</option>
                      <option value="ready_now">Ready Now</option>
                      <option value="unavailable">Unavailable</option>
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Dispatch Message</span>
                    <textarea
                      value={product.dispatchMessage || ""}
                      onChange={(e) => onChange({ ...product, dispatchMessage: e.target.value })}
                      className="staff-input text-xs"
                      rows={2}
                      data-testid={`input-product-dispatch-${product.slug}`}
                    />
                  </label>

                  {product.fulfilmentState === "unavailable" && (
                    <label className="block">
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-destructive">Unavailable Message</span>
                      <textarea
                        value={product.unavailableMessage || ""}
                        onChange={(e) => onChange({ ...product, unavailableMessage: e.target.value || undefined })}
                        className="staff-input text-xs border-destructive/50 focus:border-destructive"
                        rows={2}
                        data-testid={`input-product-unavailable-${product.slug}`}
                      />
                    </label>
                  )}

                  {product.fulfilmentState !== "unavailable" && (
                    <div className="pt-2">
                      <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Ready Now Sizes</span>
                      {(!product.standardSizes || product.standardSizes.length === 0) ? (
                        <p className="text-[10px] italic text-muted-foreground">Select Standard Sizes first to mark them ready now.</p>
                      ) : (
                        <div className="space-y-2 pl-2">
                          {product.standardSizes.map(size => (
                            <label key={size} className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={product.readyNowSizes?.includes(size) || false}
                                onChange={(e) => {
                                  const set = new Set(product.readyNowSizes || []);
                                  if (e.target.checked) set.add(size);
                                  else set.delete(size);
                                  onChange({ ...product, readyNowSizes: Array.from(set) });
                                }}
                                className="h-3 w-3 rounded-sm border-border bg-background text-primary accent-primary"
                                data-testid={`input-product-readynow-${product.slug}-${size}`}
                              />
                              <span className="text-[10px] font-medium uppercase tracking-wider text-foreground">{size}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="border border-border bg-background p-4 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h6 className="text-[10px] font-semibold uppercase tracking-wider text-primary">JusticeSure Inventory Mapping</h6>
                      <p className="mt-1 text-[10px] text-muted-foreground">Mappings change SOSO references only; JusticeSure inventory is never edited here.</p>
                    </div>
                    <span data-testid={`mapping-status-${product.slug}`} className={`border px-2 py-1 text-[9px] font-semibold uppercase tracking-wider ${
                      !product.commerceProductId
                        ? "border-amber-300 text-amber-700"
                        : isWebhookStale
                          ? "border-amber-300 bg-amber-50 text-amber-800"
                        : mappedCommerceProduct
                          ? "border-emerald-300 text-emerald-700"
                          : "border-destructive/40 text-destructive"
                    }`}>
                      {!product.commerceProductId
                        ? "Unmapped"
                        : isWebhookStale
                          ? "JusticeSure change reported"
                        : confirmedCurrent
                          ? "Confirmed current"
                          : product.commerceMappingConfirmation && mappingSuggestion
                            ? "Confirmation stale"
                            : mappedCommerceProduct
                              ? "ID found · confirmation required"
                              : "Mapping not found"}
                    </span>
                  </div>

                  <div className="border border-border bg-muted/10">
                    <button
                      type="button"
                      onClick={() => { void toggleMappingHistory(); }}
                      aria-expanded={mappingHistoryOpen}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-primary hover:bg-muted/30"
                      data-testid={`button-mapping-history-${product.slug}`}
                    >
                      <span>Mapping confirmation history</span>
                      {mappingHistoryOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    {mappingHistoryOpen && (
                      <div className="border-t border-border p-3" data-testid={`mapping-history-${product.slug}`}>
                        {mappingHistoryLoading && (
                          <p className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" /> Loading confirmation history…
                          </p>
                        )}
                        {mappingHistoryError && <p role="alert" className="text-[10px] text-destructive">{mappingHistoryError}</p>}
                        {!mappingHistoryLoading && !mappingHistoryError && mappingHistory?.length === 0 && (
                          <p className="text-[10px] text-muted-foreground">No saved mapping confirmations were found.</p>
                        )}
                        {mappingHistory && mappingHistory.length > 0 && (
                          <ol className="space-y-3">
                            {mappingHistory.map((entry) => (
                              <li key={entry.id} className="border border-border bg-background p-3 text-[10px]">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div>
                                    <p className="font-semibold text-primary">
                                      {new Date(entry.confirmedAt).toLocaleString()}
                                    </p>
                                    <p className="mt-1 text-muted-foreground">
                                      Confirmed by {entry.confirmedByEmail || entry.confirmedByClerkUserId} · {entry.source}
                                    </p>
                                  </div>
                                  <span className="border border-border px-2 py-1 font-semibold uppercase tracking-wider">
                                    {entry.confidence}% confidence
                                  </span>
                                </div>
                                <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
                                  {entry.evidence.map((evidence, index) => <li key={index}>{evidence}</li>)}
                                </ul>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <span className={`border px-2 py-1 font-semibold ${
                                    entry.sosoFingerprintChangedLater
                                      ? "border-amber-300 bg-amber-50 text-amber-800"
                                      : "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  }`}>
                                    SOSO fingerprint {entry.sosoFingerprintChangedLater ? "changed later" : "unchanged in later confirmations"}
                                  </span>
                                  <span className={`border px-2 py-1 font-semibold ${
                                    entry.justiceSureFingerprintChangedLater
                                      ? "border-amber-300 bg-amber-50 text-amber-800"
                                      : "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  }`}>
                                    JusticeSure fingerprint {entry.justiceSureFingerprintChangedLater ? "changed later" : "unchanged in later confirmations"}
                                  </span>
                                </div>
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    )}
                  </div>

                  {mappingSuggestion && (
                    <div className="border border-border bg-muted/10 p-3 mb-4 space-y-3" data-testid={`mapping-suggestion-${product.slug}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                          Analysis Suggestion
                        </span>
                        <span data-testid={`mapping-confidence-${product.slug}`} className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 border ${
                          mappingSuggestion.status === 'confident' ? 'border-emerald-300 text-emerald-700 bg-emerald-50' :
                          mappingSuggestion.status === 'needs_review' ? 'border-amber-300 text-amber-700 bg-amber-50' :
                          'border-destructive/40 text-destructive bg-destructive/10'
                        }`}>
                           {mappingSuggestion.status.replace('_', ' ')} ({mappingSuggestion.confidence.toFixed(0)}%)
                        </span>
                      </div>
                      
                      {mappingSuggestion.evidence.length > 0 && (
                        <ul className="text-[10px] text-muted-foreground list-disc pl-4 space-y-1" data-testid={`mapping-evidence-${product.slug}`}>
                          {mappingSuggestion.evidence.map((ev, i) => <li key={i}>{ev}</li>)}
                        </ul>
                      )}
                      
                      {mappingSuggestion.issues.length > 0 && (
                        <div className="text-[10px] text-destructive space-y-1 mt-2">
                          <strong className="font-semibold uppercase tracking-wider">Issues:</strong>
                          <ul className="list-disc pl-4">
                            {mappingSuggestion.issues.map((issue, i) => <li key={i}>{issue}</li>)}
                          </ul>
                        </div>
                      )}

                      {suggestedCommerceProduct && (
                        <div className="grid gap-2 border border-border bg-background p-2 mt-2 text-[10px] sm:grid-cols-3">
                          <span><strong>Price:</strong> NGN {(suggestedCommerceProduct.amountKobo / 100).toLocaleString()}</span>
                          <span><strong>Stock:</strong> {suggestedCommerceProduct.inStock ? "In stock" : "Out of stock"}</span>
                          <span><strong>Variants:</strong> {suggestedCommerceProduct.variants.length}</span>
                        </div>
                      )}
                      
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {canConfirm && (
                          <button
                            type="button"
                            onClick={() => handleApplySuggestion(mappingSuggestion)}
                            className="bg-primary text-primary-foreground px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider hover:bg-primary/90 transition-colors cursor-pointer"
                          >
                            {isWebhookStale ? "Review and Reconfirm" : "Apply Safe Match"}
                          </button>
                        )}
                        {confirmedCurrent && (
                          <span className="text-[10px] font-semibold text-emerald-700">Applied and confirmed</span>
                        )}
                        {isWebhookStale && (
                          <span className="text-[10px] font-semibold text-amber-800">
                            JusticeSure reported this mapping changed. Review the current analysis, then reconfirm it.
                          </span>
                        )}
                        {!isWebhookStale && product.commerceMappingConfirmation && (
                          product.commerceMappingConfirmation.productHash !== mappingSuggestion.productHash
                          || product.commerceMappingConfirmation.localHash !== mappingSuggestion.localHash
                        ) && (
                          <span className="text-[10px] font-semibold text-amber-700">Stale confirmation</span>
                        )}
                      </div>
                    </div>
                  )}

                  <label className="block">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">JusticeSure Product</span>
                    <select
                      value={product.commerceProductId || ""}
                      disabled={commerceStatus !== "ready"}
                      onChange={(e) => onChange({
                        ...product,
                        commerceProductId: e.target.value || undefined,
                        commerceVariantIds: undefined,
                        commerceMappingConfirmation: undefined,
                      })}
                      className="staff-input text-xs"
                      data-testid={`input-product-commerce-id-${product.slug}`}
                    >
                      <option value="">{commerceStatus === "loading" ? "Loading JusticeSure products…" : commerceStatus === "unavailable" ? "JusticeSure catalogue unavailable" : "Select an exact JusticeSure product"}</option>
                      {commerceProducts.map((remote) => (
                        <option key={remote.id} value={remote.id}>
                          {remote.name} · NGN {(remote.amountKobo / 100).toLocaleString()} · {remote.inStock ? "In stock" : "Out of stock"}
                        </option>
                      ))}
                    </select>
                  </label>

                  {mappedCommerceProduct && (
                    <div className="grid gap-2 border border-border bg-muted/20 p-3 text-[10px] sm:grid-cols-3">
                      <span><strong>Remote stock:</strong> {mappedCommerceProduct.inStock ? "In stock" : "Out of stock"}</span>
                      <span><strong>Remote price:</strong> NGN {(mappedCommerceProduct.amountKobo / 100).toLocaleString()}</span>
                      <span><strong>Remote variants:</strong> {mappedCommerceProduct.variants.length}</span>
                    </div>
                  )}

                  {mappedCommerceProduct?.variants.length === 0 && eligibleCommerceChoices.length > 0 && (
                    <div className="border border-amber-300 bg-amber-50 p-3 text-[10px] text-amber-900">
                      This JusticeSure product has no variants, while SOSO offers {eligibleCommerceChoices.length} size or custom choice{eligibleCommerceChoices.length === 1 ? "" : "s"}.
                      Exact option mapping is not possible until JusticeSure publishes matching variants. Publication remains blocked rather than guessing.
                    </div>
                  )}

                  <div className="space-y-2 mt-4">
                    {product.standardEligible && product.standardSizes?.map((size) => (
                      <label key={size} className="flex flex-col gap-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">Standard: {size}</span>
                        <select
                          value={product.commerceVariantIds?.[size] || ""}
                          disabled={!mappedCommerceProduct || mappedCommerceProduct.variants.length === 0}
                          onChange={(e) => {
                            const val = e.target.value;
                            const updatedVariants = { ...(product.commerceVariantIds || {}) };
                            if (val) updatedVariants[size] = val;
                            else delete updatedVariants[size];
                            onChange({ ...product, commerceVariantIds: Object.keys(updatedVariants).length > 0 ? updatedVariants : undefined, commerceMappingConfirmation: undefined });
                          }}
                          className="staff-input text-xs"
                          data-testid={`input-product-variant-${product.slug}-${size}`}
                        >
                          <option value="">Select exact remote variant</option>
                          {mappedCommerceProduct?.variants.map((variant) => (
                            <option key={variant.id} value={variant.id}>
                              {variant.name} · {Object.entries(variant.attributes).map(([name, value]) => `${name}: ${String(value)}`).join(", ") || variant.label} · NGN {(variant.amountKobo / 100).toLocaleString()} · {variant.inStock ? "In stock" : "Out of stock"}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}

                    {product.customEligible && (
                      <label className="flex flex-col gap-1 mt-3">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">Custom Option</span>
                        <select
                          value={product.commerceVariantIds?.["Custom"] || ""}
                          disabled={!mappedCommerceProduct || mappedCommerceProduct.variants.length === 0}
                          onChange={(e) => {
                            const val = e.target.value;
                            const updatedVariants = { ...(product.commerceVariantIds || {}) };
                            if (val) updatedVariants["Custom"] = val;
                            else delete updatedVariants["Custom"];
                            onChange({ ...product, commerceVariantIds: Object.keys(updatedVariants).length > 0 ? updatedVariants : undefined, commerceMappingConfirmation: undefined });
                          }}
                          className="staff-input text-xs"
                          data-testid={`input-product-variant-${product.slug}-custom`}
                        >
                          <option value="">Select exact remote Custom variant</option>
                          {mappedCommerceProduct?.variants.map((variant) => (
                            <option key={variant.id} value={variant.id}>
                              {variant.name} · {Object.entries(variant.attributes).map(([name, value]) => `${name}: ${String(value)}`).join(", ") || variant.label} · NGN {(variant.amountKobo / 100).toLocaleString()} · {variant.inStock ? "In stock" : "Out of stock"}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    {!product.standardEligible && !product.customEligible && (
                      <p className="text-[10px] text-muted-foreground italic">Enable standard or custom eligibility to map variants.</p>
                    )}
                  </div>

                  {mappedCommerceProduct && eligibleCommerceChoices.length > 0 && mappedCommerceProduct.variants.length > 0 && (
                    <p className={`text-[10px] ${mappedVariantCount === eligibleCommerceChoices.length ? "text-emerald-700" : "text-amber-700"}`}>
                      {mappedVariantCount} of {eligibleCommerceChoices.length} eligible choices mapped.
                    </p>
                  )}

                  <details className="border-t border-border pt-3">
                    <summary className="cursor-pointer text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Advanced mapping identifiers</summary>
                    <p className="mt-2 break-all font-mono text-[10px] text-muted-foreground">Product: {product.commerceProductId || "Not mapped"}</p>
                    {Object.entries(product.commerceVariantIds ?? {}).map(([choice, id]) => (
                      <p key={choice} className="mt-1 break-all font-mono text-[10px] text-muted-foreground">{choice}: {id}</p>
                    ))}
                  </details>
                </div>
              </div>
            </div>
          </div>
          <ImagesEditor product={product} onChange={onChange} onUploadMedia={onUploadMedia} />
        </div>
      )}
    </div>
  );
}
