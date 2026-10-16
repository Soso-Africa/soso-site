CREATE TABLE IF NOT EXISTS soso_shopper_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_scope text NOT NULL,
  commerce_origin text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('test', 'live')),
  auth_issuer text NOT NULL,
  auth_subject text NOT NULL,
  external_id text NOT NULL,
  remote_customer_id uuid NOT NULL,
  verified_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS soso_shopper_identity_unique
  ON soso_shopper_customers (merchant_scope, commerce_origin, environment, auth_issuer, auth_subject);
CREATE UNIQUE INDEX IF NOT EXISTS soso_shopper_external_unique
  ON soso_shopper_customers (merchant_scope, commerce_origin, environment, external_id);
CREATE UNIQUE INDEX IF NOT EXISTS soso_shopper_remote_unique
  ON soso_shopper_customers (merchant_scope, commerce_origin, environment, remote_customer_id);
