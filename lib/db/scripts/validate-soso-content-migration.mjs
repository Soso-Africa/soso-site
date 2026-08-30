import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import pg from "pg";
import { applySosoContentMigrations } from "./apply-soso-content-migration.mjs";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to validate the SOSO migrations");
}

const expectedTables = [
  "soso_analytics_events",
  "soso_audit_logs",
  "soso_commerce_checkout_attempts",
  "soso_commerce_webhook_events",
  "soso_consent_records",
  "soso_content_seed_state",
  "soso_customer_enquiries",
  "soso_faq_items",
  "soso_journal_post_revisions",
  "soso_journal_posts",
  "soso_marketing_pixel_setting_revisions",
  "soso_marketing_pixel_settings",
  "soso_measurement_requests",
  "soso_measurement_revisions",
  "soso_operational_notification_acknowledgements",
  "soso_operational_notifications",
  "soso_order_items",
  "soso_orders",
  "soso_policy_document_revisions",
  "soso_policy_documents",
  "soso_policy_versions",
  "soso_privacy_access_packages",
  "soso_privacy_requests",
  "soso_rate_limit_buckets",
  "soso_redirect_revisions",
  "soso_redirects",
  "soso_site_content",
  "soso_site_content_revisions",
  "soso_staff_sessions",
  "soso_staff_users",
];

const expectedEnums = [
  "soso_commerce_attempt_status",
  "soso_commerce_webhook_status",
  "soso_consent_state",
  "soso_measurement_revision_actor",
  "soso_measurement_status",
  "soso_measurement_unit",
  "soso_notification_severity",
  "soso_order_item_selection_type",
  "soso_order_status",
  "soso_privacy_request_status",
  "soso_privacy_request_type",
  "soso_refund_request_status",
  "soso_staff_role",
];

const requiredIndexes = [
  "soso_audit_logs_entity_id_created_idx",
  "soso_analytics_events_consent_occurred_idx",
  "soso_marketing_pixel_revisions_key_revision_idx",
  "soso_measurement_requests_order_item_idx",
  "soso_measurement_revisions_request_version_idx",
  "soso_order_items_order_line_idx",
  "soso_staff_users_clerk_user_id_idx",
];

const requiredConstraints = [
  "soso_commerce_checkout_attempts_local_order_id_soso_orders_id_f",
  "soso_marketing_pixel_setting_revisions_revision_check",
  "soso_marketing_pixel_settings_revision_check",
  "soso_marketing_pixel_settings_schema_version_check",
  "soso_measurement_requests_order_item_id_soso_order_items_id_fk",
  "soso_order_items_order_id_soso_orders_id_fk",
  "soso_staff_sessions_staff_user_id_soso_staff_users_id_fk",
];

const expectedFirstRunFiles = [
  "0000_soso_current_baseline.sql",
  "0001_soso_content_cms.sql",
  "0002_faq_history_pagination.sql",
  "0003_marketing_pixel_settings.sql",
  "0004_custom_atelier_handoff.sql",
  "0005_analytics_reporting_index.sql",
];
const legacyBaselineSql = await fs.readFile(
  new URL("./fixtures/legacy-soso-baseline.sql", import.meta.url),
  "utf8",
);

const suffix = randomUUID().replaceAll("-", "");
const schema = `soso_migration_test_${suffix}`;
const legacySchema = `soso_migration_legacy_${suffix}`;
const partialSchema = `soso_migration_partial_${suffix}`;
const quotedSchema = `"${schema}"`;
const quotedLegacySchema = `"${legacySchema}"`;
const quotedPartialSchema = `"${partialSchema}"`;
const client = new pg.Client({ connectionString: databaseUrl });

await client.connect();

