import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, FileSpreadsheet, Loader2, RefreshCw } from "lucide-react";
import { scanCatalogueImportSheet, type CatalogueImportSheet } from "@workspace/api-client-react";
import type { CatalogProduct } from "../../../data/platformContent";
import { MAX_UPDATE_SHEET_BYTES as MAX_SHEET_BYTES } from "./update-reference";
import { fileToBase64 } from "./import-store";
import { SpreadsheetPriceCell, useSpreadsheetPriceCheck } from "./SpreadsheetPriceCheck";
import { isPriceChange } from "./price-check";
import {
  FIELD_DEFS, MAX_UPDATE_PRODUCTS, applySelectedChanges, buildUpdateReview, isProtectedHeading, mappingErrors,
  productsDiffer, sheetHeadings, suggestMapping, type Destination, type UpdateMode, type UpdateReview,
} from "./update-model";

import { UpdateSheetDownload } from "./UpdateSheetDownload";
import { UpdateReviewSummary } from "./UpdateReviewSummary";

const label = "text-[10px] font-semibold uppercase tracking-wider";
const btn = `inline-flex min-h-10 items-center justify-center gap-2 border border-border bg-background px-3 ${label} text-primary hover:bg-muted/40 disabled:opacity-50 transition-colors`;
const btnPrimary = `inline-flex min-h-10 items-center justify-center gap-2 bg-primary px-3 ${label} text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors`;

type Preview = { review: UpdateReview; baseline: CatalogProduct[]; inputKey: string; savedRef: CatalogProduct[] };

