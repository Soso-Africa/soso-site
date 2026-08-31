import { useState } from "react";
import type { PlatformContent } from "../../data/platformContent";
import { PlatformCopyFields } from "./PlatformCopyFields";

type Pages = PlatformContent["pages"];
type EditablePage = Exclude<keyof Pages, "faq">;

const pageLabels: Record<EditablePage, string> = {
  shop: "Shop & collections",
  about: "About",
  journal: "Journal",
  policies: "Policies",
  checkout: "Checkout",
  paymentReturn: "Payment return",
  notFound: "Not found",
};

export function PlatformEditorPages({ data, onChange }: { data: Pages; onChange: (data: Pages) => void }) {
  const [page, setPage] = useState<EditablePage>("shop");
  const pageData = data[page];

  return <div className="mt-5 space-y-5" data-testid="pages-structured-editor">
    <section className="border border-border bg-card p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Storefront page
          <select className="staff-input mt-1 min-w-56 normal-case tracking-normal" value={page} onChange={(event) => setPage(event.target.value as EditablePage)}>
            {(Object.keys(pageLabels) as EditablePage[]).map((key) => <option key={key} value={key}>{pageLabels[key]}</option>)}
          </select>
        </label>
        <p className="max-w-xl text-xs text-muted-foreground">Edit shopper-facing headings, SEO metadata, guidance, status messages, labels and calls to action. FAQ content remains in the dedicated FAQ workspace.</p>
      </div>
    </section>
    <section className="border border-border bg-card p-5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">{pageLabels[page]} page</h3>
      <p className="mt-2 text-xs text-muted-foreground">Changes preserve every other page and every unedited field in the platform document.</p>
      <div className="mt-4">
        <PlatformCopyFields
          value={pageData}
          path={[page]}
          onChange={(updated) => onChange({ ...data, [page]: updated as Pages[typeof page] })}
        />
      </div>
    </section>
  </div>;
}