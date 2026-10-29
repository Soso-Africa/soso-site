import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CatalogProduct } from "../../../data/platformContent";
import { UpdateSheetDownload } from "./UpdateSheetDownload";

const products = [
  { slug: "adire-kaftan", name: "Adire Kaftan" },
  { slug: "ankara-shirt", name: "Ankara Shirt" },
] as unknown as CatalogProduct[];

test("defaults to all saved products with current values in one file", () => {
  const html = renderToStaticMarkup(<UpdateSheetDownload savedProducts={products} disabled={false} />);
  assert.match(html, /All saved products \(2\)/);
  assert.match(html, /Choose products/);
  assert.match(html.match(/<input[^>]*data-testid="radio-scope-all"[^>]*>/)![0], /checked=""/);
  assert.match(html.match(/<input[^>]*data-testid="radio-values-current"[^>]*>/)![0], /checked=""/);
  assert.doesNotMatch(html.match(/<input[^>]*data-testid="radio-values-blank"[^>]*>/)![0], /checked=""/);
  assert.match(html, /Blank update sheet/);
  assert.match(html, /Download 2 products/);
  assert.doesNotMatch(html, /disabled=""[^>]*data-testid="button-download-update-sheet"/);
  assert.doesNotMatch(html, /Batch \d/);
  assert.match(html, /Excel \(.xlsx\)/);
  assert.match(html, /CSV \(.csv\)/);
  assert.match(html, /Select all fields/);
  assert.match(html, /Unsaved editor changes are not included/);
  assert.match(html, /Blank cells never delete/);
  assert.match(html, /original-values column/);
  assert.match(html, /JusticeSure approval/);
  assert.match(html, /stock and release controls are never imported/);
  assert.match(html, /one file/);
  assert.match(html, /first matching worksheet only/);
});

test("product chooser markup has labelled search, list and controls", () => {
  // Chooser renders when scope is choose; verify via the radio label and absence by default.
  const html = renderToStaticMarkup(<UpdateSheetDownload savedProducts={products} disabled={false} />);
  assert.doesNotMatch(html, /data-testid="product-chooser"/);
  assert.match(html, /data-testid="radio-scope-choose"/);
  assert.match(html, /data-testid="button-clear-fields"/);
});

test("empty and disabled states block downloading", () => {
  const empty = renderToStaticMarkup(<UpdateSheetDownload savedProducts={[]} disabled={false} />);
  assert.match(empty, /No saved products to download/);
  assert.match(empty, /role="alert"/);
  assert.match(empty, /disabled=""[^>]*data-testid="button-download-update-sheet"/);
  const off = renderToStaticMarkup(<UpdateSheetDownload savedProducts={products} disabled />);
  assert.match(off, /fieldset disabled=""/);
  assert.match(off, /disabled=""[^>]*data-testid="button-download-update-sheet"/);
});
