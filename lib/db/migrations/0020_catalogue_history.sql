-- Additive only: no UPDATE, DELETE, backfill or legacy hash conversion.
DO $migration$
BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'soso_site_content_revisions'::regclass AND attname = 'history_format' AND NOT attisdropped) THEN
ALTER TABLE soso_site_content_revisions
  ADD COLUMN history_format text NOT NULL DEFAULT 'legacy-full',
  ADD COLUMN hash_encoding text NOT NULL DEFAULT 'legacy-preserved',
  ADD COLUMN integrity_hash text,
  ADD COLUMN base_id uuid,
  ADD COLUMN base_hash text,
  ADD COLUMN chain_depth integer NOT NULL DEFAULT 0,
  ADD COLUMN product_changes jsonb,
  ADD COLUMN media_references jsonb,
  ADD COLUMN media_hash text,
  ADD CONSTRAINT soso_history_key_identity UNIQUE (id, content_key),
  ADD CONSTRAINT soso_history_base FOREIGN KEY (base_id, content_key)
    REFERENCES soso_site_content_revisions(id, content_key) ON DELETE RESTRICT,
  ADD CONSTRAINT soso_history_shape CHECK (
    (history_format = 'legacy-full' AND base_id IS NULL AND chain_depth = 0
      AND integrity_hash IS NULL AND product_changes IS NULL AND media_references IS NULL AND media_hash IS NULL)
    OR (history_format IN ('full-v1', 'products-v1')
      AND hash_encoding IN ('platform-canonical-json-v1', 'postgres-jsonb-text')
      AND integrity_hash IS NOT NULL AND media_hash IS NOT NULL
      AND media_references IS NOT NULL AND jsonb_typeof(media_references) = 'array'
      AND ((history_format = 'full-v1' AND base_id IS NULL AND base_hash IS NULL
        AND chain_depth = 0 AND product_changes IS NULL)
      OR (history_format = 'products-v1' AND snapshot IS NULL AND base_id IS NOT NULL
        AND base_id <> id AND base_hash IS NOT NULL AND chain_depth BETWEEN 1 AND 31
        AND product_changes IS NOT NULL AND jsonb_typeof(product_changes) = 'array')))
  );
END IF;
END $migration$;
CREATE INDEX IF NOT EXISTS soso_history_base_idx ON soso_site_content_revisions(base_id) WHERE base_id IS NOT NULL;

