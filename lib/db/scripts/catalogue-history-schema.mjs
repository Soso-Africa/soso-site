import { createHash } from "node:crypto";

// Bounded release verification. No content/history payload is downloaded.
export async function catalogueHistorySchemaFingerprint(client) {
  const columns = (await client.query(`
    SELECT c.relname, a.attname, format_type(a.atttypid,a.atttypmod) AS type, a.attnotnull,
      coalesce(pg_get_expr(d.adbin,d.adrelid),'') AS default_value
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
    LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
    WHERE n.nspname=current_schema() AND a.attnum>0 AND NOT a.attisdropped
      AND (c.relname='soso_catalogue_history_writer' OR (c.relname='soso_site_content_revisions'
        AND a.attname=ANY(ARRAY['history_format','hash_encoding','integrity_hash','base_id','base_hash',
          'chain_depth','product_changes','media_references','media_hash'])))
    ORDER BY c.relname,a.attname
  `)).rows;
  const constraints = (await client.query(`
    SELECT x.conname, pg_get_constraintdef(x.oid,true) AS definition
    FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=current_schema() AND x.contype<>'n'
      AND (c.relname='soso_catalogue_history_writer' OR x.conname=ANY(ARRAY['soso_history_key_identity','soso_history_base','soso_history_shape']))
    ORDER BY x.conname
  `)).rows;
  const functions = (await client.query(`
    SELECT p.proname,p.prosrc,p.provolatile,p.prosecdef,pg_get_function_identity_arguments(p.oid) AS arguments,
      pg_get_function_result(p.oid) AS result,
      coalesce(p.proconfig @> ARRAY['search_path=' || current_schema() || ', pg_catalog'],false) AS schema_pinned
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname=current_schema() AND p.proname LIKE 'soso_history_%'
    ORDER BY p.proname,arguments
  `)).rows;
  const triggers = (await client.query(`
    SELECT t.tgname,t.tgenabled,t.tgtype,p.proname FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_proc p ON p.oid=t.tgfoid
    WHERE n.nspname=current_schema() AND c.relname='soso_site_content_revisions' AND NOT t.tgisinternal
      AND t.tgname LIKE 'soso_history_%' ORDER BY t.tgname
  `)).rows;
  const index = (await client.query(`
    SELECT i.indisvalid,i.indisunique,i.indnkeyatts,i.indnatts,am.amname,
      pg_get_indexdef(i.indexrelid,1,true) AS key,pg_get_expr(i.indpred,i.indrelid) AS predicate
    FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_am am ON am.oid=c.relam WHERE n.nspname=current_schema() AND c.relname='soso_history_base_idx'
  `)).rows;
  return createHash("sha256").update(JSON.stringify({ columns, constraints, functions, triggers, index })).digest("hex");
}

// Derived only from the complete fresh-schema qualification, never live drift.
export const EXPECTED_HISTORY_SCHEMA = "0ba771ddee2aaac721d6b3a30b39f86a927645997a934090bbdf3b47087cfd0a";
