-- Holistic QA Platform (Phase 1) — new weighted-scoring QA system, parallel to
-- (and independent of) the existing qa_templates/qa_assessments system, which
-- stays untouched. No RLS — this app enforces authorization in app code
-- (lib/auth/authz.ts), not the database. Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS qa_criteria (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL,
  channel     text CHECK (channel IN ('calls', 'social_media', 'tier2') OR channel IS NULL),
  label       text NOT NULL,
  weight      numeric(5,2) NOT NULL CHECK (weight > 0 AND weight <= 100),
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
-- channel IS NULL = "applies to all channels unless overridden" — a
-- future-flexibility mechanism the schema supports, but Phase 1 seeds only
-- channel-scoped rows (see qa-platform-seed-criteria-and-ratings.sql), zero
-- NULL rows. Two partial unique indexes since Postgres treats multiple NULLs
-- as distinct under a plain UNIQUE(code, channel).
CREATE UNIQUE INDEX IF NOT EXISTS qa_criteria_code_global_uq ON qa_criteria (code) WHERE channel IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS qa_criteria_code_channel_uq ON qa_criteria (code, channel) WHERE channel IS NOT NULL;
CREATE INDEX IF NOT EXISTS qa_criteria_channel_idx ON qa_criteria (channel);

CREATE TABLE IF NOT EXISTS qa_rating_definitions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  criterion_id    uuid NOT NULL REFERENCES qa_criteria(id) ON DELETE CASCADE,
  channel         text CHECK (channel IN ('calls', 'social_media', 'tier2') OR channel IS NULL),
  rating          smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  definition_text text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
-- Rating 0's "Critical Failure" catch-all text is a code constant
-- (lib/qa/constants.ts RATING_ZERO_TEXT), not a row here — identical across
-- every criterion, so a DB row per criterion would be 7x redundant.
CREATE UNIQUE INDEX IF NOT EXISTS qa_rating_def_global_uq ON qa_rating_definitions (criterion_id, rating) WHERE channel IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS qa_rating_def_channel_uq ON qa_rating_definitions (criterion_id, channel, rating) WHERE channel IS NOT NULL;

CREATE TABLE IF NOT EXISTS qa_thresholds (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  min_score       numeric(5,2) NOT NULL CHECK (min_score >= 0),
  max_score       numeric(5,2) NOT NULL CHECK (max_score <= 100),
  effective_from  date NOT NULL,
  effective_to    date,
  active          boolean NOT NULL DEFAULT true,
  sort_order      integer NOT NULL DEFAULT 0,
  created_by      uuid REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (min_score <= max_score),
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);
CREATE INDEX IF NOT EXISTS qa_thresholds_window_idx ON qa_thresholds (effective_from, effective_to);

CREATE TABLE IF NOT EXISTS qa_critical_failure_types (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     text NOT NULL UNIQUE,
  description              text,
  auto_fail                boolean NOT NULL DEFAULT true,
  caps_max_score           numeric(5,2) CHECK (caps_max_score IS NULL OR (caps_max_score >= 0 AND caps_max_score <= 100)),
  requires_manager_review  boolean NOT NULL DEFAULT false,
  requires_coaching        boolean NOT NULL DEFAULT false,
  is_active                boolean NOT NULL DEFAULT true,
  sort_order               integer NOT NULL DEFAULT 0,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qa_reviews (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id                 uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  reviewer_id              uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  channel                  text NOT NULL CHECK (channel IN ('calls', 'social_media', 'tier2')),
  origin                   text,
  interaction_date         date NOT NULL,
  review_date              date NOT NULL DEFAULT CURRENT_DATE,
  interaction_type         text,
  ticket_reference         text,
  customer_reference       text,
  -- pre-cap, post-N/A-reweight
  raw_weighted_percentage  numeric(6,2) NOT NULL DEFAULT 0,
  -- after critical-failure cap (== raw if uncapped) — this is the number
  -- displayed and used for threshold-band resolution.
  final_percentage         numeric(6,2) NOT NULL DEFAULT 0,
  -- sum of weights marked N/A, for audit/visibility
  na_weight_excluded       numeric(5,2) NOT NULL DEFAULT 0,
  has_critical_failure     boolean NOT NULL DEFAULT false,
  outcome_forced_fail      boolean NOT NULL DEFAULT false,
  outcome_band_id          uuid REFERENCES qa_thresholds(id) ON DELETE SET NULL,
  outcome_label_snapshot   text,
  overall_comments         text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (channel = 'calls' AND origin IS NULL)
    OR (channel = 'social_media' AND origin IN ('mybroadband', 'hellopeter', 'freescout', 'whatsapp', 'pissedconsumer'))
    OR (channel = 'tier2' AND origin IN ('advanced', 'sim_swap', 'voice', 'porting'))
  )
);
CREATE INDEX IF NOT EXISTS qa_reviews_agent_id_idx ON qa_reviews (agent_id);
CREATE INDEX IF NOT EXISTS qa_reviews_reviewer_id_idx ON qa_reviews (reviewer_id);
CREATE INDEX IF NOT EXISTS qa_reviews_channel_origin_idx ON qa_reviews (channel, origin);
CREATE INDEX IF NOT EXISTS qa_reviews_interaction_date_idx ON qa_reviews (interaction_date);

CREATE TABLE IF NOT EXISTS qa_scores (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id                 uuid NOT NULL REFERENCES qa_reviews(id) ON DELETE CASCADE,
  criterion_id              uuid NOT NULL REFERENCES qa_criteria(id) ON DELETE RESTRICT,
  criterion_label_snapshot  text NOT NULL,
  weight_snapshot           numeric(5,2) NOT NULL,
  rating                    smallint CHECK (rating BETWEEN 0 AND 5),
  is_na                     boolean NOT NULL DEFAULT false,
  na_reason                 text,
  weighted_score            numeric(6,2) NOT NULL DEFAULT 0,
  comments                  text,
  evidence                  text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, criterion_id),
  CHECK ((is_na = false AND rating IS NOT NULL) OR (is_na = true AND rating IS NULL)),
  -- DB-level backstop for the mandatory N/A reason, defense in depth
  -- alongside the app-code check in the review form.
  CHECK (is_na = false OR na_reason IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS qa_scores_review_id_idx ON qa_scores (review_id);
CREATE INDEX IF NOT EXISTS qa_scores_criterion_id_idx ON qa_scores (criterion_id);

CREATE TABLE IF NOT EXISTS qa_review_critical_failures (
  id                                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id                          uuid NOT NULL REFERENCES qa_reviews(id) ON DELETE CASCADE,
  critical_failure_type_id           uuid NOT NULL REFERENCES qa_critical_failure_types(id) ON DELETE RESTRICT,
  notes                              text NOT NULL,
  auto_fail_snapshot                 boolean NOT NULL,
  caps_max_score_snapshot            numeric(5,2),
  requires_manager_review_snapshot   boolean NOT NULL,
  requires_coaching_snapshot         boolean NOT NULL,
  created_by                         uuid REFERENCES profiles(id),
  created_at                         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, critical_failure_type_id)
);
CREATE INDEX IF NOT EXISTS qa_review_critical_failures_review_id_idx ON qa_review_critical_failures (review_id);

CREATE TABLE IF NOT EXISTS qa_audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id   uuid NOT NULL REFERENCES qa_reviews(id) ON DELETE CASCADE,
  actor_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  -- free text, not a CHECK enum: score_change, na_reason_change,
  -- comment_change, evidence_change, critical_failure_added,
  -- critical_failure_removed, critical_failure_notes_change,
  -- header_field_change. 'outcome_override' is reserved for a future
  -- manual-override feature, unused by Phase 1 code.
  action      text NOT NULL,
  field       text,
  old_value   text,
  new_value   text,
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS qa_audit_log_review_id_idx ON qa_audit_log (review_id);
CREATE INDEX IF NOT EXISTS qa_audit_log_actor_id_idx ON qa_audit_log (actor_id);
