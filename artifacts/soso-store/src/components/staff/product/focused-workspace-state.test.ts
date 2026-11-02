import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { CatalogProduct } from "../../../data/platformContent";
import {
  advanceSiblingVersions, applySaveConflict, applySaveSuccess, entryFromResponse, isEntryDirty, isVersionConflict,
  rebaseOntoLatest, relatedCandidates, shouldAcceptLoad, type ProductEditorResponse,
} from "./focused-workspace-state";

const product = { slug: "agbada-one", name: "Agbada One", price: 120000, relatedProductSlugs: ["kaftan-two"] } as unknown as CatalogProduct;
const response: ProductEditorResponse = {
  product, publishedProduct: null, collections: [], relatedProducts: [{ slug: "kaftan-two", name: "Kaftan Two" }],
  draftUpdatedAt: "2025-01-01T10:00:00.000Z", publishedAt: null,
};

describe("focused product workspace state", () => {
  test("fresh entry is clean and dirty after edit", () => {
    const entry = entryFromResponse("agbada-one", response);
    assert.equal(isEntryDirty(entry), false);
    assert.equal(isEntryDirty({ ...entry, local: { ...product, name: "Changed" } }), true);
  });

  test("stale or unrequested loads never overwrite an existing entry", () => {
    assert.equal(shouldAcceptLoad({ requestId: 1, latestRequestId: 2, hasEntry: false, explicitReplace: false }), false);
    assert.equal(shouldAcceptLoad({ requestId: 2, latestRequestId: 2, hasEntry: true, explicitReplace: false }), false);
    assert.equal(shouldAcceptLoad({ requestId: 2, latestRequestId: 2, hasEntry: true, explicitReplace: true }), true);
    assert.equal(shouldAcceptLoad({ requestId: 2, latestRequestId: 2, hasEntry: false, explicitReplace: false }), true);
  });

  test("save success keeps edits typed during the save", () => {
    const entry = entryFromResponse("agbada-one", response);
    const submitted = { ...product, name: "Saved name" };
    const during = { ...entry, local: { ...product, name: "Typed after save" } };
    const next = applySaveSuccess(during, submitted, { product: submitted, draftUpdatedAt: "2025-01-01T11:00:00.000Z", publishedAt: null });
    assert.equal(next.local.name, "Typed after save");
    assert.equal(next.base.name, "Saved name");
    assert.equal(next.draftUpdatedAt, "2025-01-01T11:00:00.000Z");
    assert.equal(isEntryDirty(next), true);
  });

  test("save success adopts the server product when nothing changed during the save", () => {
    const entry = { ...entryFromResponse("agbada-one", response), local: { ...product, name: "Saved" } };
    const next = applySaveSuccess(entry, entry.local, { product: entry.local, draftUpdatedAt: "v2", publishedAt: null });
    assert.equal(isEntryDirty(next), false);
  });

  test("own save advances only siblings fenced on the submitted version", () => {
    const a = entryFromResponse("a", { ...response, product: { ...product, slug: "a" }, draftUpdatedAt: "v1" });
    const b = { ...entryFromResponse("b", { ...response, product: { ...product, slug: "b" }, draftUpdatedAt: "v1" }), local: { ...product, slug: "b", name: "B edit" } };
    const c = entryFromResponse("c", { ...response, product: { ...product, slug: "c" }, draftUpdatedAt: "v0" });
    const next = advanceSiblingVersions({ a, b, c }, "a", "v1", "v2");
    assert.equal(next.b!.draftUpdatedAt, "v2");
    assert.equal(next.b!.local.name, "B edit");
    assert.equal(next.c!.draftUpdatedAt, "v0");
    assert.equal(next.a!.draftUpdatedAt, "v1");
    // Sequential own saves: B saved next uses v2, so C (still v0) must later conflict honestly.
    const after = advanceSiblingVersions(next, "b", "v2", "v3");
    assert.equal(after.c!.draftUpdatedAt, "v0");
  });

  test("conflict keeps local edits and the old expected version", () => {
    const entry = { ...entryFromResponse("agbada-one", response), local: { ...product, name: "Mine" } };
    const next = applySaveConflict(entry, "Someone else saved");
    assert.equal(next.local.name, "Mine");
    assert.equal(next.draftUpdatedAt, response.draftUpdatedAt);
    assert.equal(isVersionConflict({ status: 409 }), true);
    assert.equal(isVersionConflict(new Error("x")), false);
  });

  test("explicit rebase advances version only on request and keeps local edits", () => {
    const entry = { ...entryFromResponse("agbada-one", response), local: { ...product, name: "Mine" }, conflict: "c" };
    const next = rebaseOntoLatest(entry, { ...response, product: { ...product, name: "Theirs" }, draftUpdatedAt: "v3" });
    assert.equal(next.local.name, "Mine");
    assert.equal(next.draftUpdatedAt, "v3");
    assert.equal(next.conflict, "");
  });

  test("linked related products stay known even when absent from the visible search page", () => {
    const candidates = relatedCandidates(product, new Map([["kaftan-two", "Kaftan Two"]]), [{ slug: "other", name: "Other" }]);
    assert.deepEqual(candidates.map((c) => c.slug), ["agbada-one", "kaftan-two", "other"]);
    const unknown = relatedCandidates({ ...product, relatedProductSlugs: ["ghost"] }, new Map(), []);
    assert.ok(unknown.some((c) => c.slug === "ghost"));
  });
});
