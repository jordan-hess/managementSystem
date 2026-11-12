-- QA Management System — Part 2: assessments, interactions, scores.
-- Visibility mirrors warnings' exact nuance (management = global, admin who
-- is a team leader = own team only, plain admin = broad, assessed agent =
-- self only). Editing is assessor-only, matching warnings' issuer-only rule.
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS qa_assessments (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id            uuid NOT NULL REFERENCES qa_templates(id) ON DELETE RESTRICT,
  agent_id               uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  assessor_id            uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  assessment_date        date NOT NULL DEFAULT CURRENT_DATE,
  reference_total_count  integer,
  reference_target_count integer,
  total_score            numeric(6,2) NOT NULL DEFAULT 0,
  max_possible_score     numeric(6,2) NOT NULL DEFAULT 0,
  overall_percentage     numeric(5,2) NOT NULL DEFAULT 0,
  overall_outcome        text NOT NULL DEFAULT 'pass' CHECK (overall_outcome IN ('pass', 'fail')),
  fail_reason            text,
  coaching_required      boolean NOT NULL DEFAULT false,
  coaching_date          date,
  coaching_reason        text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qa_assessments_agent_id        ON qa_assessments (agent_id);
CREATE INDEX IF NOT EXISTS idx_qa_assessments_assessor_id     ON qa_assessments (assessor_id);
CREATE INDEX IF NOT EXISTS idx_qa_assessments_template_id     ON qa_assessments (template_id);
CREATE INDEX IF NOT EXISTS idx_qa_assessments_assessment_date ON qa_assessments (assessment_date);

CREATE TABLE IF NOT EXISTS qa_assessment_interactions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id      uuid NOT NULL REFERENCES qa_assessments(id) ON DELETE CASCADE,
  sort_order         integer NOT NULL DEFAULT 0,
  interaction_date   date,
  customer_email     text,
  reference_number   text,
  total_score        numeric(6,2) NOT NULL DEFAULT 0,
  max_possible_score numeric(6,2) NOT NULL DEFAULT 0,
  percentage         numeric(5,2) NOT NULL DEFAULT 0,
  outcome            text NOT NULL DEFAULT 'pass' CHECK (outcome IN ('pass', 'fail')),
  fail_reason        text,
  improvement_notes  text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qa_assessment_interactions_assessment_id ON qa_assessment_interactions (assessment_id);

CREATE TABLE IF NOT EXISTS qa_assessment_scores (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interaction_id        uuid NOT NULL REFERENCES qa_assessment_interactions(id) ON DELETE CASCADE,
  criterion_id           uuid NOT NULL REFERENCES qa_template_criteria(id) ON DELETE RESTRICT,
  points_awarded         numeric(5,2) NOT NULL DEFAULT 0 CHECK (points_awarded >= 0),
  max_points_snapshot    numeric(5,2) NOT NULL,
  importance_snapshot    text NOT NULL CHECK (importance_snapshot IN ('normal', 'critical')),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (interaction_id, criterion_id),
  CHECK (points_awarded <= max_points_snapshot)
);
CREATE INDEX IF NOT EXISTS idx_qa_assessment_scores_interaction_id ON qa_assessment_scores (interaction_id);
CREATE INDEX IF NOT EXISTS idx_qa_assessment_scores_criterion_id  ON qa_assessment_scores (criterion_id);

-- ── Helper functions (reused across all three tables' RLS) ─────────────────

CREATE OR REPLACE FUNCTION qa_can_view_assessment(p_assessment_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM qa_assessments a
    WHERE a.id = p_assessment_id
      AND (
        a.agent_id = (select auth.uid())
        OR EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'management')
        OR (
          EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin')
          AND is_submitter_team_leader((select auth.uid()))
          AND a.agent_id <> (select auth.uid())
          AND EXISTS (
            SELECT 1 FROM team_members tm
            JOIN team_leaders tl ON tl.team_id = tm.team_id
            WHERE tl.profile_id = (select auth.uid()) AND tm.profile_id = a.agent_id
          )
        )
        OR (
          EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin')
          AND NOT is_submitter_team_leader((select auth.uid()))
        )
      )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION qa_can_edit_assessment(p_assessment_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM qa_assessments a WHERE a.id = p_assessment_id AND a.assessor_id = (select auth.uid())
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;