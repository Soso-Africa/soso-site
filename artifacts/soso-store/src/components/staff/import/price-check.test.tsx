import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { CatalogProduct } from "../../../data/platformContent";
import { applySelectedChanges, buildUpdateReview } from "./update-model";
import { checkSelectedPrices, linkedPrice } from "./price-check";
import { SpreadsheetPriceCell, useSpreadsheetPriceCheck } from "./SpreadsheetPriceCheck";

const product: CatalogProduct = {
  slug: "test-kaftan", name: "Test Kaftan", price: 80000, department: "men", category: "Kaftans",
  releaseState: "placeholder", standardEligible: true, customEligible: true, standardSizes: ["M", "L"],
  commerceProductId: "product-id", commerceVariantIds: { M: "variant-m", L: "variant-l", Custom: "variant-custom" },
  img: "", images: [], materialTurnSets: [], tag: "", note: "", description: "", sizes: ["M", "L"],
  colour: "Indigo", colourOptions: [], allowCustomColour: false, fabric: "Cotton", fit: "Relaxed",
  searchableTerms: [], merchandising: { isNew: false, sortPriority: 1 },
  readyNowSizes: [], fulfilmentState: "unavailable", dispatchMessage: "Soon",
  commerceMappingConfirmation: {
    productHash: "confirmed", localHash: "confirmed", snapshotHash: "snapshot", snapshotFetchedAt: "",
    confirmedAt: "", confidence: 1, source: "manual", evidence: [], choiceLabels: {},
  },
};
const collections = [{ department: "men", category: "Kaftans" }];
const review = buildUpdateReview({
  rows: [
    { rowNumber: 2, slug: product.slug, fields: { Price: "81000.25", Variant: "" } },
    { rowNumber: 3, slug: product.slug, fields: { Price: "90000.50", Variant: "M" } },
    { rowNumber: 4, slug: product.slug, fields: { Price: "100000", Variant: "L" } },
    { rowNumber: 5, slug: product.slug, fields: { Price: "125000", Variant: "Custom" } },
  ], mapping: { Price: "price", Variant: "variant" }, mode: "replace", savedProducts: [product], collections,
});
const remote = {
  id: "product-id", currency: "NGN", amountKobo: 8100025,
  variants: [
    { id: "variant-m", label: "unrelated label", amountKobo: 9000050 },
    { id: "variant-l", label: "M", amountKobo: 10000000 },
    { id: "variant-custom", label: "Custom", amountKobo: 12500000 },
  ],
};
const signal = () => new AbortController().signal;
const reader = (products: unknown[]) => (async () => Response.json({ products })) as typeof fetch;

test("explicit read compares exact base, different variants and Custom without writes or label inference", async () => {
  assert.equal(review.errors.length, 0);
  const before = JSON.stringify(product);
  let calls = 0;
  const results = await checkSelectedPrices(review.changes, [product], signal(), async (url, options) => {
    calls++;
    assert.equal(url, "/api/staff/commerce/catalogue");
    assert.equal(options?.method, undefined); // GET only
    assert.equal(options?.body, undefined);
    assert.equal(options?.cache, "no-store");
    assert.equal(options?.credentials, "include");
    return Response.json({ products: [remote] });
  });
  assert.equal(calls, 1);
  assert.deepEqual(Object.values(results).map((r) => r.amountKobo), [8100025, 9000050, 10000000, 12500000]);
  assert.ok(Object.values(results).every((r) => r.status === "match" && !Number.isNaN(Date.parse(r.fetchedAt!))));
  const html = renderToStaticMarkup(<SpreadsheetPriceCell change={review.changes[1]!} baseline={[product]} selected loading={false} result={results[review.changes[1]!.id]} />);
  for (const text of ["NGN 90,000.50", "Matches spreadsheet", "Fetched", "variant-m", "product-id"]) assert.ok(html.includes(text), text);
  assert.equal(JSON.stringify(product), before);
});

test("another explicit check shows changed upstream amount, not old results or parent fallback", async () => {
  const change = review.changes.find((c) => c.variant === "L")!;
  const first = await checkSelectedPrices([change], [product], signal(), reader([remote]));
  const next = await checkSelectedPrices([change], [product], signal(), reader([{ ...remote, variants: [{ id: "variant-l", amountKobo: 11000075 }] }]));
  assert.equal(first[change.id]!.status, "match");
  assert.equal(next[change.id]!.status, "mismatch");
  assert.equal(next[change.id]!.amountKobo, 11000075);
  const html = renderToStaticMarkup(<SpreadsheetPriceCell change={change} baseline={[product]} selected loading={false} result={next[change.id]} />);
  assert.ok(html.includes("NGN 110,000.75"));
  assert.ok(html.includes("Mismatch"));
});

