import assert from "node:assert/strict";
import pg from "pg";
import { ensurePurchaseConversionSchema } from "./ensure-purchase-conversion-schema.mjs";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const result = await client.query("SELECT current_schema() AS schema");
  const schema = result.rows[0].schema;
  assert.match(schema, /^soso_api_test_/, "Run this verification only through the isolated schema wrapper");
  assert.deepEqual(await ensurePurchaseConversionSchema({ databaseUrl: process.env.DATABASE_URL, schema }), { verified: true });
  assert.deepEqual(await ensurePurchaseConversionSchema({ databaseUrl: process.env.DATABASE_URL, schema }), { verified: true });
  const claims = await client.query("SELECT count(*)::int AS count FROM soso_purchase_conversion_claims");
  assert.equal(claims.rows[0].count, 0);
  await client.query("ALTER TABLE soso_purchase_conversion_claims ADD COLUMN unexpected integer");
  await assert.rejects(
    ensurePurchaseConversionSchema({ databaseUrl: process.env.DATABASE_URL, schema }),
    /differ from the approved schema/,
  );
  console.log("Purchase release migration is idempotent and rejects unexpected schema without creating orders.");
} finally {
  await client.end();
}
