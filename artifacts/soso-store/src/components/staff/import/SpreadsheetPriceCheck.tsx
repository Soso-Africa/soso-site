import React, { useEffect, useRef, useState } from "react";
import type { CatalogProduct } from "../../../data/platformContent";
import type { UpdateReview } from "./update-model";
import { checkSelectedPrices, isPriceChange, linkedPrice, type PriceCheck } from "./price-check";

export function useSpreadsheetPriceCheck(review: UpdateReview | undefined, baseline: CatalogProduct[] | undefined, selected: Set<string>) {
  const controller = useRef<AbortController | null>(null);
  const [state, setState] = useState<{
    review: UpdateReview; selected: Set<string>; loading: boolean; results: Record<string, PriceCheck>;
  } | null>(null);
  useEffect(() => {
    return () => { controller.current?.abort(); controller.current = null; };
  }, [review, baseline, selected]);
  const current = state?.review === review && state?.selected === selected ? state : null;
  const check = async () => {
    if (!review || !baseline) return;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setState({ review, selected, loading: true, results: {} });
    const timer = setTimeout(() => request.abort(), 20_000);
    try {
      const results = await checkSelectedPrices(review.changes.filter((c) => selected.has(c.id)), baseline, request.signal);
      if (controller.current === request) setState({ review, selected, loading: false, results });
    } finally { clearTimeout(timer); }
  };
  return { loading: current?.loading ?? false, results: current?.results ?? {}, check };
}

const money = (kobo: number) => `NGN ${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function SpreadsheetPriceCell({ change, baseline, selected, loading, result }: {
  change: UpdateReview["changes"][number]; baseline: CatalogProduct[]; selected: boolean; loading: boolean; result?: PriceCheck;
}) {
  if (!isPriceChange(change)) return <span className="text-muted-foreground">—</span>;
  if (!selected) return <span className="text-muted-foreground">Not selected</span>;
  if (!result) return <span>{!linkedPrice(change, baseline) ? "Unmapped — no confirmed eligible identifier" : loading ? "Checking fresh price…" : "Not checked — request a fresh price"}</span>;
  return <div className="space-y-1" data-price-status={result.status}>
    {result.amountKobo !== undefined && <strong className="block">{money(result.amountKobo)}</strong>}
    <span className="block">{result.message}</span>
    {result.fetchedAt && <span className="block text-muted-foreground">Fetched <time dateTime={result.fetchedAt}>{result.fetchedAt}</time></span>}
    {result.link && <code className="block break-all text-[10px] text-muted-foreground">
      Product {result.link.productId}{result.link.variantId ? ` · Variant ${result.link.variantId}` : " · Base price"}
    </code>}
  </div>;
}
