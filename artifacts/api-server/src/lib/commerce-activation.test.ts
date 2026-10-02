import assert from "node:assert/strict";
import { test } from "node:test";
import { activationEnabledValue, isNigerianCountry, matchesPlatformPrice } from "./commerce-activation";

test("only an absent activation row receives the legacy enabled default", () => {
  assert.equal(activationEnabledValue(false, undefined), true);
  assert.equal(activationEnabledValue(true, true), true);
  assert.equal(activationEnabledValue(true, false), false);
  assert.equal(activationEnabledValue(true, "true"), false);
  assert.equal(activationEnabledValue(true, null), false);
});

test("pickup readiness accepts Nigeria's NG country-code and country-name forms only", () => {
  assert.equal(isNigerianCountry("NG"), true);
  assert.equal(isNigerianCountry("Nigeria"), true);
  assert.equal(isNigerianCountry(" nigeria "), true);
  assert.equal(isNigerianCountry("GH"), false);
  assert.equal(isNigerianCountry("Ghana"), false);
  assert.equal(isNigerianCountry(null), false);
});

test("catalogue product and variant prices must equal the published NGN price in kobo", () => {
  assert.equal(matchesPlatformPrice(12_500, 1_250_000), true);
  assert.equal(matchesPlatformPrice(12_500, 1_249_999), false);
  assert.equal(matchesPlatformPrice(12_500, 1_250_001), false);
});