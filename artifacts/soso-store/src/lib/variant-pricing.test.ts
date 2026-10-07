import assert from "node:assert/strict";
import test from "node:test";
import type { CatalogProduct } from "../data/platformContent";
import { changeCartLineSelection, productPriceRange, purchaseChoicePrice } from "./purchasing";
import { handleToggleCustomEligible, handleToggleStandardEligible, handleUpdateStandardSizes } from "../components/staff/product/ProductTransitions";
import { refreshLinkedVariantPrices, VariantPricingEditor } from "../components/staff/product/VariantPricingEditor";

const product = {
  price: 1000, standardEligible: true, customEligible: true,
  sizes: ["S", "M", "Custom"], standardSizes: ["S", "M"], readyNowSizes: [],
  variantPrices: { S: 1000, M: 1500, Custom: 2200 },
  commerceProductId: "parent", commerceVariantIds: { S: "small", M: "medium", Custom: "custom" },
} as unknown as CatalogProduct;

test("size price and browsing range include the actual Custom and standard prices", () => {
  assert.equal(purchaseChoicePrice(product, "M"), 1500);
  assert.equal(purchaseChoicePrice(product, "Custom"), 2200);
  assert.deepEqual(productPriceRange(product), { min: 1000, max: 2200 });
  assert.equal(purchaseChoicePrice({ ...product, variantPrices: undefined }, "M"), 1000);
});

test("cart size switches reprice the line and merging retains the correct unit price", () => {
  const small = { slug: "wear", size: "S", selectedColourId: "white", quantity: 2, commerceProductId: "parent", commerceVariantId: "small", price: 1000 };
  const switched = changeCartLineSelection([small], "wear", "S", "M", "medium", "white", undefined, 1500);
  assert.equal(switched[0]?.price, 1500);
  assert.equal(switched[0]?.commerceVariantId, "medium");
  const medium = { ...small, size: "M", quantity: 1, commerceVariantId: "medium", price: 1500 };
  const merged = changeCartLineSelection([small, medium], "wear", "S", "M", "medium", "white", undefined, 1500);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.quantity, 3);
  assert.equal(merged[0]?.price, 1500);
});

test("removing an eligible choice clears only its own price, not other size prices", () => {
  assert.deepEqual(handleUpdateStandardSizes(product, "M", false, () => true)?.variantPrices, { S: 1000, Custom: 2200 });
  assert.deepEqual(handleToggleCustomEligible(product, false, () => true)?.variantPrices, { S: 1000, M: 1500 });
  assert.deepEqual(handleToggleStandardEligible(product, false, () => true)?.variantPrices, { Custom: 2200 });
});

test("refresh copies different provider amounts without dropping the parent, variant links or colours", () => {
  const remote = { amountKobo: 4000000, variants: [
    { id: "small", amountKobo: 2500000 }, { id: "medium", amountKobo: 3500000 }, { id: "custom", amountKobo: 6000000 },
  ] };
  const refreshed = refreshLinkedVariantPrices(product, remote);
  assert.equal(refreshed.price, 40000);
  assert.deepEqual(refreshed.variantPrices, { S: 25000, M: 35000, Custom: 60000 });
  assert.equal(refreshed.commerceProductId, product.commerceProductId);
  assert.deepEqual(refreshed.commerceVariantIds, product.commerceVariantIds);
  assert.equal(refreshed.colourOptions, product.colourOptions);
});

function control(node: any, id: string): any {
  if (!node) return undefined;
  if (Array.isArray(node)) return node.map((child) => control(child, id)).find(Boolean);
  if (node.props?.["data-testid"] === id) return node.props;
  return control(node.props?.children, id);
}

test("the real price input and refresh handlers preserve the selected JusticeSure link", () => {
  let current = { ...product, slug: "wear" };
  const remote = { amountKobo: 4000000, variants: [
    { id: "small", amountKobo: 2500000 }, { id: "medium", amountKobo: 3500000 }, { id: "custom", amountKobo: 6000000 },
  ] };
  const render = () => VariantPricingEditor({ product: current, remote, onChange: (next) => { current = next; } });
  control(render(), "input-variant-price-wear-M").onChange({ target: { value: "37000" } });
  assert.equal(current.variantPrices?.M, 37000);
  assert.equal(current.commerceProductId, "parent");
  assert.equal(current.commerceVariantIds?.M, "medium");
  const refresh = control(render(), "button-sync-variant-prices-wear");
  assert.equal(refresh.disabled, false);
  refresh.onClick();
  assert.equal(current.variantPrices?.M, 35000);
  assert.equal(current.commerceProductId, "parent");
  assert.equal(current.commerceVariantIds?.M, "medium");
});
