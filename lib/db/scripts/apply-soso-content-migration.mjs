import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { seedSosoLegacyRedirects } from "./seed-soso-legacy-redirects.mjs";

const baselineMigrationFile = "0000_soso_current_baseline.sql";
const currentSchemaFingerprint =
  "0b50ee2320379108c42aa2e84b0c25f30f1c71b4a5f4d9023efdfc6fde14d099";
const auditHistoryIndexName = "soso_audit_logs_entity_id_created_idx";
const auditHistoryAscendingDefinition =
  "entity_type:asc:nulls_last,entity_id:asc:nulls_last,created_at:asc:nulls_last,id:asc:nulls_last";
const auditHistoryDescendingDefinition =
  "entity_type:asc:nulls_last,entity_id:asc:nulls_last,created_at:desc:nulls_first,id:desc:nulls_first";
const normalizedAuditHistoryDefinition =
  "entity_type:eq,entity_id:eq,created_at:ordered,id:ordered";
const migrationFilePattern = /^\d{4}_[a-z0-9_]+\.sql$/;
const migrationDirectoryUrl = new URL("../migrations/", import.meta.url);
const legacyBaseTables = [
  "soso_analytics_events",
  "soso_audit_logs",
  "soso_commerce_checkout_attempts",
  "soso_commerce_webhook_events",
  "soso_consent_records",
  "soso_customer_enquiries",
  "soso_faq_items",
  "soso_journal_post_revisions",
  "soso_journal_posts",
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
  "soso_redirects",
  "soso_site_content",
  "soso_staff_sessions",
  "soso_staff_users",
];
const legacyBaseEnums = [
  "soso_commerce_attempt_status",
  "soso_commerce_webhook_status",
  "soso_consent_state",
  "soso_notification_severity",
  "soso_order_status",
  "soso_privacy_request_status",
  "soso_privacy_request_type",
  "soso_refund_request_status",
  "soso_staff_role",
];

