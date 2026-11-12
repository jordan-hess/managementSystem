-- Backs lib/auth/rateLimit.ts. Added 2026-09-16 (production-readiness
-- audit, finding H3) - there was previously no rate limiting anywhere on
-- the auth surface (login, password-reset requests).
--
-- A table rather than an in-memory counter, because every pod shares one
-- Postgres and there's no Redis in this deployment (see CLAUDE.md) - an
-- in-process counter wouldn't be shared across replicas.

CREATE TABLE IF NOT EXISTS auth_rate_limit_events (
  id BIGSERIAL PRIMARY KEY,
  scope TEXT NOT NULL,
  identifier TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_rate_limit_scope_identifier_created_at
  ON auth_rate_limit_events (scope, identifier, created_at);