try {
  await client.query(`CREATE SCHEMA ${quotedSchema}`);

  const firstRun = await applySosoContentMigrations({
    databaseUrl,
    schema,
  });
  assert.equal(firstRun.freshInitialized, true);
  assert.deepEqual(firstRun.appliedMigrationFiles, expectedFirstRunFiles);

  await client.query(`SET search_path TO ${quotedSchema}, pg_catalog`);

  const tables = await client.query(
    `SELECT tablename
     FROM pg_tables
     WHERE schemaname = $1
       AND left(tablename, 5) = 'soso_'
     ORDER BY tablename`,
    [schema],
  );
  assert.deepEqual(
    tables.rows.map(({ tablename }) => tablename),
    expectedTables,
  );

  const enums = await client.query(
    `SELECT type.typname
     FROM pg_type AS type
     JOIN pg_namespace AS namespace ON namespace.oid = type.typnamespace
     WHERE namespace.nspname = $1
       AND type.typtype = 'e'
       AND left(type.typname, 5) = 'soso_'
     ORDER BY type.typname`,
    [schema],
  );
  assert.deepEqual(
    enums.rows.map(({ typname }) => typname),
    expectedEnums,
  );

  const indexes = await client.query(
    `SELECT indexname
     FROM pg_indexes
     WHERE schemaname = $1
       AND indexname = ANY($2::text[])
     ORDER BY indexname`,
    [schema, requiredIndexes],
  );
  assert.deepEqual(
    indexes.rows.map(({ indexname }) => indexname),
    [...requiredIndexes].sort(),
  );

  const constraints = await client.query(
    `SELECT constraint_name
     FROM information_schema.table_constraints
     WHERE constraint_schema = $1
       AND constraint_name = ANY($2::text[])
     ORDER BY constraint_name`,
    [schema, requiredConstraints],
  );
  assert.deepEqual(
    constraints.rows.map(({ constraint_name }) => constraint_name),
    [...requiredConstraints].sort(),
  );

  const customColumns = await client.query(
    `SELECT table_name, column_name
     FROM information_schema.columns
     WHERE table_schema = $1
       AND (
         (table_name = 'soso_order_items' AND column_name IN (
           'commerce_product_id',
           'commerce_variant_id',
           'line_number',
           'selection_type'
         ))
         OR
         (table_name = 'soso_measurement_requests' AND column_name IN (
           'clarification_note',
           'production_exception',
           'values'
         ))
       )
     ORDER BY table_name, column_name`,
    [schema],
  );
  assert.deepEqual(customColumns.rows, [
    {
      table_name: "soso_measurement_requests",
      column_name: "clarification_note",
    },
    {
      table_name: "soso_measurement_requests",
      column_name: "production_exception",
    },
    { table_name: "soso_measurement_requests", column_name: "values" },
    { table_name: "soso_order_items", column_name: "commerce_product_id" },
    { table_name: "soso_order_items", column_name: "commerce_variant_id" },
    { table_name: "soso_order_items", column_name: "line_number" },
    { table_name: "soso_order_items", column_name: "selection_type" },
  ]);

  const initialSeed = await client.query(`
    SELECT
      (SELECT count(*)::integer FROM soso_faq_items) AS faq_count,
      (SELECT count(*)::integer
       FROM soso_content_seed_state
       WHERE key = 'approved-faq-v1') AS seed_marker_count
  `);
  assert.deepEqual(initialSeed.rows[0], {
    faq_count: 10,
    seed_marker_count: 1,
  });

  await client.query(
    `INSERT INTO soso_faq_items
      (question, answer, category, sort_order, is_published)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      "Migration preservation check",
      "This row must survive a repeat migration run.",
      "Validation",
      99,
      false,
    ],
  );

  const secondRun = await applySosoContentMigrations({
    databaseUrl,
    schema,
  });
  assert.equal(secondRun.freshInitialized, false);
  assert.deepEqual(
    secondRun.appliedMigrationFiles,
    expectedFirstRunFiles.slice(1),
  );

  const repeatState = await client.query(`
    SELECT
      (SELECT count(*)::integer FROM soso_faq_items) AS faq_count,
      (SELECT count(*)::integer
       FROM soso_faq_items
       WHERE question = 'Migration preservation check') AS preserved_count,
      (SELECT count(*)::integer
       FROM soso_content_seed_state
       WHERE key = 'approved-faq-v1') AS seed_marker_count
  `);
  assert.deepEqual(repeatState.rows[0], {
    faq_count: 11,
    preserved_count: 1,
    seed_marker_count: 1,
  });

  await client.query(`CREATE SCHEMA ${quotedLegacySchema}`);
  await client.query(`SET search_path TO ${quotedLegacySchema}, pg_catalog`);
  await client.query(legacyBaselineSql);
  await client.query(`
    CREATE INDEX soso_audit_logs_entity_id_created_idx
      ON soso_audit_logs (entity_type, entity_id, created_at, id);

    INSERT INTO soso_faq_items (question, answer)
    VALUES ('Existing FAQ', 'Must not be replaced by the approved seed.');

    WITH legacy_order AS (
      INSERT INTO soso_orders (
        order_number,
        customer_email,
        customer_name,
        subtotal,
        total
      ) VALUES (
        'LEGACY-001',
        'legacy@example.com',
        'Legacy Customer',
        100,
        100
      )
      RETURNING id
    )
    INSERT INTO soso_order_items (
      order_id,
      product_slug,
      product_name,
      selected_size,
      quantity,
      unit_price
    )
    SELECT
      id,
      'legacy-piece',
      'Legacy Piece',
      'M',
      1,
      100
    FROM legacy_order;
  `);

  const legacyRun = await applySosoContentMigrations({
    databaseUrl,
    schema: legacySchema,
  });
  assert.equal(legacyRun.freshInitialized, false);
  assert.deepEqual(
    legacyRun.appliedMigrationFiles,
    expectedFirstRunFiles.slice(1),
  );

  const legacyState = await client.query(`
    SELECT
      (SELECT count(*)::integer FROM soso_faq_items) AS faq_count,
      (SELECT count(*)::integer
       FROM soso_content_seed_state
       WHERE key = 'approved-faq-v1') AS seed_marker_count,
      (SELECT line_number FROM soso_order_items LIMIT 1) AS line_number,
      (SELECT commerce_product_id FROM soso_order_items LIMIT 1)
        AS commerce_product_id,
      (SELECT selection_type::text FROM soso_order_items LIMIT 1)
        AS selection_type,
      EXISTS (
        SELECT 1
        FROM pg_enum
        JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
        JOIN pg_namespace ON pg_namespace.oid = pg_type.typnamespace
        WHERE pg_namespace.nspname = current_schema()
          AND pg_type.typname = 'soso_staff_role'
          AND pg_enum.enumlabel = 'administrator'
      ) AS administrator_role_exists
  `);
  assert.deepEqual(legacyState.rows[0], {
    faq_count: 1,
    seed_marker_count: 1,
    line_number: 1,
    commerce_product_id: legacyState.rows[0].commerce_product_id,
    selection_type: "standard",
    administrator_role_exists: true,
  });
  assert.match(
    legacyState.rows[0].commerce_product_id,
    /^legacy:[0-9a-f-]{36}$/,
  );

  await client.query(`CREATE SCHEMA ${quotedPartialSchema}`);
  await client.query(`SET search_path TO ${quotedPartialSchema}, pg_catalog`);
  await client.query(legacyBaselineSql);
  await client.query(`
    ALTER TABLE soso_privacy_requests
      ALTER COLUMN resolution_note TYPE integer USING NULL;
    DROP INDEX soso_rate_limit_buckets_expires_idx;
    CREATE INDEX soso_rate_limit_buckets_expires_idx
      ON soso_rate_limit_buckets USING hash (expires_at);
  `);
  await assert.rejects(
    applySosoContentMigrations({
      databaseUrl,
      schema: partialSchema,
    }),
    /schema verification failed/,
  );

  const partialState = await client.query(`
    SELECT
      (
        SELECT data_type
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'soso_privacy_requests'
          AND column_name = 'resolution_note'
      ) AS incompatible_column_type,
      (
        SELECT indexdef
        FROM pg_indexes
        WHERE schemaname = current_schema()
          AND indexname = 'soso_rate_limit_buckets_expires_idx'
      ) LIKE '%USING hash (expires_at)%' AS incompatible_index_preserved,
      to_regclass('soso_content_seed_state') IS NOT NULL
        AS additive_table_exists
  `);
  assert.deepEqual(partialState.rows[0], {
    incompatible_column_type: "integer",
    incompatible_index_preserved: true,
    additive_table_exists: false,
  });

  process.stdout.write(
    "Validated fresh initialization, repeat execution, legacy upgrade, and partial-schema refusal\n",
  );
} finally {
  await client.query(`DROP SCHEMA IF EXISTS ${quotedPartialSchema} CASCADE`);
  await client.query(`DROP SCHEMA IF EXISTS ${quotedLegacySchema} CASCADE`);
  await client.query(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`);
  await client.end();
}