-- A database-local, reversible switch. Migration alone never enables deltas.
CREATE TABLE IF NOT EXISTS soso_catalogue_history_writer (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  qualification text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT enabled OR (qualification IS NOT NULL AND length(qualification) >= 64))
);
INSERT INTO soso_catalogue_history_writer(singleton) VALUES (true) ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION soso_history_hash(value jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path FROM CURRENT AS $$
  SELECT encode(sha256(convert_to(coalesce(value, 'null'::jsonb)::text, 'UTF8')), 'hex')
$$;

-- All scalar strings AND object keys, not just recognized media fields.
-- Conservative substring retention includes body URLs, suffixes and object keys.
CREATE OR REPLACE FUNCTION soso_history_media(value jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path FROM CURRENT AS $$
  WITH RECURSIVE nodes(v) AS (
    SELECT value
    UNION ALL
    SELECT child.v FROM nodes n CROSS JOIN LATERAL (
      SELECT e.value AS v FROM jsonb_each(CASE WHEN jsonb_typeof(n.v) = 'object' THEN n.v ELSE '{}' END) e
      UNION ALL
      SELECT to_jsonb(e.key) FROM jsonb_each(CASE WHEN jsonb_typeof(n.v) = 'object' THEN n.v ELSE '{}' END) e
      UNION ALL
      SELECT a.value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(n.v) = 'array' THEN n.v ELSE '[]' END) a
    ) child
  )
  SELECT coalesce(jsonb_agg(s ORDER BY s COLLATE "C"), '[]'::jsonb)
  FROM (SELECT DISTINCT v #>> '{}' AS s FROM nodes WHERE jsonb_typeof(v) = 'string'
    AND strpos(v #>> '{}', '/api/storage/objects/') > 0) strings
$$;

CREATE OR REPLACE FUNCTION soso_history_restore(revision_id uuid, hops integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path FROM CURRENT AS $$
DECLARE
  r soso_site_content_revisions%ROWTYPE;
  b soso_site_content_revisions%ROWTYPE;
  document jsonb;
  change jsonb;
  idx integer;
  seen integer[] := '{}';
BEGIN
  IF hops < 0 OR hops > 31 THEN RAISE EXCEPTION 'History dependency depth exceeded'; END IF;
  SELECT * INTO STRICT r FROM soso_site_content_revisions WHERE id = revision_id;
  IF r.history_format = 'legacy-full' THEN
    -- Original hash and its original encoding are deliberately not rewritten.
    RETURN r.snapshot;
  ELSIF r.history_format = 'full-v1' THEN
    IF r.chain_depth <> 0 OR r.base_id IS NOT NULL OR r.product_changes IS NOT NULL THEN
      RAISE EXCEPTION 'Invalid history checkpoint';
    END IF;
    document := r.snapshot;
  ELSIF r.history_format = 'products-v1' THEN
    SELECT * INTO STRICT b FROM soso_site_content_revisions WHERE id = r.base_id;
    IF b.content_key <> r.content_key OR b.history_format NOT IN ('full-v1', 'products-v1')
      OR b.integrity_hash IS DISTINCT FROM r.base_hash OR r.chain_depth <> b.chain_depth + 1
      OR r.chain_depth NOT BETWEEN 1 AND 31 OR r.snapshot IS NOT NULL
      OR jsonb_typeof(r.product_changes) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Invalid history base';
    END IF;
    document := soso_history_restore(r.base_id, hops + 1);
    IF jsonb_typeof(document->'products') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid history products'; END IF;
    FOR change IN SELECT value FROM jsonb_array_elements(r.product_changes) LOOP
      IF jsonb_typeof(change->'index') IS DISTINCT FROM 'number'
        OR (change->>'index') !~ '^(0|[1-9][0-9]*)$' THEN RAISE EXCEPTION 'Invalid history index'; END IF;
      idx := (change->>'index')::integer;
      IF idx = ANY(seen) OR idx >= jsonb_array_length(document->'products')
        OR change->>'slug' IS NULL OR document#>>ARRAY['products', idx::text, 'slug'] IS DISTINCT FROM change->>'slug'
        OR change#>>'{product,slug}' IS DISTINCT FROM change->>'slug' THEN
        RAISE EXCEPTION 'Invalid history product identity';
      END IF;
      seen := array_append(seen, idx);
      document := jsonb_set(document, ARRAY['products', idx::text], change->'product', false);
    END LOOP;
  ELSE RAISE EXCEPTION 'Unsupported history format: %', r.history_format;
  END IF;
  IF r.hash_encoding NOT IN ('platform-canonical-json-v1', 'postgres-jsonb-text')
    OR soso_history_hash(document) IS DISTINCT FROM r.integrity_hash
    OR soso_history_media(document) IS DISTINCT FROM r.media_references
    OR soso_history_hash(r.media_references) IS DISTINCT FROM r.media_hash THEN
    RAISE EXCEPTION 'History integrity or retained-media evidence mismatch';
  END IF;
  RETURN document;
END $$;

CREATE OR REPLACE FUNCTION soso_history_encode() RETURNS trigger
LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE
  previous soso_site_content_revisions%ROWTYPE;
  before_document jsonb;
  changes jsonb;
  enabled boolean;
BEGIN
  -- Every writer, even future direct SQL writers, shares cleanup's lock.
  PERFORM pg_advisory_xact_lock(hashtext('soso-platform-content-media'));
  IF NEW.history_format <> 'legacy-full' OR NEW.base_id IS NOT NULL THEN
    RAISE EXCEPTION 'History format is server-owned';
  END IF;
  SELECT w.enabled INTO STRICT enabled FROM soso_catalogue_history_writer w WHERE singleton FOR SHARE;
  NEW.history_format := 'full-v1';
  -- Writers explicitly identify their audit hash encoding; old rows stay opaque.
  IF NEW.hash_encoding = 'legacy-preserved' THEN NEW.hash_encoding := 'platform-canonical-json-v1'; END IF;
  NEW.integrity_hash := soso_history_hash(NEW.snapshot);
  NEW.media_references := soso_history_media(NEW.snapshot);
  NEW.media_hash := soso_history_hash(NEW.media_references);
  NEW.base_id := NULL;
  NEW.base_hash := NULL;
  NEW.chain_depth := 0;
  NEW.product_changes := NULL;
  IF enabled AND NEW.content_key = 'platform' AND NEW.event = 'draft_saved'
    AND jsonb_typeof(NEW.snapshot->'products') = 'array' THEN
    -- Immediate physical predecessor, including publication or migration barriers.
    SELECT * INTO previous FROM soso_site_content_revisions
      WHERE content_key = NEW.content_key ORDER BY created_at DESC, id DESC LIMIT 1;
    IF FOUND AND previous.history_format IN ('full-v1', 'products-v1')
      AND previous.event = 'draft_saved' AND previous.chain_depth < 31 THEN
      before_document := soso_history_restore(previous.id);
      IF jsonb_typeof(before_document->'products') = 'array'
        AND before_document - 'products' = NEW.snapshot - 'products'
        AND jsonb_array_length(before_document->'products') = jsonb_array_length(NEW.snapshot->'products')
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(NEW.snapshot->'products') WITH ORDINALITY p(value, n)
          WHERE p.value->>'slug' IS NULL OR p.value->>'slug' IS DISTINCT FROM before_document#>>ARRAY['products',(p.n-1)::text,'slug']
        ) THEN
        SELECT coalesce(jsonb_agg(jsonb_build_object('index', n-1, 'slug', value->>'slug', 'product', value) ORDER BY n), '[]')
          INTO changes FROM jsonb_array_elements(NEW.snapshot->'products') WITH ORDINALITY p(value,n)
          WHERE value IS DISTINCT FROM before_document#>ARRAY['products',(n-1)::text];
        IF octet_length(changes::text) + 256 < octet_length(NEW.snapshot::text) THEN
          NEW.history_format := 'products-v1';
          NEW.base_id := previous.id;
          NEW.base_hash := previous.integrity_hash;
          NEW.chain_depth := previous.chain_depth + 1;
          NEW.product_changes := changes;
          NEW.snapshot := NULL;
        END IF;
      END IF;
    END IF;
  END IF;
  -- Total ordering without depending on application millisecond timestamp ties.
  SELECT * INTO previous FROM soso_site_content_revisions
    WHERE content_key = NEW.content_key ORDER BY created_at DESC, id DESC LIMIT 1;
  IF FOUND THEN NEW.created_at := greatest(NEW.created_at, previous.created_at + interval '1 microsecond'); END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION soso_history_verify_insert() RETURNS trigger
LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
  PERFORM soso_history_restore(NEW.id);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS soso_history_encode ON soso_site_content_revisions;
CREATE TRIGGER soso_history_encode BEFORE INSERT ON soso_site_content_revisions
  FOR EACH ROW EXECUTE FUNCTION soso_history_encode();
DROP TRIGGER IF EXISTS soso_history_verify ON soso_site_content_revisions;
CREATE TRIGGER soso_history_verify AFTER INSERT ON soso_site_content_revisions
  FOR EACH ROW EXECUTE FUNCTION soso_history_verify_insert();

CREATE OR REPLACE FUNCTION soso_history_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
  RAISE EXCEPTION 'Retained catalogue history is immutable; retrospective changes require separate approval';
END $$;
DROP TRIGGER IF EXISTS soso_history_immutable ON soso_site_content_revisions;
CREATE TRIGGER soso_history_immutable BEFORE UPDATE ON soso_site_content_revisions
  FOR EACH ROW EXECUTE FUNCTION soso_history_immutable();

-- Shared deletion-authority reader. Unknown/corrupt history raises, never false.
CREATE OR REPLACE FUNCTION soso_history_references(needle text) RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path FROM CURRENT AS $$
DECLARE r record; document jsonb;
BEGIN
  IF needle IS NULL OR needle = '' THEN RAISE EXCEPTION 'Missing media identity'; END IF;
  FOR r IN SELECT id, history_format, snapshot, media_references FROM soso_site_content_revisions LOOP
    IF r.history_format = 'legacy-full' THEN
      IF strpos(coalesce(r.snapshot::text, ''), needle) > 0 THEN RETURN true; END IF;
    ELSE
      document := soso_history_restore(r.id);
      IF strpos(coalesce(document::text, ''), needle) > 0
        OR strpos(r.media_references::text, needle) > 0 THEN RETURN true; END IF;
    END IF;
  END LOOP;
  RETURN false;
END $$;

-- Metadata-only operational measurement. Does not fetch or reconstruct history.
CREATE OR REPLACE VIEW soso_catalogue_history_metrics AS
  SELECT history_format, count(*) AS revisions, max(chain_depth) AS max_chain_depth,
    sum(coalesce(pg_column_size(snapshot),0) + coalesce(pg_column_size(product_changes),0)
      + coalesce(pg_column_size(media_references),0)) AS payload_bytes
  FROM soso_site_content_revisions GROUP BY history_format;
