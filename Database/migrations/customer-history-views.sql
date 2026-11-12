-- Read-only views powering the Customer History modal — deliberately show
-- every agent's interactions with a customer, bypassing the per-agent RLS
-- scoping that the Callbacks/Follow-ups list pages enforce (those pages are
-- unaffected; only reads through these views widen). See
-- docs/superpowers/specs/2026-08-13-customer-history-design.md for why this
-- works: views inherit their owner's RLS-exemption, and every table here was
-- created by the same role that will own these views (the SQL Editor's
-- connecting role), which isn't FORCE-restricted.
-- Run this once in the Supabase SQL Editor.
-- Safe to run on a live database — purely additive, no RLS/policy changes.

CREATE OR REPLACE VIEW customer_callback_history AS
SELECT
  c.*,
  agent.full_name AS agent_name
FROM callbacks c
JOIN profiles agent ON agent.id = c.agent_id;

CREATE OR REPLACE VIEW customer_case_history AS
SELECT
  f.*,
  agent.full_name   AS agent_name,
  creator.full_name AS creator_name,
  cc.name           AS category_name
FROM followups f
JOIN profiles agent   ON agent.id = f.agent_id
JOIN profiles creator ON creator.id = f.created_by
LEFT JOIN case_categories cc ON cc.id = f.category_id;
