CREATE TABLE IF NOT EXISTS soso_catalogue_import_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id text NOT NULL,
  source_identity text NOT NULL,
  source_version text NOT NULL,
  hash text NOT NULL CHECK (hash ~ '^[a-f0-9]{64}$'),
  name text NOT NULL,
  size integer NOT NULL CHECK (size BETWEEN 1 AND 12582912),
  path text NOT NULL UNIQUE CHECK (path LIKE '/api/storage/objects/uploads/%' AND path !~ '[?#]'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'complete', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  authorized_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS soso_import_upload_owner_hash_idx ON soso_catalogue_import_uploads(owner_id, hash);
CREATE TABLE IF NOT EXISTS soso_catalogue_import_sessions (
  owner_id text PRIMARY KEY,
  review jsonb,
  version integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
