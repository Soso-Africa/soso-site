import assert from "node:assert/strict";
import test from "node:test";
import {
  canConfirmMapping,
  isConfirmedMappingCurrent,
  isMappingPreviewFreshForReview,
} from "./mapping-staleness";

const suggestion = {
  slug: "royal-agbada",
  status: "confident" as const,
  confidence: 97,
  evidence: [],
  productId: "product-a",
  productHash: "remote-hash",
  localHash: "local-hash",
  variantIds: {},
  choiceLabels: {},
  issues: [],
};

const product = {
  commerceMappingConfirmation: {
    productHash: "remote-hash",
    localHash: "local-hash",
  },
};

test("a webhook-stale mapping is not represented as current and can be reconfirmed", () => {
  assert.equal(isConfirmedMappingCurrent(product as never, suggestion, false), true);
  assert.equal(isConfirmedMappingCurrent(product as never, suggestion, true), false);
  assert.equal(canConfirmMapping(product as never, suggestion, true), true);
});

test("a preview from before the webhook alert cannot be used for reconfirmation", () => {
  assert.equal(isMappingPreviewFreshForReview(4, 5), false);
  assert.equal(isMappingPreviewFreshForReview(5, 5), true);
});