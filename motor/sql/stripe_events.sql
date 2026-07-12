-- Idempotencia webhook Stripe (anti-replay)
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS stripe_events (
  event_id     TEXT PRIMARY KEY,
  event_type   TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_processed_at
  ON stripe_events (processed_at DESC);

COMMENT ON TABLE stripe_events IS 'Eventos webhook Stripe ya procesados (idempotencia)';
