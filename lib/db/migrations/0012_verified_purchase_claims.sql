CREATE TABLE IF NOT EXISTS soso_purchase_conversion_claims (
  attempt_id uuid PRIMARY KEY REFERENCES soso_commerce_checkout_attempts(id) ON DELETE CASCADE,
  event_id uuid NOT NULL UNIQUE,
  claimed_at timestamptz NOT NULL DEFAULT now()
);
