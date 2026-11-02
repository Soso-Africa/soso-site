// Assessment only. Never import into a production writer or cleanup reader.
import { createHash } from "node:crypto";

export const MAX_DELTAS = 31;
const clone = (value) => structuredClone(value);
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
export const fingerprint = (value) => createHash("sha256").update(canonical(value)).digest("hex");

// Keep all managed-path-bearing strings, including embedded URLs and query
// suffixes. This is conservative retention evidence, not deletion authority.
export function mediaReferences(value) {
  const strings = new Set();
  const visit = (item) => {
    if (typeof item === "string" && item.includes("/api/storage/objects/")) strings.add(item);
    else if (Array.isArray(item)) item.forEach(visit);
    else if (item && typeof item === "object") {
      Object.keys(item).forEach(visit);
      Object.values(item).forEach(visit);
    }
  };
  visit(value);
  return [...strings].sort();
}

export function encodeRevision({ id, previous = null, before = null, after, actor = "synthetic-editor", event = "draft_saved" }) {
  const record = {
    format: "soso-history-experiment-v1", id, actor, event,
    parentId: previous?.id ?? null, parentHash: previous?.contentHash ?? null,
    contentHash: fingerprint(after), mediaReferences: mediaReferences(after),
    depth: 0, kind: "checkpoint", snapshot: clone(after),
  };
  if (previous && fingerprint(before) !== previous.contentHash) throw new Error("Previous content hash mismatch");
  if (!previous || event !== "draft_saved" || previous.depth >= MAX_DELTAS
    || !Array.isArray(before?.products) || !Array.isArray(after?.products)) return record;
  const { products: oldProducts, ...oldRest } = before;
  const { products: newProducts, ...newRest } = after;
  // All non-product changes, insertions, deletions and reorders are checkpoints.
  if (canonical(oldRest) !== canonical(newRest) || oldProducts.length !== newProducts.length
    || oldProducts.some((p, i) => p.slug !== newProducts[i].slug)) return record;
  const changes = newProducts.flatMap((product, index) =>
    canonical(product) === canonical(oldProducts[index]) ? [] : [{ index, slug: product.slug, product: clone(product) }]);
  const delta = { ...record, kind: "products", depth: previous.depth + 1, changes };
  delete delta.snapshot;
  // Avoid negative savings for wide edits or small catalogues.
  return Buffer.byteLength(canonical(delta)) < Buffer.byteLength(canonical(record)) ? delta : record;
}

export function restoreRevision(records, id) {
  const seen = new Set();
  const restore = (key, hops) => {
    if (hops > MAX_DELTAS || seen.has(key)) throw new Error("Invalid or excessive dependency chain");
    seen.add(key);
    const row = records.get(key);
    if (!row || row.id !== key || row.format !== "soso-history-experiment-v1") throw new Error("Missing or unsupported revision");
    let content;
    if (row.kind === "checkpoint") {
      if (row.depth !== 0 || !Object.hasOwn(row, "snapshot")) throw new Error("Invalid checkpoint");
      content = clone(row.snapshot);
    } else if (row.kind === "products") {
      const parent = records.get(row.parentId);
      if (!parent || parent.contentHash !== row.parentHash || row.depth !== parent.depth + 1
        || row.depth > MAX_DELTAS || !Array.isArray(row.changes)) throw new Error("Invalid delta base");
      content = restore(row.parentId, hops + 1);
      const indices = new Set();
      for (const change of row.changes) {
        if (!Number.isInteger(change.index) || change.index < 0 || indices.has(change.index)
          || content?.products?.[change.index]?.slug !== change.slug || change.product?.slug !== change.slug) {
          throw new Error("Invalid product delta");
        }
        indices.add(change.index);
        content.products[change.index] = clone(change.product);
      }
    } else throw new Error("Unknown revision kind");
    if (fingerprint(content) !== row.contentHash
      || canonical(mediaReferences(content)) !== canonical(row.mediaReferences)) throw new Error("Revision integrity mismatch");
    return content;
  };
  return restore(id, 0);
}
