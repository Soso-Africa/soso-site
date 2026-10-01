import assert from "node:assert/strict";
import test from "node:test";
import { committedRowFor } from "./platform-row";

test("publish applies only a row that really has a published version", () => {
  const row = { draft: { a: 1 }, published: { a: 1 }, publishedAt: "t", draftUpdatedAt: "d" };
  assert.equal(committedRowFor(row, "publish"), row);
  assert.equal(committedRowFor({ draft: {}, published: null }, "publish"), null);
  assert.equal(committedRowFor({} as never, "publish"), null);
  assert.equal(committedRowFor(null, "publish"), null);
});
test("unpublish applies only a row with no published version", () => {
  const row = { draft: {}, published: null };
  assert.equal(committedRowFor(row, "unpublish"), row);
  assert.equal(committedRowFor({ draft: {}, published: {} }, "unpublish"), null);
});