function quoteIdentifier(identifier) {
  if (!/^[a-z_][a-z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid PostgreSQL schema name: ${identifier}`);
  }

  return `"${identifier}"`;
}

async function readMigrationFiles() {
  const entries = await fs.readdir(fileURLToPath(migrationDirectoryUrl), {
    withFileTypes: true,
  });
  const migrationFiles = entries
    .filter((entry) => entry.isFile() && migrationFilePattern.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  if (migrationFiles[0] !== baselineMigrationFile) {
    throw new Error(
      `Expected ${baselineMigrationFile} to be the first SOSO migration`,
    );
  }

  return migrationFiles;
}

async function inspectSosoSchema(client) {
  const result = await client.query(`
    SELECT
      COALESCE((
        SELECT array_agg(table_name ORDER BY table_name)
        FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_type = 'BASE TABLE'
          AND left(table_name, 5) = 'soso_'
      ), ARRAY[]::text[]) AS table_names,
      COALESCE((
        SELECT array_agg(type.typname ORDER BY type.typname)
        FROM pg_type AS type
        JOIN pg_namespace AS namespace
          ON namespace.oid = type.typnamespace
        WHERE namespace.nspname = current_schema()
          AND left(type.typname, 5) = 'soso_'
          AND type.typtype = 'e'
      ), ARRAY[]::text[]) AS enum_names,
      (
        SELECT count(*)::integer
        FROM pg_class AS relation
        JOIN pg_namespace AS namespace
          ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = current_schema()
          AND left(relation.relname, 5) = 'soso_'
      ) + (
        SELECT count(*)::integer
        FROM pg_type AS type
        JOIN pg_namespace AS namespace
          ON namespace.oid = type.typnamespace
        WHERE namespace.nspname = current_schema()
          AND left(type.typname, 5) = 'soso_'
          AND type.typtype = 'e'
      ) AS object_count
  `);

  return result.rows[0];
}

export async function collectCurrentSosoSchemaManifest(client) {
  const columnResult = await client.query(`
    SELECT
      relation.relname AS table_name,
      attribute.attname AS column_name,
      format_type(attribute.atttypid, attribute.atttypmod) AS data_type,
      attribute.attnotnull AS not_null,
      COALESCE(
        pg_get_expr(default_value.adbin, default_value.adrelid, true),
        ''
      ) AS default_expression
    FROM pg_attribute AS attribute
    JOIN pg_class AS relation ON relation.oid = attribute.attrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    LEFT JOIN pg_attrdef AS default_value
      ON default_value.adrelid = attribute.attrelid
      AND default_value.adnum = attribute.attnum
    WHERE namespace.nspname = current_schema()
      AND relation.relkind IN ('r', 'p')
      AND left(relation.relname, 5) = 'soso_'
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
    ORDER BY relation.relname, attribute.attname
  `);
  const enumResult = await client.query(`
    SELECT type.typname, enum.enumlabel
    FROM pg_enum AS enum
    JOIN pg_type AS type ON type.oid = enum.enumtypid
    JOIN pg_namespace AS namespace ON namespace.oid = type.typnamespace
    WHERE namespace.nspname = current_schema()
      AND left(type.typname, 5) = 'soso_'
    ORDER BY type.typname, enum.enumsortorder
  `);
  const constraintResult = await client.query(`
    SELECT
      relation.relname AS table_name,
      schema_constraint.contype,
      pg_get_constraintdef(schema_constraint.oid, true) AS definition
    FROM pg_constraint AS schema_constraint
    JOIN pg_class AS relation ON relation.oid = schema_constraint.conrelid
    JOIN pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = current_schema()
      AND left(relation.relname, 5) = 'soso_'
      AND schema_constraint.contype IN ('c', 'f', 'p', 'u')
    ORDER BY relation.relname, schema_constraint.contype, definition
  `);
  const indexResult = await client.query(`
    SELECT
      relation.relname AS table_name,
      index_relation.relname AS index_name,
      access_method.amname AS access_method,
      schema_index.indisunique AS is_unique,
      schema_index.indisvalid AS is_valid,
      string_agg(
        attribute.attname || ':' ||
        CASE WHEN (schema_index.indoption[key_column.ordinality - 1] & 1) = 1
          THEN 'desc'
          ELSE 'asc'
        END || ':' ||
        CASE WHEN (schema_index.indoption[key_column.ordinality - 1] & 2) = 2
          THEN 'nulls_first'
          ELSE 'nulls_last'
        END,
        ',' ORDER BY key_column.ordinality
      ) FILTER (
        WHERE key_column.ordinality <= schema_index.indnkeyatts
      ) AS key_definition,
      string_agg(
        attribute.attname,
        ',' ORDER BY key_column.ordinality
      ) FILTER (
        WHERE key_column.ordinality > schema_index.indnkeyatts
      ) AS include_definition
    FROM pg_index AS schema_index
    JOIN pg_class AS relation ON relation.oid = schema_index.indrelid
    JOIN pg_class AS index_relation
      ON index_relation.oid = schema_index.indexrelid
    JOIN pg_am AS access_method
      ON access_method.oid = index_relation.relam
    JOIN pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    JOIN LATERAL unnest(schema_index.indkey)
      WITH ORDINALITY AS key_column(attribute_number, ordinality)
      ON true
    JOIN pg_attribute AS attribute
      ON attribute.attrelid = schema_index.indrelid
      AND attribute.attnum = key_column.attribute_number
    LEFT JOIN pg_constraint AS backing_constraint
      ON backing_constraint.conindid = schema_index.indexrelid
    WHERE namespace.nspname = current_schema()
      AND left(relation.relname, 5) = 'soso_'
      AND backing_constraint.oid IS NULL
      AND schema_index.indexprs IS NULL
      AND schema_index.indpred IS NULL
    GROUP BY
      relation.relname,
      schema_index.indexrelid,
      index_relation.relname,
      access_method.amname,
      schema_index.indisunique,
      schema_index.indisvalid
    ORDER BY relation.relname, index_relation.relname
  `);

  const normalizedIndexes = indexResult.rows.map((index) => {
    if (
      index.index_name === auditHistoryIndexName &&
      [
        auditHistoryAscendingDefinition,
        auditHistoryDescendingDefinition,
      ].includes(index.key_definition)
    ) {
      return {
        ...index,
        key_definition: normalizedAuditHistoryDefinition,
      };
    }

    return index;
  });
  const manifest = {
    columns: columnResult.rows,
    constraints: constraintResult.rows,
    enums: enumResult.rows,
    indexes: normalizedIndexes,
  };

  return manifest;
}

async function calculateCurrentSosoSchemaFingerprint(client) {
  const manifest = await collectCurrentSosoSchemaManifest(client);

  return createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
}

async function verifyCurrentSosoSchema(client) {
  const actualFingerprint = await calculateCurrentSosoSchemaFingerprint(client);

  if (actualFingerprint !== currentSchemaFingerprint) {
    throw new Error(
      `SOSO schema verification failed after migrations; expected fingerprint ${currentSchemaFingerprint}, received ${actualFingerprint}`,
    );
  }
}

export async function applySosoContentMigrations({
  databaseUrl,
  schema = "public",
} = {}) {
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required to apply the SOSO content CMS migrations",
    );
  }

  const migrationFiles = await readMigrationFiles();
  const migrationSql = new Map(
    await Promise.all(
      migrationFiles.map(async (migrationFile) => {
        const migrationUrl = new URL(migrationFile, migrationDirectoryUrl);
        return [
          migrationFile,
          await fs.readFile(fileURLToPath(migrationUrl), "utf8"),
        ];
      }),
    ),
  );
  const client = new pg.Client({ connectionString: databaseUrl });
  const appliedMigrationFiles = [];
  let freshInitialized = false;

  await client.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `SET LOCAL search_path TO ${quoteIdentifier(schema)}, pg_catalog`,
    );
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('soso-content-migrations'))",
    );

    const schemaState = await inspectSosoSchema(client);
    const missingLegacyTables = legacyBaseTables.filter(
      (tableName) => !schemaState.table_names.includes(tableName),
    );
    const missingLegacyEnums = legacyBaseEnums.filter(
      (enumName) => !schemaState.enum_names.includes(enumName),
    );
    const schemaIsEmpty = Number(schemaState.object_count) === 0;
    const legacyBaseIsComplete =
      missingLegacyTables.length === 0 && missingLegacyEnums.length === 0;

    if (!schemaIsEmpty && !legacyBaseIsComplete) {
      throw new Error(
        `Schema ${schema} contains a partial SOSO schema; missing legacy tables: ${missingLegacyTables.join(", ") || "none"}; missing legacy enums: ${missingLegacyEnums.join(", ") || "none"}`,
      );
    }

    freshInitialized = schemaIsEmpty;

    for (const migrationFile of migrationFiles) {
      if (migrationFile === baselineMigrationFile && !freshInitialized) {
        continue;
      }

      await client.query(migrationSql.get(migrationFile));
      appliedMigrationFiles.push(migrationFile);
    }

    await verifyCurrentSosoSchema(client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }

  const legacyRedirectSeed = await seedSosoLegacyRedirects({ databaseUrl, schema });
  return { appliedMigrationFiles, freshInitialized, legacyRedirectSeed };
}

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const result = await applySosoContentMigrations({
    databaseUrl: process.env.DATABASE_URL,
  });
  const mode = result.freshInitialized
    ? "Initialized a fresh SOSO schema and applied"
    : "Applied";
  process.stdout.write(`${mode} ${result.appliedMigrationFiles.join(", ")}\n`);
}
