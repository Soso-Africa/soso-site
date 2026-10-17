-- Additive only: legacy plain-text campaigns and all recipients remain intact.
-- Attachment bytes are transient; they are never stored in PostgreSQL.
ALTER TABLE soso_mail_campaigns ADD COLUMN IF NOT EXISTS body_html text;
