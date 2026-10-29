import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import type { CatalogProduct } from "../../../data/platformContent";
import { FIELD_DEFS, type FieldKey } from "./update-model";
import { createUpdateSheet, type UpdateSheetFormat } from "./update-sheet";

type Scope = "all" | "choose";
type ValueMode = "current" | "blank";

const ctl = "min-h-10 border border-border px-3 font-semibold disabled:opacity-50";

export function UpdateSheetDownload({ savedProducts, disabled }: { savedProducts: CatalogProduct[]; disabled: boolean }) {
  const uid = useId();
  const [fields, setFields] = useState<FieldKey[]>(() => FIELD_DEFS.map((field) => field.key));
  const [format, setFormat] = useState<UpdateSheetFormat>("xlsx");
  const [scope, setScope] = useState<Scope>("all");
  const [valueMode, setValueMode] = useState<ValueMode>("current");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const downloading = useRef(false);
  const mounted = useRef(true);
  const savedRef = useRef(savedProducts);
  savedRef.current = savedProducts;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const slugs = useMemo(() => new Set(savedProducts.map((p) => p.slug)), [savedProducts]);
  // Selections for products no longer saved are ignored, never silently re-added.
  const validPicked = useMemo(() => new Set([...picked].filter((s) => slugs.has(s))), [picked, slugs]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? savedProducts.filter((p) => p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q)) : savedProducts;
  }, [savedProducts, query]);
  const selection = scope === "all" ? savedProducts : savedProducts.filter((p) => validPicked.has(p.slug));
  const hiddenSelected = scope === "choose" ? [...validPicked].filter((s) => !filtered.some((p) => p.slug === s)).length : 0;

  const reset = () => { setError(""); setNotice(""); };
  const lock = disabled || busy;
  const selectionError = !savedProducts.length ? "No saved products to download."
    : !selection.length ? "Choose at least one saved product." : "";
  const fieldError = fields.length ? "" : "Choose at least one editable field.";
  const cannotDownload = lock || !!selectionError || !!fieldError;

  const togglePick = (slug: string, on: boolean) => {
    setPicked((prev) => { const n = new Set(prev); if (on) n.add(slug); else n.delete(slug); return n; });
    reset();
  };

  const download = async () => {
    if (cannotDownload || downloading.current) return;
    const snapshot = savedProducts;
    const products = selection;
    const populated = valueMode === "current";
    downloading.current = true; setBusy(true); reset();
    try {
      const blob = await createUpdateSheet(products, fields, format, { populated });
      if (!mounted.current) return;
      if (savedRef.current !== snapshot) {
        setError("The saved catalogue changed while preparing the file. Nothing was downloaded; download again for the current saved products.");
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `soso-${populated ? "current-values" : "blank"}-update-sheet-${products.length}-products-${stamp}.${format}`;
      document.body.appendChild(link);
      try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30_000); }
      setNotice(`Download prepared: one ${format.toUpperCase()} file with ${products.length} saved product${products.length === 1 ? "" : "s"}${populated ? " and current values filled in" : " and blank field cells"}. Edit it, then choose it below to review. Nothing has been saved or published.`);
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : "Download failed. Please retry.");
    } finally {
      downloading.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <details open className="border border-border p-3 text-xs" data-testid="update-sheet-download">
      <summary className="cursor-pointer font-semibold">Download products to edit in a spreadsheet</summary>
      <p className="mt-3 leading-5">Exports saved draft data only. Unsaved editor changes are not included.
        By default each selected column is filled with the current saved value; change the cells you need and upload the file below to review and save many products at once.
        Untouched columns and cells are preserved. Blank cells never delete saved values. Keep the protected original-values column in the file: it detects which cells you actually edited and warns when a value changed since download.
        The blank Variant row holds product fields and base Price; named Variant rows target only that size's Price.</p>
      <p className="mt-2 leading-5 text-muted-foreground">Updates stay in the unpublished draft. Price changes still need JusticeSure approval. Inventory mappings, stock and release controls are never imported.</p>

      <fieldset disabled={lock} aria-busy={busy || undefined} className="mt-3 space-y-4">
        <legend className="sr-only">Update sheet download options</legend>

        <fieldset className="space-y-2">
          <legend className="font-semibold">Products to include</legend>
          <label className="flex items-center gap-2"><input type="radio" name={`${uid}-scope`} checked={scope === "all"}
            onChange={() => { setScope("all"); reset(); }} data-testid="radio-scope-all" />
            All saved products ({savedProducts.length})</label>
          <label className="flex items-center gap-2"><input type="radio" name={`${uid}-scope`} checked={scope === "choose"}
            onChange={() => { setScope("choose"); reset(); }} data-testid="radio-scope-choose" />
            Choose products</label>
          {scope === "choose" && (
            <div className="space-y-2 border border-border p-2" data-testid="product-chooser">
              <label htmlFor={`${uid}-search`} className="block font-semibold">Search products by name or slug</label>
              <input id={`${uid}-search`} type="search" className="staff-input w-full" value={query}
                onChange={(e) => setQuery(e.target.value)} data-testid="input-search-update-products" />
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={ctl} disabled={lock || !filtered.length} data-testid="button-select-all-products"
                  onClick={() => { setPicked((prev) => new Set([...prev, ...filtered.map((p) => p.slug)])); reset(); }}>
                  Select all{query.trim() ? " shown" : ""}</button>
                <button type="button" className={ctl} disabled={lock || !validPicked.size} data-testid="button-clear-products"
                  onClick={() => { setPicked(new Set()); reset(); }}>Clear</button>
                <span role="status" data-testid="text-selected-product-count">{validPicked.size} of {savedProducts.length} selected
                  {hiddenSelected > 0 ? ` (${hiddenSelected} hidden by search, still included)` : ""}</span>
              </div>
              <ul className="max-h-64 divide-y divide-border overflow-y-auto border border-border" aria-label="Saved products">
                {filtered.map((p) => (
                  <li key={p.slug}><label className="flex items-start gap-2 px-2 py-1.5">
                    <input type="checkbox" checked={validPicked.has(p.slug)} onChange={(e) => togglePick(p.slug, e.target.checked)}
                      data-testid={`checkbox-product-${p.slug}`} />
                    <span><span className="block">{p.name}</span><code className="text-[10px] text-muted-foreground">{p.slug}</code></span>
                  </label></li>
                ))}
                {!filtered.length && <li className="px-2 py-3 text-muted-foreground">{savedProducts.length ? "No saved products match this search." : "No saved products yet."}</li>}
              </ul>
            </div>
          )}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="font-semibold">Editable fields to include</legend>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={ctl} disabled={lock || fields.length === FIELD_DEFS.length} data-testid="button-select-all-fields"
              onClick={() => { setFields(FIELD_DEFS.map((d) => d.key)); reset(); }}>Select all fields</button>
            <button type="button" className={ctl} disabled={lock || !fields.length} data-testid="button-clear-fields"
              onClick={() => { setFields([]); reset(); }}>Clear</button>
            <span className="self-center">{fields.length} of {FIELD_DEFS.length} fields</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {FIELD_DEFS.map((def) => <label key={def.key} className="flex items-start gap-2">
              <input type="checkbox" checked={fields.includes(def.key)} onChange={(event) => {
                const on = event.target.checked;
                setFields((prev) => on ? (prev.includes(def.key) ? prev : [...prev, def.key]) : prev.filter((key) => key !== def.key));
                reset();
              }} />
              {def.label}
            </label>)}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="font-semibold">Cell values</legend>
          <label className="flex items-start gap-2"><input type="radio" name={`${uid}-values`} checked={valueMode === "current"}
            onChange={() => { setValueMode("current"); reset(); }} data-testid="radio-values-current" />
            <span>Current saved values (recommended)</span></label>
          <label className="flex items-start gap-2"><input type="radio" name={`${uid}-values`} checked={valueMode === "blank"}
            onChange={() => { setValueMode("blank"); reset(); }} data-testid="radio-values-blank" />
            <span>Blank update sheet: identity columns only, fill just the cells you want to set</span></label>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <label>Format <select aria-label="Update sheet format" className="staff-input ml-2" value={format}
            onChange={(event) => { setFormat(event.target.value as UpdateSheetFormat); reset(); }}>
            <option value="xlsx">Excel (.xlsx)</option><option value="csv">CSV (.csv)</option>
          </select></label>
          <button type="button" className={ctl} disabled={cannotDownload} aria-disabled={cannotDownload}
            onClick={() => void download()} data-testid="button-download-update-sheet">
            {busy ? "Preparing download…" : `Download ${selection.length} product${selection.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </fieldset>

      <p className="mt-3 text-muted-foreground">All selected products go into one file: up to 1,000 products, 10,000 rows and 2 MiB. Excel imports use the first matching worksheet only. Approvals, mapping identifiers, credentials and publication controls are excluded.</p>
      {(selectionError || fieldError) && <p role="alert" className="mt-2 text-destructive" data-testid="text-download-blocked">{selectionError || fieldError}</p>}
      {error && <p role="alert" className="mt-2 text-destructive">{error}</p>}
      {notice && <p role="status" className="mt-2">{notice}</p>}
    </details>
  );
}
