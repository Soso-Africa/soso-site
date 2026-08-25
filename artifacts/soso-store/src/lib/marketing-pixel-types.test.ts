import assert from "node:assert/strict";
import test from "node:test";
import { mapMarketingEvent } from "./marketing-pixel-types.ts";

test("maps only the four approved storefront events", () => {
  assert.equal(mapMarketingEvent("session_started"), null);
  assert.equal(mapMarketingEvent("cta_clicked"), null);
  assert.deepEqual(mapMarketingEvent("page_view"), { name: "page_view", payload: {} });
});

test("builds payloads from the explicit commerce allowlist", () => {
  const mapped = mapMarketingEvent("add_to_bag", {
    commerceProductId: "product-1",
    productSlug: "fallback",
    itemIds: ["variant-1"],
    value: 12500,
    currency: "NGN",
    quantity: 1,
    itemCount: 1,
    name: "Private name",
    email: "private@example.com",
    phone: "123",
    address: "Private address",
    notes: "free text",
    referrer: "https://example.com",
    utmCampaign: "campaign",
    selectedSize: "Custom",
    arbitrary: { nested: true },
  });

  assert.deepEqual(mapped, {
    name: "add_to_bag",
    payload: {
      itemIds: ["variant-1"],
      value: 12500,
      currency: "NGN",
      quantity: 1,
      itemCount: 1,
    },
  });
  assert.equal(JSON.stringify(mapped).includes("private"), false);
  assert.equal(JSON.stringify(mapped).includes("Custom"), false);
});

test("uses commerce product ID before slug and rejects malformed values", () => {
  assert.deepEqual(mapMarketingEvent("product_view", {
    commerceProductId: "commerce-id",
    productSlug: "slug",
    value: Number.NaN,
    currency: "USD",
    quantity: 0,
  }), {
    name: "product_view",
    payload: { itemIds: ["commerce-id"] },
  });
});