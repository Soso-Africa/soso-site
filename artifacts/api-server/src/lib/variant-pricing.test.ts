import assert from "node:assert/strict";
import test from "node:test";
import { catalogueProductHash, localMappingHash, validateCatalogueMappings } from "./catalogue-mapping";
import { resolveAuthoritativeCheckoutItems } from "./measurements";
import type { JusticeSureCatalogProduct } from "./justicesureCommerce";
import { DEFAULT_PLATFORM_CONTENT, PlatformContentSchema } from "./platform-content";

const remote: JusticeSureCatalogProduct = {
  id: "parent", name: "Priced Wear", description: null, images: [], currency: "NGN",
  amountKobo: 100_000, inStock: true,
  variants: [
    { id: "small", name: "S", label: "S", attributes: { size: "S" }, amountKobo: 100_000, inStock: true },
    { id: "medium", name: "M", label: "M", attributes: { size: "M" }, amountKobo: 150_000, inStock: true },
    { id: "custom", name: "Custom", label: "Custom", attributes: { size: "Custom" }, amountKobo: 220_000, inStock: true },
  ],
};
const identity = {
  slug: "priced-wear", name: remote.name, price: 1000,
  eligibility: { standard: true, custom: true }, standardSizes: ["S", "M"],
  commerceProductId: remote.id, commerceVariantIds: { S: "small", M: "medium", Custom: "custom" },
  variantPrices: { S: 1000, M: 1500, Custom: 2200 },
};
const storefront = {
  ...identity, standardEligible: true, customEligible: true,
  fulfilmentState: "made_immediately" as const,
  commerceMappingConfirmation: { productHash: catalogueProductHash(remote), localHash: localMappingHash(identity), confidence: 97 },
  colourOptions: [{ id: "white", label: "White", hex: "#FFFFFF" }], allowCustomColour: false,
};
const item = {
  productId: remote.id, variantId: "medium", quantity: 2, selectedSize: "M",
  selectedColourId: "white", selectedColourLabel: "White", selectedColourHex: "#FFFFFF",
};

test("different size and Custom prices match the exact mapped JusticeSure variants", () => {
  const validation = validateCatalogueMappings([identity], [remote]);
  assert.deepEqual(validation.issues, []);
  assert.equal(validation.mappings[0]?.status, "matched");
  assert.equal(validation.mappings[0]?.localHash, localMappingHash(identity));
});

test("wrong size prices block confirmation; edits invalidate the existing local fingerprint", () => {
  const edited = { ...identity, variantPrices: { ...identity.variantPrices, M: 1499 } };
  assert.notEqual(localMappingHash(edited), localMappingHash(identity));
  assert.equal(validateCatalogueMappings([edited], [remote]).issues[0]?.code, "price_mismatch");
  assert.equal(resolveAuthoritativeCheckoutItems([item], [remote], [{ ...storefront, variantPrices: edited.variantPrices }]), null);
});

test("checkout snapshots the selected variant price, never its parent price", () => {
  assert.equal(resolveAuthoritativeCheckoutItems([item], [remote], [storefront])?.[0]?.unitPriceKobo, 150_000);
  assert.equal(resolveAuthoritativeCheckoutItems([{ ...item, selectedSize: "Custom", variantId: "custom" }], [remote], [storefront])?.[0]?.unitPriceKobo, 220_000);
  assert.equal(resolveAuthoritativeCheckoutItems([{ ...item, selectedSize: "S", variantId: "small" }], [remote], [storefront])?.[0]?.unitPriceKobo, 100_000);
});

test("freshly hashed but incorrect local prices still cannot pass authoritative checkout", () => {
  const edited = { ...identity, variantPrices: { ...identity.variantPrices, M: 500 } };
  const forged = { ...storefront, variantPrices: edited.variantPrices,
    commerceMappingConfirmation: { ...storefront.commerceMappingConfirmation, localHash: localMappingHash(edited) } };
  assert.equal(resolveAuthoritativeCheckoutItems([item], [remote], [forged]), null);
});

test("legacy single-price confirmations retain the same fingerprint when prices are unset", () => {
  const { variantPrices: _prices, ...legacy } = identity;
  assert.equal(localMappingHash(legacy), localMappingHash({ ...legacy, variantPrices: {} }));
  const singlePrice = { ...remote, variants: remote.variants.map((variant) => ({ ...variant, amountKobo: remote.amountKobo })) };
  assert.deepEqual(validateCatalogueMappings([legacy], [singlePrice]).issues, []);
});

test("publication schema accepts valid size amounts but rejects orphan prices and fractional kobo", () => {
  const content = structuredClone(DEFAULT_PLATFORM_CONTENT);
  const product = content.products.find((candidate) => candidate.standardEligible && candidate.standardSizes.length)!;
  const choice = product.standardSizes[0]!;
  product.variantPrices = { [choice]: product.price + 0.01 };
  assert.equal(PlatformContentSchema.safeParse(content).success, true);
  product.variantPrices = { "not-an-eligible-size": 100 };
  assert.equal(PlatformContentSchema.safeParse(content).success, false);
  product.variantPrices = { [choice]: 100.001 };
  assert.equal(PlatformContentSchema.safeParse(content).success, false);
});
