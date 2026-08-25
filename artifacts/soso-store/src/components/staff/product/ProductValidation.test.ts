import { describe, it } from "node:test";
import * as assert from "node:assert";
import { validateProduct } from "./ProductValidation";
import { handleToggleCustomEligible, handleUpdateAvailableSizes, handleUpdateFulfilmentState, handleUpdateStandardSizes } from "./ProductTransitions";
import type { CatalogProduct } from "../../../data/platformContent";

const mockBaseProduct: CatalogProduct = {
  slug: "test-product",
  name: "Test Product",
  price: 100,
  category: "tops",
  colour: "Black",
  fabric: "Cotton",
  fit: "Regular",
  tag: "",
  note: "",
  description: "Test description",
  sizes: ["S", "M"],
  searchableTerms: [],
  merchandising: { isNew: true, sortPriority: 1 },
  standardEligible: true,
  customEligible: false,
  standardSizes: ["S", "M"],
  readyNowSizes: [],
  fulfilmentState: "made_immediately",
  dispatchMessage: "Dispatched in 2 weeks",
  img: "/test.jpg",
  images: [{ src: "/test.jpg", alt: "Test", provenance: { source: "SOSO", rights: "Owned" } }]
};

describe("ProductValidation", () => {
  it("validates missing required base fields", () => {
    const product = { ...mockBaseProduct, slug: "", name: "" };
    const errors = validateProduct(product, []);
    assert.strictEqual(errors.some(e => e.includes("Slug is required")), true);
    assert.strictEqual(errors.some(e => e.includes("Name is required")), true);
  });

  it("validates readyNowSizes subset rule", () => {
    const product = { ...mockBaseProduct, readyNowSizes: ["L"] };
    const errors = validateProduct(product, []);
    assert.strictEqual(errors.some(e => e.includes("Ready-now size L must be a Standard size")), true);
  });

  it("validates unavailable messaging rules", () => {
    const product: CatalogProduct = { 
      ...mockBaseProduct, 
      fulfilmentState: "unavailable", 
      readyNowSizes: ["S"],
      unavailableMessage: undefined 
    };
    const errors = validateProduct(product, []);
    assert.strictEqual(errors.some(e => e.includes("Unavailable products cannot advertise ready-now sizes")), true);
    assert.strictEqual(errors.some(e => e.includes("Unavailable products require an unavailable message")), true);
  });

  it("validates UUID and commerce variants", () => {
    const product: CatalogProduct = {
      ...mockBaseProduct,
      commerceProductId: "invalid-uuid",
      commerceVariantIds: { "S": "invalid-uuid" }
    };
    const errors = validateProduct(product, []);
    assert.strictEqual(errors.some(e => e.includes("Commerce Product ID must be a valid UUID")), true);
    assert.strictEqual(errors.some(e => e.includes("Commerce variant ID for S is not a valid UUID")), true);
  });

  it("validates unknown categories, duplicate slugs, primary images, and provenance URLs", () => {
    const product: CatalogProduct = {
      ...mockBaseProduct,
      images: [{ ...mockBaseProduct.images![0], provenance: { source: "SOSO", rights: "Owned", sourceUrl: "javascript:bad" } }],
      img: "/missing.jpg",
    };
    const errors = validateProduct(product, [product, { slug: product.slug }], ["dresses"]);
    assert.strictEqual(errors.some(e => e.includes("Duplicate product slug")), true);
    assert.strictEqual(errors.some(e => e.includes("Category is not represented")), true);
    assert.strictEqual(errors.some(e => e.includes("internal path or HTTPS")), true);
    assert.strictEqual(errors.some(e => e.includes("Primary image")), true);
  });

  it("requires a selectable size even when the product is unavailable", () => {
    const product: CatalogProduct = {
      ...mockBaseProduct,
      sizes: [],
      standardEligible: false,
      standardSizes: [],
      fulfilmentState: "unavailable",
      unavailableMessage: "Temporarily unavailable",
    };
    assert.strictEqual(validateProduct(product, [product]).some(e => e.includes("At least one selectable size")), true);
  });

  it("matches server provenance source-link rules", () => {
    for (const sourceUrl of ["/staff-media/source", "https://example.com/source"]) {
      const product: CatalogProduct = {
        ...mockBaseProduct,
        images: [{ ...mockBaseProduct.images![0], provenance: { source: "SOSO", rights: "Owned", sourceUrl } }],
      };
      assert.strictEqual(validateProduct(product, [product]).some(e => e.includes("provenance source URL")), false);
    }
    for (const sourceUrl of ["//example.com/source", "http://example.com/source"]) {
      const product: CatalogProduct = {
        ...mockBaseProduct,
        images: [{ ...mockBaseProduct.images![0], provenance: { source: "SOSO", rights: "Owned", sourceUrl } }],
      };
      assert.strictEqual(validateProduct(product, [product]).some(e => e.includes("provenance source URL")), true);
    }
  });
});

