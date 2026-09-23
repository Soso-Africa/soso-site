import assert from "node:assert/strict";
import test from "node:test";
import type { JusticeSureCatalogProduct } from "./justicesureCommerce.js";
import {
  findWebhookStaleMappings,
  buildCatalogueSnapshot,
  localMappingHash,
  suggestCatalogueMappings,
  validateCatalogueMappings,
  type LocalCatalogueProduct,
} from "./catalogue-mapping.js";

test("catalogue webhook invalidations affect only newer matching confirmed mappings", () => {
  const confirmedAt = new Date("2030-01-01T00:00:00.000Z");
  const mappings = [
    { slug: "agbada", productId: "product-a", variantIds: ["variant-a"], confirmedAt },
    { slug: "kaftan", productId: "product-b", variantIds: ["variant-b"], confirmedAt },
  ];
  assert.deepEqual(findWebhookStaleMappings(mappings, [
    { identifiers: ["variant-a"], occurredAt: new Date("2030-01-01T00:00:01.000Z") },
    { identifiers: ["product-b"], occurredAt: new Date("2029-12-31T23:59:59.000Z") },
    { identifiers: ["unrelated"], occurredAt: new Date("2030-01-01T00:00:02.000Z") },
  ]), ["agbada"]);
});

const variants = (stock = true) => ["S", "M", "L", "XL", "XXL"].map((size, index) => ({
  id: `variant-${index}`, name: size, label: size, attributes: { size }, amountKobo: 125000, inStock: stock,
}));
const catalog: JusticeSureCatalogProduct[] = Array.from({ length: 20 }, (_, index) => ({
  id: `product-${index}`, name: `Atelier Look ${index}`, description: null, images: [], amountKobo: 125000,
  inStock: true, variants: variants(),
}));
const locals: LocalCatalogueProduct[] = catalog.map((product) => ({
  slug: product.id, name: product.name, price: 1250, eligibility: "standard", standardSizes: ["S", "M", "L", "XL", "XXL"],
}));

test("maps a representative catalogue safely with high confidence", () => {
  const mappings = suggestCatalogueMappings(locals, catalog);
  assert.equal(mappings.filter((mapping) => mapping.status === "matched" && mapping.confidence >= 95).length, 20);
  assert.equal(validateCatalogueMappings(locals, catalog).issues.length, 0);
});

test("refuses duplicate normalized product names", () => {
  const duplicate = [...catalog, { ...catalog[0]!, id: "other", name: "ATELIER-LOOK 0" }];
  const mapping = suggestCatalogueMappings([locals[0]!], duplicate)[0]!;
  assert.equal(mapping.status, "ambiguous");
  assert.equal(mapping.productId, undefined);
});

test("rejects an existing product ID when the normalized product name differs", () => {
  const mapping = suggestCatalogueMappings([{
    ...locals[0]!,
    name: "Different garment",
    commerceProductId: catalog[0]!.id,
  }], catalog)[0]!;
  assert.equal(mapping.status, "unsafe");
  assert.match(mapping.evidence.join(" "), /different normalized name/i);
});

test("uses controlled size aliases and Custom", () => {
  const customCatalog = [{ ...catalog[0]!, variants: [
    { id: "small", name: "small", label: "Small", attributes: { size: "small" }, amountKobo: 125000, inStock: true },
    { id: "made", name: "made-to-measure", label: "Made to Measure", attributes: { size: "Custom" }, amountKobo: 125000, inStock: true },
  ] }];
  const mapping = suggestCatalogueMappings([{
    ...locals[0]!, eligibility: "custom", standardSizes: ["S"],
  }], customCatalog)[0]!;
  assert.equal(mapping.status, "matched");
  assert.deepEqual(mapping.variantIds, { S: "small", Custom: "made" });
});

test("does not treat unrelated variant attributes as size evidence", () => {
  const misleading = [{
    ...catalog[0]!,
    variants: [{
      id: "misleading",
      name: "Blue edition",
      label: "Blue edition",
      attributes: { colorOption: "S", productType: "Small" },
      amountKobo: 125000,
      inStock: true,
    }],
  }];
  assert.equal(suggestCatalogueMappings([{
    ...locals[0]!,
    standardSizes: ["S"],
  }], misleading)[0]!.status, "unsafe");
});

test("rejects duplicate variants, parent mismatch, stock, and price drift", () => {
  const duplicateVariant = [{ ...catalog[0]!, variants: [
    { ...catalog[0]!.variants[0]!, id: "a" }, { ...catalog[0]!.variants[0]!, id: "b" },
  ] }];
  assert.equal(suggestCatalogueMappings([{ ...locals[0]!, standardSizes: ["S", "small"] }], duplicateVariant)[0]!.status, "ambiguous");
  assert.equal(suggestCatalogueMappings([{ ...locals[0]!, commerceProductId: "wrong" }], catalog)[0]!.status, "unmatched");
  assert.equal(suggestCatalogueMappings([{ ...locals[0]!, price: 1251 }], catalog)[0]!.status, "unsafe");
  const out = [{ ...catalog[0]!, inStock: false }];
  assert.equal(suggestCatalogueMappings([locals[0]!], out)[0]!.status, "unsafe");
});

test("hashes are deterministic and independent of catalogue order or fetched time", () => {
  const first = buildCatalogueSnapshot(catalog, new Date("2026-01-01T00:00:00.000Z"));
  const second = buildCatalogueSnapshot([...catalog].reverse().map((product) => ({
    ...product,
    variants: [...product.variants].reverse(),
  })), new Date("2026-02-01T00:00:00.000Z"));
  assert.equal(first.hash, second.hash);
  assert.deepEqual(first.products, second.products);
  assert.notEqual(first.fetchedAt, second.fetchedAt);
  assert.equal(first.hash, buildCatalogueSnapshot(catalog.map((product) => ({ ...product, inStock: product.inStock }))).hash);
});

test("local mapping hashes change with SOSO identity, eligibility, choices, and identifiers", () => {
  const base = { ...locals[0]!, commerceProductId: catalog[0]!.id, commerceVariantIds: { S: "variant-0" } };
  const first = localMappingHash(base);
  assert.notEqual(first, localMappingHash({ ...base, name: "Changed name" }));
  assert.notEqual(first, localMappingHash({ ...base, standardSizes: ["M"] }));
  assert.notEqual(first, localMappingHash({ ...base, commerceVariantIds: { S: "variant-1" } }));
});