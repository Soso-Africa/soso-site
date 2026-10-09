-- Additive mail workspace storage. Passwords are AES-GCM sealed by the API,
-- never returned to browsers. No existing subscriber list is imported.
CREATE TABLE IF NOT EXISTS soso_mail_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK (id), settings jsonb NOT NULL,
 password_ciphertext text NOT NULL, version integer NOT NULL DEFAULT 1,
 tested_version integer, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS soso_newsletter_subscribers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','unsubscribed')),
 policy_version text NOT NULL DEFAULT 'newsletter-v1', consented_at timestamptz NOT NULL DEFAULT now(),
 confirmed_at timestamptz, unsubscribed_at timestamptz, last_confirmation_at timestamptz
);
CREATE TABLE IF NOT EXISTS soso_newsletter_links (
 token_hash text PRIMARY KEY, subscriber_id uuid NOT NULL REFERENCES soso_newsletter_subscribers(id) ON DELETE CASCADE,
 purpose text NOT NULL CHECK(purpose IN ('confirm','unsubscribe')), expires_at timestamptz
);
CREATE TABLE IF NOT EXISTS soso_mail_campaigns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subject text NOT NULL, body_text text NOT NULL,
 created_by uuid NOT NULL REFERENCES soso_staff_users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS soso_mail_sends (
 id uuid PRIMARY KEY, recipient text NOT NULL, subject text NOT NULL, kind text NOT NULL,
 status text NOT NULL DEFAULT 'sending' CHECK(status IN ('sending','accepted','uncertain')), body_hash text NOT NULL,
 created_by uuid REFERENCES soso_staff_users(id), campaign_id uuid REFERENCES soso_mail_campaigns(id),
 subscriber_id uuid REFERENCES soso_newsletter_subscribers(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(campaign_id,subscriber_id)
);
CREATE INDEX IF NOT EXISTS soso_mail_sends_hour_idx ON soso_mail_sends(created_at);
CREATE TABLE IF NOT EXISTS soso_mail_rate_limits (
 key text PRIMARY KEY, count integer NOT NULL, reset_at timestamptz NOT NULL
);
