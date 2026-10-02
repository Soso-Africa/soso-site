import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PLATFORM_CONTENT } from "./platform-content";
import {
  productBusinessFingerprint,
  validBusinessApprovalSlugs,
} from "./catalogue-business-approvals";

test("business approvals expire when product content or mapping identity changes, but not on mapping verification timestamps", () => {
  const product = structuredClone(DEFAULT_PLATFORM_CONTENT.products[0]!);
  product.commerceMappingConfirmation = {
    productHash: "a".repeat(64),
    localHash: "b".repeat(64),
    snapshotHash: "c".repeat(64),
    snapshotFetchedAt: "2026-01-01T00:00:00.000Z",
    confirmedAt: "2026-01-01T00:00:00.000Z",
    confidence: 99,
    source: "manual",
    evidence: ["Current mapping reviewed"],
    choiceLabels: {},
  };
  const fingerprint = productBusinessFingerprint(product);
  const ledger = {
    version: 1,
    approvals: {
      [product.slug]: {
        fingerprint,
        actorClerkUserId: "owner-test",
        approvedAt: "2026-01-01T00:00:00.000Z",
      },
    },
  };
  const content = { ...structuredClone(DEFAULT_PLATFORM_CONTENT), products: [product] };
  assert.deepEqual([...validBusinessApprovalSlugs(content, ledger)], [product.slug]);

  const refreshed = structuredClone(product);
  refreshed.commerceMappingConfirmation!.confirmedAt = "2026-02-01T00:00:00.000Z";
  refreshed.commerceMappingConfirmation!.snapshotFetchedAt = "2026-02-01T00:00:00.000Z";
  assert.equal(productBusinessFingerprint(refreshed), fingerprint);

  const edited = structuredClone(product);
  edited.name = `${edited.name} edited`;
  assert.deepEqual([...validBusinessApprovalSlugs({ ...content, products: [edited] }, ledger)], []);
  const remapped = structuredClone(product);
  remapped.commerceProductId = "00000000-0000-4000-8000-000000000001";
  assert.deepEqual([...validBusinessApprovalSlugs({ ...content, products: [remapped] }, ledger)], []);
});