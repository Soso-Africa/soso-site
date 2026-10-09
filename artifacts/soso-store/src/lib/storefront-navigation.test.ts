import assert from "node:assert/strict";
import { test } from "node:test";
import { isImmediateStorefrontRoute } from "./storefront-navigation";
import { responsiveProductPhoto } from "./responsive-product-photo";
import { normalizeStorefrontTitle } from "../../../../lib/api-zod/src/brand-titles";

test("normal storefront routes never wait for redirect resolution", () => {
  for (const path of ["/", "/shop", "/product/ivory-agbada", "/collections/kaftans", "/checkout/return", "/privacy", "/staff"])
    assert.equal(isImmediateStorefrontRoute(path), true, path);
  assert.equal(isImmediateStorefrontRoute("/old-unknown-wordpress-page"), false);
});
test("responsive photos preserve source identity and leave animation alone", () => {
  const original = "/api/storage/objects/uploads/photo.jpg";
  const props = responsiveProductPhoto(original);
  assert.ok(props.srcSet?.includes(`${original}?w=480 480w`));
  assert.ok(props.srcSet?.includes(`${original}?w=1600 1600w`));
  assert.deepEqual(responsiveProductPhoto("/images/photo.jpg"), {});
  assert.deepEqual(responsiveProductPhoto("/api/storage/objects/uploads/animation.gif"), {});
});
test("African brand title replaces only the former generic default", () => {
  assert.equal(normalizeStorefrontTitle("SOSO Africa | Premium Nigerian Menswear"), "SOSO Africa | Premium African Fashion");
  assert.equal(normalizeStorefrontTitle("SOSO Africa | Premium Nigerian Fashion"), "SOSO Africa | Premium African Fashion");
  assert.equal(normalizeStorefrontTitle("Ivory Agbada | SOSO Africa"), "Ivory Agbada | SOSO Africa");
  assert.equal(normalizeStorefrontTitle("Merchant custom homepage"), "Merchant custom homepage");
});
