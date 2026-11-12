-- QA Management System — seeds the two initial templates (Socials - DMs,
-- Social - Calls) with their sections and criteria, verbatim from the source
-- spreadsheets. Idempotent — safe to re-run (ON CONFLICT DO NOTHING on the
-- natural keys added in qa-templates-schema.sql).

INSERT INTO qa_templates (key, name, interaction_noun_singular, interaction_date_label, interaction_email_label, interaction_reference_label, sort_order)
VALUES
  ('dm_social', 'Socials - DMs QA Scorecard', 'Case', 'Date of engagement', 'Customer email', 'Case number', 0),
  ('calls_social', 'Social - Calls QA Scorecard', 'Call', 'Date of Call', 'Customer email', 'Ticket ID/Station', 1)
ON CONFLICT (key) DO NOTHING;

-- ── Socials - DMs ──────────────────────────────────────────────────────────

INSERT INTO qa_template_sections (template_id, name, section_type, sort_order)
SELECT id, 'Ticket Process', 'standard', 0 FROM qa_templates WHERE key = 'dm_social'
UNION ALL
SELECT id, 'Soft Skills', 'standard', 1 FROM qa_templates WHERE key = 'dm_social'
UNION ALL
SELECT id, 'Fail', 'fail', 2 FROM qa_templates WHERE key = 'dm_social'
UNION ALL
SELECT id, 'Critical Fail', 'critical_fail', 3 FROM qa_templates WHERE key = 'dm_social'
ON CONFLICT (template_id, name) DO NOTHING;

INSERT INTO qa_template_criteria (section_id, label, max_points, importance, sort_order)
SELECT s.id, c.label, c.max_points, c.importance, c.sort_order
FROM qa_template_sections s
JOIN qa_templates t ON t.id = s.template_id AND t.key = 'dm_social'
JOIN (VALUES
  ('Ticket Process',  'Did the agent close the ticket on correct status?', 5, 'normal', 0),
  ('Ticket Process',  'Any spelling or grammar errors?',                   5, 'normal', 1),
  ('Ticket Process',  'Did the agent leave internal notes?',               5, 'normal', 2),
  ('Ticket Process',  'Was the loop closed publicly?',                     5, 'normal', 3),
  ('Ticket Process',  'Was the response personalized?',                   5, 'normal', 4),
  ('Soft Skills',     'Matched the brand tone?',                       5, 'normal', 0),
  ('Soft Skills',     'Addressed customer''s needs?',                     5, 'normal', 1),
  ('Soft Skills',     'Promoted self-help?',                              5, 'normal', 2),
  ('Soft Skills',     'Clear message if unreachable?',                    5, 'normal', 3),
  ('Soft Skills',     'Reviewed customer history?',                       5, 'normal', 4),
  ('Fail',            'Handled within SLA?',                             10, 'critical', 0),
  ('Critical Fail',   'Resolution appropriate?',                         10, 'critical', 0),
  ('Critical Fail',   'Call after first solution failed?',               10, 'critical', 1)
) AS c(section_name, label, max_points, importance, sort_order) ON c.section_name = s.name
ON CONFLICT (section_id, label) DO NOTHING;

-- ── Social - Calls ─────────────────────────────────────────────────────────

INSERT INTO qa_template_sections (template_id, name, section_type, sort_order)
SELECT id, 'Introduction', 'standard', 0 FROM qa_templates WHERE key = 'calls_social'
UNION ALL
SELECT id, 'Handling Skills', 'standard', 1 FROM qa_templates WHERE key = 'calls_social'
UNION ALL
SELECT id, 'Soft Skills', 'standard', 2 FROM qa_templates WHERE key = 'calls_social'
UNION ALL
SELECT id, 'Fail', 'fail', 3 FROM qa_templates WHERE key = 'calls_social'
UNION ALL
SELECT id, 'Critical Fail', 'critical_fail', 4 FROM qa_templates WHERE key = 'calls_social'
ON CONFLICT (template_id, name) DO NOTHING;

INSERT INTO qa_template_criteria (section_id, label, max_points, importance, sort_order)
SELECT s.id, c.label, c.max_points, c.importance, c.sort_order
FROM qa_template_sections s
JOIN qa_templates t ON t.id = s.template_id AND t.key = 'calls_social'
JOIN (VALUES
  ('Introduction',     'Friendly, confident tone?',                          5, 'normal', 0),
  ('Introduction',     'Customer verified?',                                 5, 'normal', 1),
  ('Introduction',     'Call recording mentioned?',                         5, 'normal', 2),
  ('Handling Skills',  'Good listening, understood and addressed issue?',   5, 'normal', 0),
  ('Handling Skills',  'Assisted with troubleshooting/resolution?',         5, 'normal', 1),
  ('Soft Skills',      'Promoted self-service?',                           5, 'normal', 0),
  ('Soft Skills',      'Offered further help?',                            5, 'normal', 1),
  ('Fail',             'Internal notes added?',                            10, 'critical', 0),
  ('Fail',             'Shared personal details?',                         10, 'critical', 1),
  ('Critical Fail',    'Any rude/inappropriate behavior?',                 10, 'critical', 0),
  ('Critical Fail',    'Misled the customer?',                             10, 'critical', 1)
) AS c(section_name, label, max_points, importance, sort_order) ON c.section_name = s.name
ON CONFLICT (section_id, label) DO NOTHING;