function errText(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function CatalogueUpdates({ savedProducts, editorProducts, collections, onUpdateProducts }: {
  savedProducts: CatalogProduct[];
  editorProducts: CatalogProduct[];
  collections: { department: string; category: string }[];
  onUpdateProducts: (products: CatalogProduct[], reviewedSavedProducts: CatalogProduct[]) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [fileToken, setFileToken] = useState(0);
  const [sheet, setSheet] = useState<CatalogueImportSheet | null>(null);
  const [mapping, setMapping] = useState<Record<string, Destination>>({});
  const [mode, setMode] = useState<UpdateMode>("fill");
  const [inputRevision, setInputRevision] = useState(0);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [success, setSuccess] = useState("");
  const readGen = useRef(0);
  const savingRef = useRef(false);

  const headings = useMemo(() => sheetHeadings(sheet?.rows ?? []), [sheet]);
  const mapErrs = useMemo(() => sheet ? mappingErrors(mapping) : [], [sheet, mapping]);
  const inputKey = `${fileToken}|${inputRevision}|${mode}|${JSON.stringify(mapping)}`;
  // Any change to file, mode, mapping or saved catalogue invalidates the old review.
  const live = preview && preview.inputKey === inputKey && preview.savedRef === savedProducts ? preview : null;
  const dirty = useMemo(() => productsDiffer(editorProducts, savedProducts), [editorProducts, savedProducts]);

  const readFile = async (file: File) => {
    const gen = ++readGen.current;
    setReadError(""); setSuccess(""); setSaveError(""); setPreview(null); setSelected(new Set());
    setSheet(null); setFileName(file.name); setFileToken(gen);
    if (!/\.(xlsx|csv)$/i.test(file.name)) { setReadError("Choose an .xlsx or .csv file."); return; }
    if (file.size > MAX_SHEET_BYTES) { setReadError(`${file.name} is ${(file.size / 1024).toFixed(1)} KiB. The update limit is 2 MiB. Choose fewer products/fields or use Excel.`); return; }
    setReading(true);
    try {
      const args = { name: file.name, contentBase64: await fileToBase64(file), mode: "update" as const };
      const result = await scanCatalogueImportSheet(args);
      if (gen !== readGen.current) return;
      setSheet(result);
      setMapping(suggestMapping(sheetHeadings(result.rows)));
    } catch (error) {
      if (gen === readGen.current) setReadError(errText(error, "The spreadsheet could not be read. It needs an exact Slug heading plus at least one other column."));
    } finally { if (gen === readGen.current) setReading(false); }
  };

  const buildReview = () => {
    if (!sheet) return;
    setSuccess(""); setSaveError("");
    const baseline = structuredClone(savedProducts);
    const review = buildUpdateReview({ rows: sheet.rows, mapping, mode, savedProducts: baseline, collections });
    setPreview({ review, baseline, inputKey, savedRef: savedProducts });
    setSelected(review.errors.length ? new Set() : new Set(review.changes.map((c) => c.id)));
  };

  const review = live?.review;
  const priceCheck = useSpreadsheetPriceCheck(review, live?.baseline, selected);
  const selectedPrices = review?.changes.filter((c) => selected.has(c.id) && isPriceChange(c)).length ?? 0;
  const blocked = !review || review.errors.length > 0;
  const selectedProducts = review ? new Set(review.changes.filter((c) => selected.has(c.id)).map((c) => c.slug)).size : 0;
  const allSelected = review ? review.changes.length > 0 && review.changes.every((c) => selected.has(c.id)) : false;

  const save = async () => {
    if (!live || savingRef.current || blocked || selected.size === 0 || dirty) return;
    let products: CatalogProduct[];
    try { products = applySelectedChanges(live.baseline, live.review.changes, selected, collections); }
    catch (error) { setSaveError(errText(error, "Changes could not be prepared.")); return; }
    savingRef.current = true; setSaving(true); setSaveError(""); setSuccess("");
    try {
      await onUpdateProducts(products, live.baseline);
      const n = selected.size;
      setPreview(null); setSelected(new Set());
      setSuccess(`${n} change${n === 1 ? "" : "s"} saved to ${products.length} product${products.length === 1 ? "" : "s"} in the unpublished draft. Nothing was published. Mapping confirmation was cleared on each modified product; review it in Catalogue Products before publishing.`);
    } catch (error) {
      setPreview(null); setSelected(new Set());
      setSaveError(`${errText(error, "The draft could not be saved.")} Nothing is confirmed as saved. Reload if needed, then rebuild the review.`);
    } finally { savingRef.current = false; setSaving(false); }
  };

  return (
    <section className="border border-primary/40 bg-card" data-testid="catalogue-updates">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} data-testid="button-toggle-catalogue-updates"
        className="flex w-full items-center justify-between gap-3 p-5 text-left hover:bg-muted/30">
        <span>
          <span className={`${label} flex items-center gap-2 text-primary`}><FileSpreadsheet className="h-3.5 w-3.5" /> Update existing products</span>
          <span className="mt-1 block text-xs text-muted-foreground">Fill missing facts and per-size NGN prices on saved products from a spreadsheet. Matches exact slugs only; never creates or publishes.</span>
        </span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {open && (
        <div className="space-y-5 border-t border-border p-5">
          <div className="border-l-2 border-primary bg-accent px-3 py-2 text-xs leading-5 text-accent-foreground" data-testid="text-update-rules">
            Columns: an exact <strong>Slug</strong> heading plus any field, for example <code>Slug, Fabric</code> or <code>Slug, Variant, Price</code>.
            Price without Variant sets the base price. Variants must match an existing size label exactly (standard sizes, plus Custom when custom-eligible).
            Blank cells never clear anything. Lists use <code>|</code> or <code>;</code>. Booleans accept true, false, yes or no.
            Current-values downloads include a protected original-values reference: keep it in the file.
            Only cells you edited are proposed; newer conflicting catalogue changes block saving. Edit product fields on the blank Variant row and size prices on named Variant rows.
            Slugs, release state, approvals, JusticeSure mapping and retired colour masks are never changed here. Upload photos, approve releases and map inventory in the normal product editors.
            Unmapped columns are ignored and the server still applies its normal schema, media and commerce checks.
          </div>

          <UpdateSheetDownload savedProducts={savedProducts} disabled={reading || saving} />

          <div className="flex flex-wrap items-center gap-3">
            <label className={btnPrimary + " cursor-pointer"} data-testid="button-choose-update-sheet">
              {reading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
              {sheet ? "Choose another sheet" : "Choose .xlsx or .csv"}
              <input type="file" accept=".xlsx,.csv" className="sr-only" disabled={reading || saving} data-testid="input-update-sheet"
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void readFile(f); }} />
            </label>
            {fileName && <span className="text-xs text-muted-foreground" data-testid="text-update-file">{fileName}{sheet ? ` · ${sheet.rows.length} rows` : ""}</span>}
          </div>
          {readError && <p role="alert" className="border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{readError}</p>}
          {success && <p role="status" data-testid="status-update-saved" className="flex gap-2 border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900"><CheckCircle2 className="h-4 w-4 shrink-0" />{success}</p>}
          {saveError && <p role="alert" data-testid="text-update-save-error" className="border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{saveError}</p>}

          {reading && <div className="space-y-2" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-8 animate-pulse bg-muted" />)}</div>}

          {sheet && (
            <>
              <div className="space-y-2">
                <h4 className={`${label} text-primary`}>1 · Map columns</h4>
                {headings.length === 0 && <p className="text-xs text-muted-foreground">This sheet has only a Slug column. Add a field column such as Fabric or Price.</p>}
                <div className="divide-y divide-border border border-border">
                  {headings.map((h) => (
                    <div key={h} className="grid items-center gap-2 px-3 py-2 sm:grid-cols-[1fr_1fr]">
                      <span className="text-xs font-medium">{h}{isProtectedHeading(h) && <span className="ml-2 text-[10px] text-amber-800">protected, always ignored</span>}</span>
                      <select className="staff-input text-xs" value={mapping[h] ?? "ignore"} disabled={isProtectedHeading(h) || saving}
                        aria-label={`Map ${h} column`}
                        data-testid={`select-map-${h}`} onChange={(e) => {
                          setMapping((m) => ({ ...m, [h]: e.target.value as Destination }));
                          setInputRevision((revision) => revision + 1);
                        }}>
                        <option value="ignore">Ignore</option>
                        <option value="variant">Variant / size label</option>
                        {FIELD_DEFS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                {mapErrs.map((e) => <p key={e} role="alert" className="text-xs text-destructive">{e}</p>)}
              </div>

              <fieldset className="space-y-2">
                <legend className={`${label} text-primary`}>2 · Mode</legend>
                <label className="flex items-start gap-2 text-xs"><input type="radio" checked={mode === "fill"} onChange={() => { setMode("fill"); setInputRevision((revision) => revision + 1); }} data-testid="radio-mode-fill" />
                  <span><strong>Fill missing only.</strong> Changes only empty or placeholder values (such as To be confirmed) and unset variant prices.</span></label>
                <label className="flex items-start gap-2 text-xs"><input type="radio" checked={mode === "replace"} onChange={() => { setMode("replace"); setInputRevision((revision) => revision + 1); }} data-testid="radio-mode-replace" />
                  <span><strong>Replace supplied fields.</strong> For intentional corrections: every non-blank mapped cell replaces the saved value.</span></label>
              </fieldset>

              <button type="button" className={btn} disabled={mapErrs.length > 0 || saving} onClick={buildReview} data-testid="button-build-update-review">
                <RefreshCw className="h-3.5 w-3.5" /> {preview && !live ? "Rebuild review" : "Build review"}
              </button>
              {preview && !live && <p role="status" className="text-xs text-amber-800">The file, mode, mapping or saved catalogue changed. Rebuild the review.</p>}
            </>
          )}

          {review && (
            <div className="space-y-4" data-testid="update-review">
              <h4 className={`${label} text-primary`}>3 · Review</h4>
              <UpdateReviewSummary review={review} mode={mode} />
              {review.errors.length > 0 && (
                <div role="alert" className="space-y-1 border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive" data-testid="list-update-errors">
                  <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" />Fix these in the sheet or set the column to Ignore, then rebuild. Nothing can be saved until they are resolved.</p>
                  <ul className="list-disc pl-5">{review.errors.map((e, i) => <li key={i}>{e.message}</li>)}</ul>
                </div>
              )}
              {review.changes.length > 0 && (
                <div className="space-y-2 border border-border p-3 text-xs">
                  <button type="button" className={btn} onClick={() => void priceCheck.check()}
                    disabled={saving || blocked || priceCheck.loading || selectedPrices === 0} data-testid="button-check-import-prices">
                    {priceCheck.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    {priceCheck.loading ? "Checking JusticeSure…" : "Check fresh JusticeSure prices"} ({selectedPrices})
                  </button>
                  <p role="status">Read-only comparison of selected prices using confirmed IDs only. Results are a fetched snapshot, not a live guarantee.
                    Nothing changes in JusticeSure. Checks never confirm mappings, publish or enable checkout. Unavailable or mismatched prices do not block draft editing.
                    Saving still clears mapping confirmation; review and confirm again in Catalogue Products before the existing live publication checks.</p>
                </div>
              )}
              {review.changes.length > 0 && (
                <div className="overflow-x-auto border border-border">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted/40"><tr>
                      <th className="p-2"><input type="checkbox" aria-label="Select all changes" checked={allSelected} disabled={blocked || saving} data-testid="checkbox-select-all-updates"
                        onChange={() => setSelected(allSelected ? new Set() : new Set(review.changes.map((c) => c.id)))} /></th>
                      <th className={`p-2 ${label}`}>Product</th><th className={`p-2 ${label}`}>Field</th>
                      <th className={`p-2 ${label}`}>Before</th><th className={`p-2 ${label}`}>After (spreadsheet)</th><th className={`p-2 ${label}`}>JusticeSure current NGN</th><th className={`p-2 ${label}`}>Rows</th>
                    </tr></thead>
                    <tbody className="divide-y divide-border">
                      {review.changes.map((c) => (
                        <tr key={c.id} className={selected.has(c.id) ? "bg-accent/40" : ""} data-testid={`row-update-${c.id}`}>
                          <td className="p-2 align-top"><input type="checkbox" checked={selected.has(c.id)} disabled={blocked || saving} aria-label={`Select ${c.label} for ${c.slug}`}
                            data-testid={`checkbox-update-${c.id}`}
                            onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })} /></td>
                          <td className="p-2 align-top"><span className="block">{c.productName}</span><code className="text-[10px] text-muted-foreground">{c.slug}</code></td>
                          <td className="p-2 align-top">{c.label}</td>
                          <td className="max-w-[16rem] break-words p-2 align-top text-muted-foreground line-through decoration-muted-foreground/40">{c.before}</td>
                          <td className="max-w-[16rem] break-words p-2 align-top font-medium">{c.after}</td>
                          <td className="min-w-52 max-w-[20rem] break-words p-2 align-top">
                            <SpreadsheetPriceCell change={c} baseline={live!.baseline} selected={selected.has(c.id)}
                              loading={priceCheck.loading} result={priceCheck.results[c.id]} />
                          </td>
                          <td className="p-2 align-top text-muted-foreground">{c.rows.join(", ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {review.skipped.length > 0 && (
                <details className="border border-border p-3 text-xs" data-testid="list-update-skipped">
                  <summary className="cursor-pointer font-semibold">Skipped · {review.skipped.length}</summary>
                  <ul className="mt-2 space-y-1">{review.skipped.map((s, i) => <li key={i}><code>{s.slug}</code> · {s.label} · {s.reason} (row {s.rows.join(", ")})</li>)}</ul>
                </details>
              )}
              {dirty && <p role="alert" className="border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">The catalogue editor has unsaved edits. Save or discard them before saving spreadsheet changes.</p>}
              {selectedProducts > MAX_UPDATE_PRODUCTS && <p role="alert" className="text-xs text-destructive">Select changes for at most {MAX_UPDATE_PRODUCTS} products per save (currently {selectedProducts}).</p>}
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" className={btnPrimary} data-testid="button-save-selected-updates"
                  disabled={blocked || saving || dirty || selected.size === 0 || selectedProducts > MAX_UPDATE_PRODUCTS} onClick={() => void save()}>
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save {selected.size} selected change{selected.size === 1 ? "" : "s"} to draft
                </button>
                <span className="text-xs text-muted-foreground">{selectedProducts} product{selectedProducts === 1 ? "" : "s"} · not published</span>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
