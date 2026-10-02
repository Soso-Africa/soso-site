import React, { useCallback, useEffect, useRef, useState } from "react";
import { customFetch } from "@workspace/api-client-react";
import { platformActionError } from "./platform-action-error";

type ReadinessItem = {
  slug: string;
  name: string;
  confirmed: boolean;
  approved: boolean;
  issues: string[];
  availability?: {
    localState: string;
    providerStock: "in_stock" | "out_of_stock" | "unknown" | "not_mapped";
    unavailableVariants: string[];
    reasons: string[];
    canMakeAvailable: boolean;
    productId?: string;
    variantIds: Record<string, string>;
  };
};
type Readiness = {
  products: ReadinessItem[];
  draftUpdatedAt: string;
  publishedAt: string | null;
};
type Props = {
  draftUpdatedAt: string | null;
  publishedAt: string | null;
  hasUnsavedChanges: boolean;
  busy: boolean;
  onPublished: (row: unknown) => void;
  onDraftSaved: (row: unknown) => void;
};

export function CatalogueBusinessApproval(props: Props) {
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<"all" | "unavailable" | "needs_action">("all");
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setReadiness(null);
    setAcknowledged(false);
    try {
      const next = await customFetch<Readiness>("/api/staff/content/platform/catalogue/readiness", { responseType: "json" });
      if (request === generation.current) setReadiness(next);
    } catch (error) {
      if (request === generation.current) setMessage(platformActionError(error, "Could not load business approval checks. Use Refresh checks to retry."));
    }
  }, []);
  useEffect(() => {
    void refresh();
    return () => { generation.current += 1; };
  }, [refresh, props.draftUpdatedAt, props.publishedAt]);
  const confirmed = readiness?.products.filter((item) => item.confirmed) ?? [];
  const excluded = readiness?.products.filter((item) => !item.confirmed) ?? [];
  const stale = !readiness || readiness.draftUpdatedAt !== props.draftUpdatedAt || readiness.publishedAt !== props.publishedAt;
  const disabled = props.busy || working || stale || props.hasUnsavedChanges;
  const approvedCount = confirmed.filter((item) => item.approved).length;
  const isUnavailable = (item: ReadinessItem) => item.availability?.localState === "unavailable"
    || item.availability?.providerStock === "out_of_stock"
    || !!item.availability?.unavailableVariants.length;
  const unavailableCount = readiness?.products.filter(isUnavailable).length ?? 0;
  const shownItems = readiness?.products.filter((item) => filter === "all"
    || (filter === "unavailable" ? isUnavailable(item) : !!item.issues.length || !item.approved)) ?? [];
  const makeAvailable = async (item: ReadinessItem) => {
    if (disabled || !item.availability?.canMakeAvailable) return;
    if (!window.confirm(`Make ${item.name} available as Made Immediately in SOSO? This confirms the existing exact inventory mapping again. It does not claim ready-to-dispatch stock, enable custom sizes, or publish the product. You must review business approval again after this change.`)) return;
    setWorking(true);
    setMessage("");
    try {
      const next = await customFetch(`/api/staff/content/platform/products/${encodeURIComponent(item.slug)}/availability`, {
        method: "POST", headers: { "content-type": "application/json" }, responseType: "json",
        body: JSON.stringify({ expectedDraftUpdatedAt: readiness!.draftUpdatedAt, fulfilmentState: "made_immediately", acknowledged: true }),
      });
      props.onDraftSaved(next);
      setMessage(`${item.name} is now available in the saved SOSO draft. Review business approval again, then publish. The live site is not changed yet.`);
    } catch (error) {
      setMessage(platformActionError(error, "Availability could not be changed. No publication occurred."));
    } finally {
      setWorking(false);
    }
  };
  const approve = async (slugs: string[]) => {
    if (disabled || !acknowledged || !slugs.length) return;
    setWorking(true);
    setMessage("");
    try {
      await customFetch("/api/staff/content/platform/catalogue/approve", {
        method: "POST", headers: { "content-type": "application/json" }, responseType: "json",
        body: JSON.stringify({ slugs, acknowledged: true, expectedDraftUpdatedAt: readiness!.draftUpdatedAt }),
      });
      await refresh();
      setMessage(`Business approval recorded for ${slugs.length} item${slugs.length === 1 ? "" : "s"}. Nothing has been published yet.`);
    } catch (error) {
      setMessage(`Business approval must be recorded by an owner or administrator. ${platformActionError(error, "Approval failed. Nothing was published.")}`);
    } finally {
      setWorking(false);
    }
  };
  const publish = async () => {
    if (disabled || !confirmed.length || approvedCount !== confirmed.length) return;
    if (!window.confirm(`Publish only these ${confirmed.length} confirmed items? ${excluded.length} unconfirmed items and any previously live products not in this list will stay off the website. Unrelated editorial drafts and checkout settings will not be published.`)) return;
    setWorking(true);
    setMessage("");
    try {
      const next = await customFetch("/api/staff/content/platform/catalogue/publish-confirmed", {
        method: "POST", headers: { "content-type": "application/json" }, responseType: "json",
        body: JSON.stringify({
          slugs: confirmed.map((item) => item.slug),
          expectedDraftUpdatedAt: readiness!.draftUpdatedAt,
          expectedPublishedAt: readiness!.publishedAt,
        }),
      });
      props.onPublished(next);
      setMessage(`Published exactly ${confirmed.length} confirmed items. Unconfirmed items are excluded; checkout settings are unchanged.`);
    } catch (error) {
      setMessage(platformActionError(error, "Publication failed. Nothing was published. Resolve the item checks below and retry."));
    } finally {
      setWorking(false);
    }
  };
  return <section className="mb-5 border border-primary/30 bg-primary/5 p-4 sm:p-5" aria-label="Business approval and confirmed release" data-testid="business-approval-panel">
    <h3 className="text-sm font-semibold">Business approval &amp; confirmed release</h3>
    <p className="mt-2 text-sm text-muted-foreground">Inventory confirmation is not business approval. An owner or administrator must approve the saved descriptions, product photos and rights before release. Approval applies to this exact saved version; editing an item requires reviewing it again.</p>
    <p className="mt-2 text-sm font-medium">{readiness ? `${confirmed.length} confirmed · ${approvedCount} business-approved · ${excluded.length} excluded` : "Loading saved-item checks…"}</p>
    {readiness && <div className="mt-3 flex flex-wrap items-center gap-3">
      <span className="text-sm font-medium">{unavailableCount} unavailable / stock-blocked</span>
      <label className="text-sm">Show{" "}
        <select aria-label="Filter catalogue availability" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} className="border border-border bg-background px-3 py-2">
          <option value="all">All products</option>
          <option value="unavailable">Unavailable / stock-blocked</option>
          <option value="needs_action">Needs action</option>
        </select>
      </label>
    </div>}
    {props.hasUnsavedChanges && <p role="alert" className="mt-2 text-sm">Save your current edits first. Approval and publication use the saved draft only.</p>}
    {readiness && stale && <p role="alert" className="mt-2 text-sm">The saved catalogue changed. Reload platform content, then refresh these checks.</p>}
    <label className="mt-4 flex items-start gap-3 text-sm">
      <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} disabled={disabled} className="mt-1" />
      <span>I have reviewed these confirmed products and approve their descriptions, photos, usage rights and catalogue identities for public display. This does not certify new stock or enable checkout.</span>
    </label>
    <div className="mt-4 flex flex-wrap gap-3">
      <button type="button" disabled={disabled || !acknowledged || !confirmed.length} onClick={() => void approve(confirmed.map((item) => item.slug))} className="min-h-10 bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-50">Approve {confirmed.length} confirmed items</button>
      <button type="button" disabled={disabled || !confirmed.length || approvedCount !== confirmed.length} onClick={() => void publish()} className="min-h-10 border border-primary px-4 text-xs font-semibold text-primary disabled:opacity-50">Publish only {confirmed.length} confirmed items</button>
      <button type="button" disabled={working || props.busy} onClick={() => void refresh()} className="min-h-10 border border-border px-4 text-xs">Refresh checks</button>
    </div>
    <details className="mt-4" open={filter !== "all" || undefined}>
      <summary className="cursor-pointer text-sm font-medium">Review every item and resolve outstanding checks</summary>
      <ul className="mt-3 divide-y divide-border">
        {shownItems.map((item) => <li key={item.slug} className="py-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">{item.name} <span className="font-normal text-muted-foreground">({item.slug}) — {item.confirmed ? item.approved ? "Business-approved" : "Needs business approval" : "Excluded: mapping not confirmed"}</span></span>
            <div className="flex flex-wrap gap-3">
              <a className="underline" href={`${import.meta.env.BASE_URL}staff/platform?platformSection=catalogue&product=${encodeURIComponent(item.slug)}`}>Edit / resolve this item</a>
              {item.confirmed && !item.approved && <button type="button" disabled={disabled || !acknowledged} className="underline disabled:opacity-50" onClick={() => void approve([item.slug])}>Approve this item</button>}
            </div>
          </div>
          {item.availability && <div className="mt-2 border border-border bg-background p-3">
            <p><strong>SOSO:</strong> {item.availability.localState.replaceAll("_", " ")} · <strong>JusticeSure:</strong> {item.availability.providerStock.replaceAll("_", " ")}</p>
            {!!item.availability.reasons.length && <ul className="mt-2 list-disc pl-5">{item.availability.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul>}
            {item.availability.canMakeAvailable && <button type="button" disabled={disabled} onClick={() => void makeAvailable(item)} className="mt-3 min-h-10 border border-primary px-3 text-xs font-semibold text-primary disabled:opacity-50">Make available in SOSO · Made Immediately</button>}
            {(item.availability.providerStock === "out_of_stock" || !!item.availability.unavailableVariants.length) && <div className="mt-2 text-xs">
              <p>Stock is controlled in JusticeSure. Update the mapped inventory record there, then return here and refresh checks / reconfirm. SOSO cannot override upstream stock.</p>
              {item.availability.productId && <p className="mt-1 break-all">Product ID: <code>{item.availability.productId}</code></p>}
              {!!item.availability.unavailableVariants.length && <p className="mt-1 break-all">Affected choices / variants: {item.availability.unavailableVariants.join(", ")}</p>}
            </div>}
            <p className="mt-2 text-xs text-muted-foreground">For Ready Now stock by size or other fulfilment details, use Edit / resolve this item → Fulfilment. Changing inventory identifiers requires mapping review again.</p>
          </div>}
          {!!item.issues.length && <ul className="mt-2 list-disc pl-5 text-muted-foreground">{item.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>}
        </li>)}
      </ul>
      {readiness && !shownItems.length && <p className="mt-3 text-sm text-muted-foreground">No items match this filter.</p>}
    </details>
    <p className="mt-3 text-xs text-muted-foreground">Release replaces the public product list with exactly the named confirmed items. Unconfirmed accessories are not automatically approved. Existing availability and payment activation checks remain in force.</p>
    {message && <p role="status" className="mt-3 border border-primary/25 bg-background p-3 text-sm whitespace-pre-wrap">{message}</p>}
  </section>;
}