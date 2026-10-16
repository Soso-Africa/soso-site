CREATE TABLE IF NOT EXISTS soso_shopper_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  email_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS soso_shopper_sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES soso_shopper_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS soso_shopper_sessions_user_idx ON soso_shopper_sessions(user_id);
CREATE TABLE IF NOT EXISTS soso_shopper_auth_tokens (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES soso_shopper_users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
  password_version text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS soso_shopper_auth_tokens_user_idx ON soso_shopper_auth_tokens(user_id, purpose);
CREATE TABLE IF NOT EXISTS soso_shopper_auth_limits (
  key text PRIMARY KEY,
  hits integer NOT NULL,
  expires_at timestamptz NOT NULL
);
