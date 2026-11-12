-- QA Management System — Part 1: templates, sections, criteria.
-- Template-driven scorecard config: qa_templates -> qa_template_sections -> qa_template_criteria.
-- section_type is purely visual (drives light-blue/orange/red header colour in the UI) —
-- actual pass/fail behavior is decided per-criterion via `importance`, not inherited from
-- the section. Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS qa_templates (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key                         text NOT NULL UNIQUE,
  name                        text NOT NULL,
  is_active                   boolean NOT NULL DEFAULT true,
  interaction_noun_singular   text NOT NULL DEFAULT 'Interaction',
  interaction_date_label      text NOT NULL DEFAULT 'Date',
  interaction_email_label     text NOT NULL DEFAULT 'Customer Email',
  interaction_reference_label text NOT NULL DEFAULT 'Reference Number',
  sort_order                  integer NOT NULL DEFAULT 0,
  created_by                  uuid REFERENCES profiles(id),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qa_template_sections (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  uuid NOT NULL REFERENCES qa_templates(id) ON DELETE CASCADE,
  name         text NOT NULL,
  section_type text NOT NULL DEFAULT 'standard' CHECK (section_type IN ('standard', 'fail', 'critical_fail')),
  is_active    boolean NOT NULL DEFAULT true,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, name)
);
CREATE INDEX IF NOT EXISTS idx_qa_template_sections_template_id ON qa_template_sections (template_id);

CREATE TABLE IF NOT EXISTS qa_template_criteria (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES qa_template_sections(id) ON DELETE CASCADE,
  label      text NOT NULL,
  max_points numeric(5,2) NOT NULL DEFAULT 5 CHECK (max_points > 0),
  importance text NOT NULL DEFAULT 'normal' CHECK (importance IN ('normal', 'critical')),
  is_active  boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (section_id, label)
);
CREATE INDEX IF NOT EXISTS idx_qa_template_criteria_section_id ON qa_template_criteria (section_id);