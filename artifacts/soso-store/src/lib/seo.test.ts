import test from "node:test";
import assert from "node:assert/strict";
import { canonicalSiteOrigin } from "./seo";

test("canonical site origin accepts only approved SOSO hosts and uses apex", () => {
  assert.equal(canonicalSiteOrigin("https://shopsoso.co"), "https://shopsoso.co");
  assert.equal(canonicalSiteOrigin("https://www.shopsoso.co/"), "https://shopsoso.co");
  assert.equal(canonicalSiteOrigin("https://preview.shopsoso.co"), "");
  assert.equal(canonicalSiteOrigin("https://shopsoso.co.evil.example"), "");
  assert.equal(canonicalSiteOrigin("http://shopsoso.co"), "");
  assert.equal(canonicalSiteOrigin("javascript:alert(1)"), "");
});