import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("platform revision listing selects metadata in SQL, never complete catalogue snapshots", async () => {
  const source = await readFile(new URL("../routes/staff-content.ts", import.meta.url), "utf8");
  const handler = source.slice(source.indexOf('router.get("/staff/content/platform/revisions"'));
  const body = handler.slice(0, handler.indexOf("\n});") + 4);
  assert.match(body, /platformRoles/);
  assert.match(body, /db\.select\(\{/);
  for (const field of ["id", "event", "contentHash", "createdAt"]) {
    assert.ok(body.includes(`siteContentRevisionsTable.${field}`), field);
  }
  assert.doesNotMatch(body, /siteContentRevisionsTable\.snapshot|db\.select\(\)/);
  assert.match(body, /where\(eq\(siteContentRevisionsTable\.contentKey, "platform"\)\)/);
  assert.match(body, /\.limit\(100\)/);
  assert.match(body, /res\.json\(rows\)/);
});
