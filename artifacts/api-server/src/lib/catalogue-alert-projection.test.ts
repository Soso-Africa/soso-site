import assert from "node:assert/strict";
import test from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { CatalogueAlertProductsSchema, catalogueAlertProjection, findStaleProjectedProducts } from "./catalogue-alert-projection";

const productId = "bfe4f10a-0b02-4d2c-8e35-c46d66384389";
const variantId = "53dc4e91-a2b7-43d3-8ccf-174e2f4661bc";
const product = {
  slug: "test-product",
  name: "Test product",
  productId,
  variantIds: { Small: variantId },
  confirmedAt: "2026-10-01T12:00:00.000Z",
};

test("minimal projection preserves product and variant invalidation matching", () => {
  for (const identifier of [productId, variantId]) {
    const result = findStaleProjectedProducts([product], [{
      identifiers: [identifier], occurredAt: new Date("2026-10-01T12:00:01Z"),
    }]);
    assert.deepEqual(result, [{ slug: product.slug, name: product.name }]);
  }
});

test("old, equal-time and unrelated catalogue changes do not invalidate mappings", () => {
  for (const occurredAt of ["2026-10-01T11:00:00Z", product.confirmedAt]) {
    assert.deepEqual(findStaleProjectedProducts([product], [{ identifiers: [productId], occurredAt: new Date(occurredAt) }]), []);
  }
  assert.deepEqual(findStaleProjectedProducts([product], [{
    identifiers: ["unrelated"], occurredAt: new Date("2026-10-01T13:00:00Z"),
  }]), []);
});

test("malformed confirmations are rejected rather than treated as a clean catalogue", () => {
  assert.equal(CatalogueAlertProductsSchema.safeParse([{ ...product, confirmedAt: "invalid" }]).success, false);
  assert.equal(CatalogueAlertProductsSchema.safeParse([{ ...product, productId: "invalid" }]).success, false);
  assert.equal(CatalogueAlertProductsSchema.safeParse([]).success, true);
});

test("DB projection contains only alert fields, not full draft/published content", () => {
  const statement = new PgDialect().sqlToQuery(catalogueAlertProjection).sql;
  assert.match(statement, /jsonb_build_object/);
  assert.match(statement, /confirmedAt/);
  assert.doesNotMatch(statement, /published|images|description|productHash|evidence/);
});