describe("ProductTransitions", () => {
  it("handleToggleCustomEligible cancels on negative confirm", () => {
    const product = { ...mockBaseProduct, customEligible: true, commerceVariantIds: { "Custom": "uuid" } };
    const result = handleToggleCustomEligible(product, false, () => false);
    assert.strictEqual(result, null);
  });

  it("handleToggleCustomEligible removes Custom size and variant on success", () => {
    const product = { ...mockBaseProduct, sizes: ["S", "Custom"], customEligible: true, commerceVariantIds: { "Custom": "uuid", "S": "uuid2" } };
    const result = handleToggleCustomEligible(product, false, () => true);
    assert.strictEqual(result?.sizes.includes("Custom"), false);
    assert.strictEqual(result?.commerceVariantIds?.["Custom"], undefined);
    assert.strictEqual(result?.commerceVariantIds?.["S"], "uuid2");
  });

  it("handleUpdateStandardSizes clears readyNowSizes when unchecked", () => {
    const product = { ...mockBaseProduct, standardSizes: ["S", "M"], readyNowSizes: ["S", "M"], commerceVariantIds: { "S": "uuid" } };
    const result = handleUpdateStandardSizes(product, "S", false, () => true);
    assert.deepStrictEqual(result?.standardSizes, ["M"]);
    assert.deepStrictEqual(result?.readyNowSizes, ["M"]);
    assert.strictEqual(result?.commerceVariantIds?.["S"], undefined);
  });

  it("handleUpdateAvailableSizes warns and clears nested standard info", () => {
    const product = { ...mockBaseProduct, sizes: ["S", "M"], standardSizes: ["S", "M"], readyNowSizes: ["S"] };
    let confirmCalled = false;
    const result = handleUpdateAvailableSizes(product, ["M"], () => { confirmCalled = true; return true; });
    assert.strictEqual(confirmCalled, true);
    assert.deepStrictEqual(result?.sizes, ["M"]);
    assert.deepStrictEqual(result?.standardSizes, ["M"]);
    assert.deepStrictEqual(result?.readyNowSizes, []);
  });

  it("handleUpdateFulfilmentState preserves state when destructive cleanup is cancelled", () => {
    const product = { ...mockBaseProduct, fulfilmentState: "ready_now" as const, readyNowSizes: ["S"] };
    const result = handleUpdateFulfilmentState(product, "unavailable", () => false);
    assert.strictEqual(result, null);
  });

  it("handleUpdateFulfilmentState clears incompatible fulfilment fields after confirmation", () => {
    const readyProduct = { ...mockBaseProduct, fulfilmentState: "ready_now" as const, readyNowSizes: ["S"] };
    assert.deepStrictEqual(handleUpdateFulfilmentState(readyProduct, "unavailable", () => true)?.readyNowSizes, []);

    const unavailableProduct = { ...mockBaseProduct, fulfilmentState: "unavailable" as const, unavailableMessage: "Not available" };
    assert.strictEqual(handleUpdateFulfilmentState(unavailableProduct, "made_immediately", () => true)?.unavailableMessage, undefined);
  });
});
