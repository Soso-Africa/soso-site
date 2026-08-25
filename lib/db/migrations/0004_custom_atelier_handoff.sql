DO $$ BEGIN
  CREATE TYPE soso_order_item_selection_type AS ENUM ('standard', 'custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE soso_measurement_status AS ENUM ('needed', 'submitted', 'clarification_requested', 'confirmed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE soso_measurement_unit AS ENUM ('cm', 'in');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE soso_measurement_revision_actor AS ENUM ('customer', 'staff', 'system');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE soso_order_items ADD COLUMN IF NOT EXISTS line_number integer;
ALTER TABLE soso_order_items ADD COLUMN IF NOT EXISTS commerce_product_id text;
ALTER TABLE soso_order_items ADD COLUMN IF NOT EXISTS commerce_variant_id text;
ALTER TABLE soso_order_items ADD COLUMN IF NOT EXISTS selection_type soso_order_item_selection_type NOT NULL DEFAULT 'standard';
WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY order_id ORDER BY created_at, id) AS n
  FROM soso_order_items WHERE line_number IS NULL
) UPDATE soso_order_items SET line_number = numbered.n FROM numbered WHERE soso_order_items.id = numbered.id;
UPDATE soso_order_items SET commerce_product_id = 'legacy:' || id::text WHERE commerce_product_id IS NULL;
ALTER TABLE soso_order_items ALTER COLUMN line_number SET NOT NULL;
ALTER TABLE soso_order_items ALTER COLUMN commerce_product_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS soso_order_items_order_line_idx ON soso_order_items(order_id, line_number);

CREATE TABLE IF NOT EXISTS soso_measurement_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES soso_order_items(id) ON DELETE CASCADE,
  status soso_measurement_status NOT NULL DEFAULT 'needed',
  unit soso_measurement_unit,
  values jsonb,
  customer_note text,
  clarification_note text,
  production_exception text,
  version integer NOT NULL DEFAULT 1,
  submitted_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS soso_measurement_requests_order_item_idx ON soso_measurement_requests(order_item_id);
CREATE INDEX IF NOT EXISTS soso_measurement_requests_status_updated_idx ON soso_measurement_requests(status, updated_at);

CREATE TABLE IF NOT EXISTS soso_measurement_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  measurement_request_id uuid NOT NULL REFERENCES soso_measurement_requests(id) ON DELETE CASCADE,
  version integer NOT NULL,
  actor_type soso_measurement_revision_actor NOT NULL,
  actor_id text,
  action text NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS soso_measurement_revisions_request_version_idx ON soso_measurement_revisions(measurement_request_id, version);
CREATE INDEX IF NOT EXISTS soso_measurement_revisions_request_created_idx ON soso_measurement_revisions(measurement_request_id, created_at);