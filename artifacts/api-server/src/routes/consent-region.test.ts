import assert from "node:assert/strict";
import test from "node:test";
import {
  canRecordRegionDefaultConsent,
  classifyConsentRegion,
  trustedCountryCode,
} from "./consent-region";

test("Nigeria receives the non-regulated automatic analytics decision", () => {
  assert.deepEqual(classifyConsentRegion({ "x-vercel-ip-country": "NG" }), {
    countryCode: "NG",
    region: "non_regulated",
    consentRequired: false,
  });
});

test("EU, EEA, and UK visitors require an explicit consent decision", () => {
  for (const countryCode of ["DE", "FR", "IE", "NO", "IS", "LI", "GB"]) {
    assert.equal(classifyConsentRegion({ "x-vercel-ip-country": countryCode }).consentRequired, true);
    assert.equal(classifyConsentRegion({ "x-vercel-ip-country": countryCode }).region, "regulated");
  }
});

test("missing and invalid edge locations fail closed", () => {
  for (const headers of [
    {},
    { "x-vercel-ip-country": "unknown" },
    { "x-vercel-ip-country": "ZZ" },
    { "cf-ipcountry": "NG" },
  ]) {
    assert.deepEqual(classifyConsentRegion(headers), {
      countryCode: null,
      region: "unknown",
      consentRequired: true,
    });
  }
});

test("only trusted edge headers can classify a visitor", () => {
  assert.equal(trustedCountryCode({ "x-country": "NG" }), null);
  assert.equal(trustedCountryCode({ "cf-ipcountry": "NG" }), null);
  assert.equal(trustedCountryCode({ "x-vercel-ip-country": "ng" }), "NG");
});

test("region defaults can enable analytics only, and only outside regulated regions", () => {
  const nigeria = classifyConsentRegion({ "x-vercel-ip-country": "NG" });
  const germany = classifyConsentRegion({ "x-vercel-ip-country": "DE" });
  assert.equal(canRecordRegionDefaultConsent("analytics", nigeria), true);
  assert.equal(canRecordRegionDefaultConsent("marketing", nigeria), false);
  assert.equal(canRecordRegionDefaultConsent("essential_only", nigeria), false);
  assert.equal(canRecordRegionDefaultConsent("analytics", germany), false);
});