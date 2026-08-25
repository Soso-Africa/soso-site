import { useMemo } from "react";
import { ChevronDown, ChevronRight, AlertCircle } from "lucide-react";
import type { CatalogProduct, PlatformCollection } from "../../../data/platformContent";
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

export function ProductEditor({
  product,
  allProducts,
  collections,
  isExpanded,
  onToggle,
  onChange
}: {
  product: CatalogProduct;
  allProducts: CatalogProduct[];
  collections: Pick<PlatformCollection, "slug" | "label" | "category" | "department">[];
  isExpanded: boolean;
  onToggle: () => void;
  onChange: (product: CatalogProduct) => void;
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

  return (
    <div className="border border-border bg-background" data-testid={`catalogue-product-${product.slug}`}>
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

          <ImagesEditor product={product} onChange={onChange} />
          
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
                  <h6 className="text-[10px] font-semibold uppercase tracking-wider text-primary">Commerce Variant IDs Mapping</h6>
                  
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Commerce Product ID (UUID)</span>
                    <input
                      type="text"
                      value={product.commerceProductId || ""}
                      onChange={(e) => onChange({ ...product, commerceProductId: e.target.value || undefined })}
                      className="staff-input text-xs font-mono"
                      placeholder="e.g. 123e4567-e89b-12d3-a456-426614174000"
                      data-testid={`input-product-commerce-id-${product.slug}`}
                    />
                  </label>

                  <div className="space-y-2 mt-4">
                    {product.standardEligible && product.standardSizes?.map((size) => (
                      <label key={size} className="flex flex-col gap-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">Standard: {size}</span>
                        <input
                          type="text"
                          value={product.commerceVariantIds?.[size] || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            const updatedVariants = { ...(product.commerceVariantIds || {}) };
                            if (val) updatedVariants[size] = val;
                            else delete updatedVariants[size];
                            onChange({ ...product, commerceVariantIds: Object.keys(updatedVariants).length > 0 ? updatedVariants : undefined });
                          }}
                          className="staff-input text-xs font-mono"
                          placeholder="Variant UUID"
                          data-testid={`input-product-variant-${product.slug}-${size}`}
                        />
                      </label>
                    ))}
                    
                    {product.customEligible && (
                      <label className="flex flex-col gap-1 mt-3">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">Custom Option</span>
                        <input
                          type="text"
                          value={product.commerceVariantIds?.["Custom"] || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            const updatedVariants = { ...(product.commerceVariantIds || {}) };
                            if (val) updatedVariants["Custom"] = val;
                            else delete updatedVariants["Custom"];
                            onChange({ ...product, commerceVariantIds: Object.keys(updatedVariants).length > 0 ? updatedVariants : undefined });
                          }}
                          className="staff-input text-xs font-mono"
                          placeholder="Variant UUID"
                          data-testid={`input-product-variant-${product.slug}-custom`}
                        />
                      </label>
                    )}
                    
                    {!product.standardEligible && !product.customEligible && (
                      <p className="text-[10px] text-muted-foreground italic">Enable standard or custom eligibility to map variants.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
