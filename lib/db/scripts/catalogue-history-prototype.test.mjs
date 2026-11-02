import test from "node:test";
import assert from "node:assert/strict";
import { encodeRevision, restoreRevision, MAX_DELTAS } from "./catalogue-history-prototype.mjs";

const fixture = () => ({
  collections: [{ slug: "men", cover: { src: "/api/storage/objects/uploads/cover" } }],
  products: Array.from({ length: 20 }, (_, i) => ({
    slug: `product-${i}`, description: "Catalogue description ".repeat(30), price: 100,
    photo: `/api/storage/objects/uploads/photo-${i}`,
    commerceMappingConfirmation: { productHash: `mapping-${i}`, confirmedAt: "2026-01-01" },
  })),
});

test("restores every frequent edit including mapping replacement, removal, and old media", () => {
  let before = null, previous = null;
  const rows = new Map(), originals = new Map();
  for (let i = 0; i < 100; i++) {
    const after = before ? structuredClone(before) : fixture();
    after.products[0].price = i;
    if (i === 2) after.products[0].commerceMappingConfirmation.productHash = "new-mapping";
    if (i === 3) delete after.products[0].commerceMappingConfirmation;
    if (i === 4) after.products[0].photo = "/api/storage/objects/uploads/new-photo?width=200";
    const row = encodeRevision({ id: `${i}`, previous, before, after });
    rows.set(row.id, row); originals.set(row.id, structuredClone(after));
    assert.ok(row.depth <= MAX_DELTAS);
    previous = row; before = after;
  }
  assert.equal(rows.get("1").kind, "products");
  assert.equal(rows.get("32").kind, "checkpoint");
  for (const [id, original] of originals) assert.deepEqual(restoreRevision(rows, id), original);
  assert.ok(rows.get("0").mediaReferences.includes("/api/storage/objects/uploads/photo-0"));
  assert.ok(rows.get("4").mediaReferences.includes("/api/storage/objects/uploads/new-photo?width=200"));
});

test("structural changes and publication make independent checkpoints", () => {
  const before = fixture();
  const previous = encodeRevision({ id: "base", after: before });
  for (const mutate of [
    (c) => c.products.reverse(), (c) => c.products.pop(),
    (c) => c.products.push({ slug: "added" }), (c) => { c.collections = []; },
  ]) {
    const after = structuredClone(before); mutate(after);
    const row = encodeRevision({ id: "next", previous, before, after });
    assert.equal(row.kind, "checkpoint");
    assert.deepEqual(restoreRevision(new Map([[row.id, row]]), row.id), after);
  }
  const published = encodeRevision({ id: "published", previous, before, after: before, event: "published" });
  assert.equal(published.kind, "checkpoint");
  const unpublished = encodeRevision({ id: "unpublished", previous: published, before, after: null, event: "unpublished" });
  assert.equal(restoreRevision(new Map([[unpublished.id, unpublished]]), unpublished.id), null);
  const wide = structuredClone(before);
  wide.products.forEach((p) => { p.description = "Changed ".repeat(300); });
  assert.equal(encodeRevision({ id: "wide", previous, before, after: wide }).kind, "checkpoint");
  const noop = encodeRevision({ id: "noop", previous, before, after: before });
  assert.deepEqual(restoreRevision(new Map([["base", previous], ["noop", noop]]), "noop"), before);
  assert.equal(noop.actor, "synthetic-editor");
  assert.equal(noop.event, "draft_saved");
  assert.throws(() => encodeRevision({ id: "bad", previous, before: wide, after: before }));
});

test("fails closed on damaged dependencies, payloads, indices, formats and media evidence", () => {
  const before = fixture(), after = fixture(); after.products[0].price++;
  const base = encodeRevision({ id: "base", after: before });
  const delta = encodeRevision({ id: "delta", previous: base, before, after });
  for (const damage of [
    (m) => m.delete("base"),
    (m) => { m.get("base").snapshot.products[0].price++; },
    (m) => { m.get("delta").changes[0].product.price++; },
    (m) => { m.get("delta").changes[0].index = -1; },
    (m) => { m.get("delta").parentId = "delta"; },
    (m) => { m.get("delta").parentHash = "wrong"; },
    (m) => { m.get("delta").mediaReferences = []; },
    (m) => { m.get("delta").depth = 33; },
    (m) => { m.get("delta").format = "unknown"; },
    (m) => { m.get("delta").changes.push(m.get("delta").changes[0]); },
  ]) {
    const rows = new Map([["base", structuredClone(base)], ["delta", structuredClone(delta)]]);
    damage(rows);
    assert.throws(() => restoreRevision(rows, "delta"));
  }
});
