import assert from "node:assert/strict";
import test from "node:test";
import type { CatalogProduct, PlatformContent } from "../../../data/platformContent";
import { runGuidedReview, type SavedPlatformRow } from "./guided-review";

const product = (slug = "garment") => ({ slug, name: slug, price: 100, standardEligible: true,
  customEligible: false, standardSizes: ["M"], commerceProductId: "parent", commerceVariantIds: { M: "medium" },
  fulfilmentState: "made_immediately" } as CatalogProduct);
const snapshot = (): SavedPlatformRow => ({ draft: { products: [product()], collections: [] } as unknown as PlatformContent,
  published: { products: [] } as unknown as PlatformContent, draftUpdatedAt: "2030-01-01T00:00:00.000Z", publishedAt: "2030-01-01T00:00:00.000Z" });
const suggestion = (p: CatalogProduct) => ({ slug: p.slug, status: "confident", confidence: 97,
  productId: "parent", variantIds: { M: "medium" }, choiceLabels: { M: "Medium" },
  productHash: "remote-hash", localHash: "local-hash", evidence: ["Exact match"], issues: [] });

test("one explicit action reviews, saves, approves, publishes in order using acknowledged timestamps", async () => {
  const calls: string[] = [];
  let row = snapshot();
  let committed = 0;
  const result = await runGuidedReview({ products: [product()], row, publish: true, committed: () => { committed++; },
    request: async <T,>(path: string, body: unknown): Promise<T> => {
      calls.push(path);
      const b = body as Record<string, unknown>;
      if (path.endsWith("/preview")) return { snapshotHash: "snapshot", fetchedAt: "2030-01-01T00:00:00.000Z", suggestions: [suggestion(product())] } as T;
      if (path.endsWith("/catalogue/draft")) {
        row = { ...row, draftUpdatedAt: "2030-01-01T00:00:01.000Z" };
        assert.equal((b.upserts as { product: CatalogProduct }[])[0].product.commerceMappingConfirmation?.confidence, 97);
        return row as T;
      }
      assert.equal(b.expectedDraftUpdatedAt, row.draftUpdatedAt);
      if (path.endsWith("/approve")) { assert.equal(b.acknowledged, true); return {} as T; }
      assert.equal(b.expectedPublishedAt, row.publishedAt);
      return { ...row, publishedAt: "2030-01-01T00:00:02.000Z" } as T;
    } });
  assert.equal(result.ok, true);
  assert.deepEqual(result.publishedSlugs, ["garment"]);
  assert.equal(committed, 2);
  assert.deepEqual(calls.map((x) => x.split("/").at(-1)), ["preview", "draft", "approve", "publish"]);
});

test("unsafe mapping saves and publishes nothing", async () => {
  let calls = 0;
  const result = await runGuidedReview({ products: [product()], row: snapshot(), publish: true, committed: () => assert.fail("No commit expected"),
    request: async <T,>(): Promise<T> => { calls++; return { snapshotHash: "s", fetchedAt: "date", suggestions: [{ ...suggestion(product()), status: "blocked", issues: ["L is linked to M"] }] } as T; } });
  assert.equal(result.ok, false);
  assert.equal(calls, 1);
  assert.match(result.message, /L is linked to M/);
});
test("an incomplete confident response cannot save or publish", async () => {
  const result = await runGuidedReview({ products: [product()], row: snapshot(), publish: true, committed: () => assert.fail("No commit expected"),
    request: async <T,>(): Promise<T> => ({ snapshotHash: "s", fetchedAt: "d", suggestions: [{ ...suggestion(product()), variantIds: {} }] }) as T });
  assert.equal(result.ok, false);
  assert.match(result.message, /every enabled size/);
});

test("editor approval refusal preserves saved draft and never calls publish", async () => {
  const calls: string[] = [];
  const result = await runGuidedReview({ products: [product()], row: snapshot(), publish: true, committed: () => undefined,
    request: async <T,>(path: string): Promise<T> => {
      calls.push(path);
      if (path.endsWith("/preview")) return { snapshotHash: "s", fetchedAt: "d", suggestions: [suggestion(product())] } as T;
      if (path.endsWith("/draft")) return snapshot() as T;
      throw new Error("Only owners and administrators can approve.");
    } });
  assert.equal(result.ok, false);
  assert.match(result.message, /draft was saved/);
  assert.ok(!calls.some((p) => p.endsWith("/publish")));
});

test("check and save does not approve or publish", async () => {
  const calls: string[] = [];
  const result = await runGuidedReview({ products: [product()], row: snapshot(), publish: false, committed: () => undefined,
    request: async <T,>(path: string): Promise<T> => {
      calls.push(path);
      return (path.endsWith("/preview") ? { snapshotHash: "s", fetchedAt: "d", suggestions: [suggestion(product())] } : snapshot()) as T;
    } });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 2);
});

test("a later publication failure reports exactly what is already live", async () => {
  const products = [product("first"), product("second")];
  const result = await runGuidedReview({ products, row: snapshot(), publish: true, committed: () => undefined,
    request: async <T,>(path: string): Promise<T> => {
      if (path.endsWith("/preview")) return { snapshotHash: "s", fetchedAt: "d", suggestions: products.map(suggestion) } as T;
      if (path.endsWith("/second/publish")) throw new Error("Stock changed");
      return snapshot() as T;
    } });
  assert.equal(result.ok, false);
  assert.deepEqual(result.publishedSlugs, ["first"]);
  assert.match(result.message, /already live \(first\)/);
  assert.match(result.message, /Remaining products were not published/);
});
