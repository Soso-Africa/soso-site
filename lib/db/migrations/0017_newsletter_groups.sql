-- Additive only: existing subscribers, consent and campaigns are preserved.
CREATE TABLE IF NOT EXISTS soso_newsletter_groups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS soso_newsletter_groups_name_idx ON soso_newsletter_groups(lower(name));
CREATE TABLE IF NOT EXISTS soso_newsletter_group_members (
 group_id uuid NOT NULL REFERENCES soso_newsletter_groups(id) ON DELETE CASCADE,
 subscriber_id uuid NOT NULL REFERENCES soso_newsletter_subscribers(id) ON DELETE CASCADE,
 PRIMARY KEY(group_id,subscriber_id)
);
CREATE INDEX IF NOT EXISTS soso_newsletter_members_subscriber_idx ON soso_newsletter_group_members(subscriber_id);
ALTER TABLE soso_mail_campaigns ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES soso_newsletter_groups(id) ON DELETE RESTRICT;