test("unconfirmed, missing and ineligible links are unmapped and do not request JusticeSure", async () => {
  const variant = review.changes.find((c) => c.variant === "M")!;
  const custom = review.changes.find((c) => c.variant === "Custom")!;
  for (const [change, saved] of [
    [variant, { ...product, commerceMappingConfirmation: undefined }],
    [variant, { ...product, commerceVariantIds: {} }],
    [variant, { ...product, standardEligible: false }],
    [custom, { ...product, customEligible: false }],
    [review.changes[0]!, { ...product, commerceProductId: undefined }],
  ] as const) {
    assert.equal(linkedPrice(change, [saved]), undefined);
    const results = await checkSelectedPrices([change], [saved], signal(), async () => { throw new Error("Must not read"); });
    assert.equal(results[change.id]!.status, "unmapped");
  }
});

test("missing exact remote link and non-NGN or invalid amounts are unavailable, never guessed", async () => {
  const change = review.changes.find((c) => c.variant === "M")!;
  for (const products of [
    [], [{ ...remote, id: "other" }], [{ ...remote, currency: "USD" }],
    [{ ...remote, variants: [{ id: "other", label: "M", amountKobo: 9000050 }] }],
    [{ ...remote, variants: [{ id: "variant-m", amountKobo: 1.5 }] }],
  ]) {
    const results = await checkSelectedPrices([change], [product], signal(), reader(products));
    assert.equal(results[change.id]!.status, "unavailable");
    assert.equal(results[change.id]!.amountKobo, undefined);
  }
});

test("network, authorization and malformed response failures preserve draft saving and clear renewed mapping confirmation", async () => {
  for (const read of [
    (async () => { throw new TypeError("Network disconnected"); }) as typeof fetch,
    (async () => new Response("", { status: 403 })) as typeof fetch,
    (async () => Response.json({ unexpected: [] })) as typeof fetch,
  ]) {
    const before = JSON.stringify(product);
    const results = await checkSelectedPrices(review.changes, [product], signal(), read);
    assert.ok(Object.values(results).every((r) => r.status === "unavailable" && !r.fetchedAt && r.amountKobo === undefined));
    const selected = new Set([review.changes[1]!.id]);
    const saved = applySelectedChanges([product], review.changes, selected, collections);
    assert.equal(saved[0]!.variantPrices?.M, 90000.5);
    assert.equal(saved[0]!.commerceMappingConfirmation, undefined);
    assert.equal(saved[0]!.releaseState, "placeholder");
    assert.equal(saved[0]!.commerceProductId, product.commerceProductId);
    assert.equal(JSON.stringify(product), before);
  }
});

test("selection or review changes discard in-flight results; failures remain retryable", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const original = globalThis.fetch;
  let resolve!: (r: Response) => void;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Promise<Response>((r) => { resolve = r; }); };
  let current!: ReturnType<typeof useSpreadsheetPriceCheck>;
  const baseline = [product];
  let selected = new Set([review.changes[1]!.id]);
  function Harness({ value = review }: { value?: typeof review }) {
    current = useSpreadsheetPriceCheck(value, baseline, selected);
    return null;
  }
  let tree!: ReactTestRenderer;
  try {
    await act(async () => { tree = create(<Harness />); });
    assert.equal(calls, 0); // never automatic
    let pending!: Promise<void>;
    await act(async () => { pending = current.check(); });
    assert.equal(current.loading, true);
    selected = new Set([review.changes[2]!.id]);
    await act(async () => { tree.update(<Harness />); });
    await act(async () => { resolve(Response.json({ products: [remote] })); await pending; });
    assert.deepEqual(current.results, {});
    globalThis.fetch = async () => { throw new Error("offline"); };
    await act(async () => { await current.check(); });
    assert.equal(current.results[review.changes[2]!.id]!.status, "unavailable");
    globalThis.fetch = reader([remote]);
    await act(async () => { await current.check(); });
    assert.equal(current.results[review.changes[2]!.id]!.status, "match");
    await act(async () => { tree.update(<Harness value={{ ...review }} />); });
    assert.deepEqual(current.results, {});
    assert.equal(current.loading, false);
  } finally {
    await act(async () => { tree?.unmount(); });
    globalThis.fetch = original;
  }
});
