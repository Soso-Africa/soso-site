import assert from "node:assert/strict";
import test from "node:test";
import {
  collectionCoverUploadPaths,
  contentReferencesManagedUpload,
  replacedCollectionCoverUploadPaths,
} from "./collection-cover-cleanup";

test("finds replaced and removed managed collection covers only", () => {
  const previous = {
    collections: [{
      cover: { src: "/api/storage/objects/uploads/desktop-old.webp" },
      mobileCover: { src: "/api/storage/objects/uploads/mobile-old.webp" },
    }, {
      cover: { src: "/images/static-cover.webp" },
    }],
  };
  const next = {
    collections: [{
      cover: { src: "/api/storage/objects/uploads/desktop-new.webp" },
    }],
  };
  assert.deepEqual(replacedCollectionCoverUploadPaths(previous, next), [
    "uploads/desktop-old.webp",
    "uploads/mobile-old.webp",
  ]);
  assert.deepEqual([...collectionCoverUploadPaths(next)], ["uploads/desktop-new.webp"]);
});

test("does not queue a collection cover that remains on another collection", () => {
  const shared = "/api/storage/objects/uploads/shared.webp";
  const previous = { collections: [{ cover: { src: shared } }, { mobileCover: { src: shared } }] };
  const next = { collections: [{}, { mobileCover: { src: shared } }] };
  assert.deepEqual(replacedCollectionCoverUploadPaths(previous, next), []);
});

test("detects managed upload references anywhere in platform content", () => {
  const content = {
    homepage: { image: { src: "/api/storage/objects/uploads/shared.webp" } },
    collections: [],
  };
  assert.equal(contentReferencesManagedUpload(content, "uploads/shared.webp"), true);
  assert.equal(contentReferencesManagedUpload(content, "uploads/orphan.webp"), false);
});