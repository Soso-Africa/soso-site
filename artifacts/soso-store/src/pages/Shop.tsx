import { useMemo, useState } from "react";
import { useSearchParams } from "wouter";
import { Filter, Search, X } from "lucide-react";
import { Drawer } from "vaul";
import { Reveal } from "@/components/Reveal";
import { Seo } from "@/components/Seo";
import { ProductCard } from "@/components/ProductCard";
import { trackStorefrontEvent } from "@/components/ConsentManager";
import { catalogApproved } from "@/lib/seo";
import { filterAndSortProducts } from "@/lib/catalog";
import { PlatformContentState, usePlatformContent, type ProductDepartment } from "@/data/platformContent";

const all = "__all";

function numberParam(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export default function Shop() {
  const platform = usePlatformContent();
  const platformStateCopy = platform.data?.content.site.platformState;
  const [searchParams, setSearchParams] = useSearchParams();
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const sourceProducts = platform.data?.content.products ?? [];
  const searchQuery = searchParams.get("q") || "";
  const departmentParam = searchParams.get("department");
  const activeDepartment: ProductDepartment | typeof all = (
    departmentParam === "men" || departmentParam === "women" || departmentParam === "accessories"
  ) ? departmentParam : (searchQuery ? all : "men");
  const activeCategory = searchParams.get("category") || all;
  const activeSort = searchParams.get("sort") || "featured";
  const activeFulfilment = searchParams.get("fulfilment") || all;
  const activeSize = searchParams.get("size") || all;
  const activeColour = searchParams.get("colour") || all;
  const minPrice = numberParam(searchParams.get("minPrice"));
  const maxPrice = numberParam(searchParams.get("maxPrice"));

  const scopedProducts = useMemo(
    () => activeDepartment === all
      ? sourceProducts
      : sourceProducts.filter((product) => product.department === activeDepartment),
    [activeDepartment, sourceProducts],
  );
  const categories = useMemo(
    () => [all, ...Array.from(new Set(scopedProducts.map((product) => product.category)))],
    [scopedProducts],
  );
  const colours = useMemo(
    () => [all, ...Array.from(new Set(scopedProducts.map((product) => product.colour)))],
    [scopedProducts],
  );
  const sizes = useMemo(() => {
    const standardSizes = scopedProducts.flatMap((product) => product.standardSizes);
    return [all, ...Array.from(new Set(standardSizes)), ...(scopedProducts.some((product) => product.customEligible) ? ["Custom"] : [])];
  }, [scopedProducts]);
  const filteredProducts = useMemo(() => filterAndSortProducts(sourceProducts, {
    department: activeDepartment,
    category: activeCategory,
    fulfillment: activeFulfilment,
    size: activeSize,
    colour: activeColour,
    minPrice,
    maxPrice,
    searchQuery,
    sort: activeSort,
  }), [
    sourceProducts,
    activeDepartment,
    activeCategory,
    activeFulfilment,
    activeSize,
    activeColour,
    minPrice,
    maxPrice,
    searchQuery,
    activeSort,
  ]);

  const updateParams = (updates: Record<string, string | null>, analyticsLabel?: string) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === all || value === "") next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next, { replace: true });
    if (analyticsLabel) {
      trackStorefrontEvent("cta_clicked", { ctaLabel: analyticsLabel });
    }
  };

  const resetFilters = () => updateParams({
    q: null,
    category: null,
    fulfilment: null,
    size: null,
    colour: null,
    minPrice: null,
    maxPrice: null,
    sort: null,
  }, "catalogue_filters_reset");
  const hasRefinements = Boolean(
    searchQuery
    || activeCategory !== all
    || activeFulfilment !== all
    || activeSize !== all
    || activeColour !== all
    || minPrice != null
    || maxPrice != null
  );

  let activeFiltersCount = 0;
  if (searchQuery) activeFiltersCount++;
  if (activeCategory !== all) activeFiltersCount++;
  if (activeFulfilment !== all) activeFiltersCount++;
  if (activeSize !== all) activeFiltersCount++;
  if (activeColour !== all) activeFiltersCount++;
  if (minPrice != null) activeFiltersCount++;
  if (maxPrice != null) activeFiltersCount++;

  if (!platform.data) {
    return <PlatformContentState
      loading={platform.isLoading}
      error={platform.isError}
      copy={platformStateCopy}
    />;
  }
  const copy = platform.data.content.pages.shop;
  const departmentCopy = activeDepartment === all ? copy : copy.departments[activeDepartment];
  const visibleDepartments = platform.data.content.site.megaMenu
    .filter((group) => group.visible && group.department)
    .map((group) => group.department!)
    .filter((department, index, values) => values.indexOf(department) === index);
  const fulfilmentOptions = [
    { value: all, label: copy.allFilterLabel },
    { value: "ready_now", label: copy.readyNowLabel },
    { value: "made_immediately", label: copy.madeImmediatelyLabel },
    { value: "unavailable", label: copy.unavailableLabel },
  ];
  const sortOptions = [
    { value: "featured", label: copy.sortOptions.featured },
    { value: "newest", label: copy.sortOptions.newest },
    { value: "price_asc", label: copy.sortOptions.priceAscending },
    { value: "price_desc", label: copy.sortOptions.priceDescending },
  ];

  const RefinementFields = ({ mobile = false }: { mobile?: boolean }) => (
    <div className={mobile ? "space-y-7" : "grid grid-cols-2 gap-4 xl:grid-cols-4"}>
      <label className="text-[10px] uppercase tracking-[0.2em] text-secondary/70">
        {copy.sizeFilterLabel}
        <select
          value={activeSize}
          onChange={(event) => updateParams({ size: event.target.value }, "catalogue_size_filter")}
          className="mt-2 w-full border border-border bg-background px-3 py-3 text-xs normal-case tracking-normal text-foreground outline-none focus:border-foreground"
          data-testid={mobile ? "select-size-mobile" : "select-size"}
        >
          {sizes.map((size) => <option key={size} value={size}>{size === all ? copy.allFilterLabel : size}</option>)}
        </select>
      </label>
      <label className="text-[10px] uppercase tracking-[0.2em] text-secondary/70">
        {copy.colourFilterLabel}
        <select
          value={activeColour}
          onChange={(event) => updateParams({ colour: event.target.value }, "catalogue_colour_filter")}
          className="mt-2 w-full border border-border bg-background px-3 py-3 text-xs normal-case tracking-normal text-foreground outline-none focus:border-foreground"
          data-testid={mobile ? "select-colour-mobile" : "select-colour"}
        >
          {colours.map((colour) => <option key={colour} value={colour}>{colour === all ? copy.allFilterLabel : colour}</option>)}
        </select>
      </label>
      <label className="text-[10px] uppercase tracking-[0.2em] text-secondary/70">
        {copy.minimumPriceLabel}
        <input
          type="number"
          min="0"
          step="1000"
          value={minPrice ?? ""}
          onChange={(event) => updateParams({ minPrice: event.target.value })}
          onBlur={() => minPrice != null && trackStorefrontEvent("cta_clicked", { ctaLabel: "catalogue_min_price_filter" })}
          className="mt-2 w-full border border-border bg-background px-3 py-3 text-xs normal-case tracking-normal text-foreground outline-none focus:border-foreground"
          data-testid={mobile ? "input-min-price-mobile" : "input-min-price"}
        />
      </label>
      <label className="text-[10px] uppercase tracking-[0.2em] text-secondary/70">
        {copy.maximumPriceLabel}
        <input
          type="number"
          min="0"
          step="1000"
          value={maxPrice ?? ""}
          onChange={(event) => updateParams({ maxPrice: event.target.value })}
          onBlur={() => maxPrice != null && trackStorefrontEvent("cta_clicked", { ctaLabel: "catalogue_max_price_filter" })}
          className="mt-2 w-full border border-border bg-background px-3 py-3 text-xs normal-case tracking-normal text-foreground outline-none focus:border-foreground"
          data-testid={mobile ? "input-max-price-mobile" : "input-max-price"}
        />
      </label>
    </div>
  );

  return <div className="flex flex-col pt-10">
    <Seo
      title={departmentCopy.seo.title}
      description={departmentCopy.seo.description}
      path={activeDepartment === all ? "/shop" : `/shop?department=${activeDepartment}`}
      noIndex={!catalogApproved}
    />
    <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 sm:px-6 lg:px-12">
      <Reveal>
        <header className="mb-10 text-center md:mb-14">
            <nav aria-label={copy.departmentsAriaLabel} className="mb-8 flex flex-wrap justify-center gap-2">
            {visibleDepartments.map((department) => (
              <button
                key={department}
                type="button"
                onClick={() => updateParams({ department, category: null, size: null }, `catalogue_department_${department}`)}
                aria-pressed={activeDepartment === department}
                className={`border px-5 py-2 text-[10px] uppercase tracking-[0.22em] transition-colors ${activeDepartment === department ? "border-foreground bg-foreground text-background" : "border-border text-secondary hover:border-foreground hover:text-foreground"}`}
                data-testid={`button-department-${department}`}
              >
                {copy.departmentLabels[department]}
              </button>
            ))}
          </nav>
          <p className="text-[11px] uppercase tracking-[0.3em] text-secondary">{departmentCopy.eyebrow}</p>
          <h1 className="mt-3 text-4xl font-normal text-foreground soso-display md:text-5xl">{departmentCopy.title}</h1>
          <p className="mx-auto mt-4 max-w-xl text-sm text-secondary">{departmentCopy.intro}</p>
        </header>
      </Reveal>

      <section aria-label={copy.controlsAriaLabel} className="mb-10 border-y border-border py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative min-w-0 flex-1 lg:max-w-md">
            <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary/70" />
            <label className="sr-only" htmlFor="catalogue-search">{copy.searchLabel}</label>
            <input
              id="catalogue-search"
              type="search"
              placeholder={copy.searchPlaceholder}
              value={searchQuery}
              onChange={(event) => updateParams({ q: event.target.value })}
              onBlur={() => searchQuery && trackStorefrontEvent("cta_clicked", { ctaLabel: "catalogue_search" })}
              className="w-full border border-border bg-background py-3 pl-10 pr-10 text-sm text-foreground outline-none transition-colors focus:border-foreground"
              data-testid="input-search"
            />
            {searchQuery && <button
              type="button"
              onClick={() => updateParams({ q: null }, "catalogue_search_cleared")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary hover:text-foreground"
              aria-label={copy.clearSearchLabel}
              data-testid="button-clear-search"
            ><X className="h-4 w-4" /></button>}
          </div>
          <div className="flex gap-3">
            <label className="sr-only" htmlFor="catalogue-sort">{copy.sortLabel}</label>
            <select
              id="catalogue-sort"
              value={activeSort}
              onChange={(event) => updateParams({ sort: event.target.value }, "catalogue_sort")}
              className="min-w-48 border border-border bg-background px-4 py-3 text-[11px] uppercase tracking-[0.15em] text-foreground outline-none focus:border-foreground"
              data-testid="select-sort"
            >
              {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <button
              type="button"
              onClick={() => setMobileFiltersOpen(true)}
              className="inline-flex items-center gap-2 border border-border bg-background px-4 py-3 text-[11px] uppercase tracking-wider lg:hidden text-foreground"
              data-testid="button-open-filters"
            >
              <Filter className="h-4 w-4 text-foreground" /> {copy.refineLabel} {activeFiltersCount > 0 && <span className="flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-[9px] font-bold text-background">{activeFiltersCount}</span>}
            </button>
          </div>
        </div>

        <div className="mt-5 hidden space-y-5 lg:block">
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => <button
              key={category}
              type="button"
              onClick={() => updateParams({ category }, "catalogue_category_filter")}
              aria-pressed={activeCategory === category}
              className={`border px-4 py-2 text-[11px] uppercase tracking-[0.16em] ${activeCategory === category ? "border-foreground bg-foreground text-background" : "border-border text-secondary hover:border-foreground hover:text-foreground"}`}
              data-testid={`button-category-${category}`}
            >{category === all ? copy.allFilterLabel : category}</button>)}
          </div>
          <div className="flex flex-wrap gap-2">
            {fulfilmentOptions.map((option) => <button
              key={option.value}
              type="button"
              onClick={() => updateParams({ fulfilment: option.value }, "catalogue_fulfilment_filter")}
              aria-pressed={activeFulfilment === option.value}
              className={`border px-4 py-2 text-[11px] uppercase tracking-[0.16em] ${activeFulfilment === option.value ? "border-foreground bg-foreground text-background" : "border-border text-secondary hover:border-foreground hover:text-foreground"}`}
              data-testid={`button-fulfilment-${option.value}`}
            >{option.label}</button>)}
          </div>
          <RefinementFields />
        </div>
      </section>

      <div className="mb-6 flex flex-col gap-4">
        {hasRefinements && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-secondary/70 mr-2">{copy.activeFiltersLabel}</span>
            {searchQuery && (
              <span className="inline-flex items-center gap-1.5 border border-foreground/20 bg-muted px-3 py-1.5 text-[11px] text-foreground">
                {copy.searchFilterLabel}: {searchQuery}
                <button type="button" onClick={() => updateParams({ q: null })} aria-label={copy.removeSearchFilterLabel} className="hover:text-primary"><X size={12} /></button>
              </span>
            )}
            {activeCategory !== all && (
              <span className="inline-flex items-center gap-1.5 border border-foreground/20 bg-muted px-3 py-1.5 text-[11px] text-foreground">
                {copy.categoryLabel}: {activeCategory}
                <button type="button" onClick={() => updateParams({ category: null })} aria-label={copy.removeCategoryFilterLabel} className="hover:text-primary"><X size={12} /></button>
              </span>
            )}
            {activeFulfilment !== all && (
              <span className="inline-flex items-center gap-1.5 border border-foreground/20 bg-muted px-3 py-1.5 text-[11px] text-foreground">
                {copy.fulfilmentLabel}: {fulfilmentOptions.find(o => o.value === activeFulfilment)?.label}
                <button type="button" onClick={() => updateParams({ fulfilment: null })} aria-label={copy.removeFulfilmentFilterLabel} className="hover:text-primary"><X size={12} /></button>
              </span>
            )}
            {activeSize !== all && (
              <span className="inline-flex items-center gap-1.5 border border-foreground/20 bg-muted px-3 py-1.5 text-[11px] text-foreground">
                {copy.sizeFilterLabel}: {activeSize}
                <button type="button" onClick={() => updateParams({ size: null })} aria-label={copy.removeSizeFilterLabel} className="hover:text-primary"><X size={12} /></button>
              </span>
            )}
            {activeColour !== all && (
              <span className="inline-flex items-center gap-1.5 border border-foreground/20 bg-muted px-3 py-1.5 text-[11px] text-foreground">
                {copy.colourFilterLabel}: {activeColour}
                <button type="button" onClick={() => updateParams({ colour: null })} aria-label={copy.removeColourFilterLabel} className="hover:text-primary"><X size={12} /></button>
              </span>
            )}
            {(minPrice != null || maxPrice != null) && (
              <span className="inline-flex items-center gap-1.5 border border-foreground/20 bg-muted px-3 py-1.5 text-[11px] text-foreground">
                {copy.priceFilterLabel}: {minPrice != null ? `₦${minPrice}` : "0"} - {maxPrice != null ? `₦${maxPrice}` : copy.maximumPriceValueLabel}
                <button type="button" onClick={() => updateParams({ minPrice: null, maxPrice: null })} aria-label={copy.removePriceFilterLabel} className="hover:text-primary"><X size={12} /></button>
              </span>
            )}
          </div>
        )}
        <div className="flex items-center justify-between gap-4 text-xs text-secondary">
          <p role="status" data-testid="status-result-count">{filteredProducts.length} {filteredProducts.length === 1 ? copy.resultCountSingular : copy.resultCountPlural}</p>
          {hasRefinements && <button
            type="button"
            onClick={resetFilters}
            className="uppercase tracking-widest text-foreground underline-offset-4 hover:underline"
            data-testid="button-reset-filters"
          >{copy.clearAllLabel}</button>}
        </div>
      </div>

      {filteredProducts.length === 0 ? <div className="border border-border bg-muted/20 py-24 text-center">
        <p role="status" className="text-sm uppercase tracking-widest text-secondary" data-testid="text-empty-message">
          {hasRefinements ? copy.noSearchResultsMessage : copy.emptyMessage}
        </p>
        <button type="button" onClick={resetFilters} className="mt-5 text-[11px] uppercase tracking-widest text-foreground hover:underline">
          {copy.resetFiltersLabel}
        </button>
      </div> : <div className="grid grid-cols-1 gap-x-6 gap-y-12 pb-24 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredProducts.map((product, index) => <Reveal key={product.slug} delay={(index % 4) * 80}>
          <ProductCard product={product} ctaLabel={copy.productCtaLabel} />
        </Reveal>)}
      </div>}
    </main>

    <Drawer.Root open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88vh] flex-col border-t border-border bg-background text-foreground">
          <div className="flex items-center justify-between border-b border-border p-4">
            <Drawer.Title className="text-sm font-semibold uppercase tracking-widest text-foreground">{copy.refineProductsTitle}</Drawer.Title>
            <Drawer.Close className="p-2 text-secondary hover:text-foreground" aria-label={copy.closeFiltersLabel}><X className="h-5 w-5" /></Drawer.Close>
          </div>
          <div className="flex-1 space-y-8 overflow-y-auto p-6">
            <fieldset>
              <legend className="mb-3 text-[10px] uppercase tracking-[0.2em] text-secondary/70">{copy.categoryLabel}</legend>
              <div className="flex flex-wrap gap-2">{categories.map((category) => <button
                key={category}
                type="button"
                onClick={() => updateParams({ category }, "catalogue_category_filter")}
                aria-pressed={activeCategory === category}
                className={`border px-3 py-2 text-[11px] uppercase tracking-wider transition-colors ${activeCategory === category ? "border-foreground text-background bg-foreground" : "border-border text-foreground hover:border-foreground/50"}`}
              >{category === all ? copy.allFilterLabel : category}</button>)}</div>
            </fieldset>
            <fieldset>
              <legend className="mb-3 text-[10px] uppercase tracking-[0.2em] text-secondary/70">{copy.fulfilmentLabel}</legend>
              <div className="grid grid-cols-2 gap-2">{fulfilmentOptions.map((option) => <button
                key={option.value}
                type="button"
                onClick={() => updateParams({ fulfilment: option.value }, "catalogue_fulfilment_filter")}
                aria-pressed={activeFulfilment === option.value}
                className={`border px-3 py-3 text-[11px] uppercase tracking-wider transition-colors ${activeFulfilment === option.value ? "border-foreground bg-foreground text-background" : "border-border text-foreground hover:border-foreground/50"}`}
              >{option.label}</button>)}</div>
            </fieldset>
            <RefinementFields mobile />
          </div>
          <div className="flex gap-3 border-t border-border p-4">
            <button type="button" onClick={resetFilters} className="flex-1 border border-border px-4 py-4 text-xs uppercase tracking-widest text-foreground hover:bg-muted transition-colors">{copy.resetLabel}</button>
            <button type="button" onClick={() => setMobileFiltersOpen(false)} className="flex-1 bg-foreground px-4 py-4 text-xs font-bold uppercase tracking-widest text-background hover:opacity-90 transition-opacity">
              {copy.viewResultsLabel} {filteredProducts.length} {filteredProducts.length === 1 ? copy.resultCountSingular : copy.resultCountPlural}
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  </div>;
}