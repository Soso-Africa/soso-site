ALTER TABLE soso_shopper_sessions ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE soso_shopper_sessions ADD COLUMN IF NOT EXISTS device_label text NOT NULL DEFAULT 'Unknown browser / device';
ALTER TABLE soso_shopper_sessions ADD COLUMN IF NOT EXISTS last_active_at timestamptz;
UPDATE soso_shopper_sessions SET last_active_at=created_at WHERE last_active_at IS NULL;
ALTER TABLE soso_shopper_sessions ALTER COLUMN last_active_at SET DEFAULT now();
ALTER TABLE soso_shopper_sessions ALTER COLUMN last_active_at SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS soso_shopper_sessions_id_unique ON soso_shopper_sessions(id);
