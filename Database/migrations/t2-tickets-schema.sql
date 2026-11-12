-- T2 Queue Hub merge — ticket/escalation/SLA/queue domain tables.
--
-- Translated from T2 Queue Hub's own abandoned Postgres migration attempt
-- (backend/src/db/schema.sql + compat.sql at its git commit 309affc),
-- itself a direct, previously-validated translation of the SQLite schema in
-- backend/src/db.js. Two changes from that original translation:
--   1. BIGSERIAL PKs -> uuid PKs (gen_random_uuid()), matching every other
--      table in this app. A `legacy_id bigint` column is kept on each table
--      for traceability back to the SQLite source during data migration —
--      nothing user-facing ever shows it (tickets use ticket_number).
--   2. FKs that pointed at a standalone `users` table now point at
--      `profiles(id)` — see add-team-leader-and-t3-roles.sql for the role/
--      username/t2_team columns added to profiles to carry T2 users there.
--
-- Timestamps are deliberately kept as TEXT in 'YYYY-MM-DD HH:MM:SS' format
-- (not native timestamptz) because backend/src/utils/sla.js's computeSla()
-- parses/compares them as such — porting that logic as-is (per the merge
-- plan) was judged lower-risk than also converting its date handling.
-- datetime()/date() shims below let any ported SQL text using SQLite's
-- datetime('now')/date('now') keep working unchanged.

CREATE OR REPLACE FUNCTION datetime(text) RETURNS text AS $$
  SELECT CASE
    WHEN $1 = 'now' THEN to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI:SS')
    ELSE $1
  END;
$$ LANGUAGE SQL IMMUTABLE;

CREATE OR REPLACE FUNCTION date(text) RETURNS text AS $$
  SELECT CASE
    WHEN $1 = 'now' THEN to_char(current_date, 'YYYY-MM-DD')
    ELSE substring($1 from 1 for 10)
  END;
$$ LANGUAGE SQL IMMUTABLE;

CREATE TABLE IF NOT EXISTS tickets (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id             bigint UNIQUE,
  ticket_number         TEXT UNIQUE NOT NULL,
  queue                 TEXT NOT NULL,
  issue_type            TEXT NOT NULL,
  description           TEXT,
  address               TEXT,
  plus_code             TEXT,
  imsi                  TEXT,
  msisdn                TEXT,
  customer_email        TEXT,
  regular_site          TEXT,
  provisioning_status   TEXT,
  escalation_destination TEXT, -- denormalized: the team of the most recent escalation, if any
  status                TEXT NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open','in_progress','escalated','awaiting_t3','t3_responded','resolved','closed')),
  created_by            uuid NOT NULL REFERENCES profiles(id),
  assigned_to           uuid REFERENCES profiles(id),
  created_at            TEXT DEFAULT (to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI:SS')),
  routed_at             TEXT,
  acknowledged_at       TEXT,
  resolved_at           TEXT,
  closed_at             TEXT,
  response_breached     INTEGER DEFAULT 0,
  resolution_breached   INTEGER DEFAULT 0,
  rsrp                  TEXT,
  rsrq                  TEXT,
  sinr                  TEXT,
  project               TEXT,
  root_cause            TEXT,
  serving_site          TEXT,
  connected_site        TEXT,
  band                  TEXT,
  network_technology    TEXT,
  download_speed        TEXT,
  upload_speed          TEXT,
  latency               TEXT
);

CREATE TABLE IF NOT EXISTS ticket_escalations (
  id                                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id                          bigint UNIQUE,
  ticket_id                          uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  escalate_to                        TEXT NOT NULL,
  escalation_reason                  TEXT NOT NULL,
  technical_findings                 TEXT,
  troubleshooting_already_performed  TEXT,
  regular_site                       TEXT,
  serving_site                       TEXT,
  station_reference_ticket           TEXT,
  agent_notes                        TEXT,
  priority                           TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  status                             TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','responded','validated','rejected')),
  created_by                         uuid REFERENCES profiles(id),
  created_at                         TEXT DEFAULT (to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI:SS')),
  t3_acknowledged_by                 uuid REFERENCES profiles(id),
  t3_acknowledged_at                 TEXT,
  t3_response                        TEXT,
  t3_response_by                     uuid REFERENCES profiles(id),
  t3_response_at                     TEXT,
  t2_validation_result               TEXT CHECK (t2_validation_result IN ('resolved','rejected')),
  t2_validated_by                    uuid REFERENCES profiles(id),
  t2_validated_at                    TEXT,
  t2_validation_note                 TEXT
);

CREATE TABLE IF NOT EXISTS ticket_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id  bigint UNIQUE,
  ticket_id  uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES profiles(id),
  event_type TEXT NOT NULL, -- created, routed, acknowledged, note, status_change, resolved, closed, attachment
  note       TEXT,
  created_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS attachments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id     bigint UNIQUE,
  ticket_id     uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  filename      TEXT NOT NULL,
  original_name TEXT NOT NULL,
  uploaded_by   uuid REFERENCES profiles(id),
  escalation_id uuid REFERENCES ticket_escalations(id),
  created_at    TEXT DEFAULT (to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS agent_queue_assignments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id   bigint UNIQUE,
  user_id     uuid NOT NULL REFERENCES profiles(id),
  date        TEXT NOT NULL,  -- 'YYYY-MM-DD'; one row per agent per day
  queue       TEXT NOT NULL CHECK (queue IN ('ADVANCED','SIM SWAP','VOICE','PORTING')),
  assigned_by uuid REFERENCES profiles(id),
  updated_at  TEXT DEFAULT (to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI:SS')),
  UNIQUE (user_id, date)
);

CREATE TABLE IF NOT EXISTS ticket_solutions (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id                   bigint UNIQUE,
  ticket_id                   uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  agent_id                    uuid REFERENCES profiles(id),
  troubleshooting_performed   TEXT,
  findings                    TEXT,
  solution                    TEXT,
  outcome                     TEXT CHECK (outcome IN ('resolved','customer_to_monitor','escalated','unresolved')),
  review_status               TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','approved','edited','rejected')),
  approved_solution           TEXT,
  reviewed_by                 uuid REFERENCES profiles(id),
  reviewed_at                 TEXT,
  review_note                 TEXT,
  escalation_id               uuid REFERENCES ticket_escalations(id),
  created_at                  TEXT DEFAULT (to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS ai_knowledge (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id          bigint UNIQUE,
  ticket_id          uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  ticket_solution_id uuid NOT NULL UNIQUE REFERENCES ticket_solutions(id) ON DELETE CASCADE,
  problem            TEXT,
  symptoms           TEXT,
  root_cause         TEXT,
  rsrp               TEXT,
  rsrq               TEXT,
  sinr               TEXT,
  regular_site       TEXT,
  queue              TEXT,
  troubleshooting    TEXT,
  solution           TEXT,
  result             TEXT,
  escalation_reason  TEXT,
  t3_team            TEXT,
  t3_findings        TEXT,
  created_at         TEXT DEFAULT (to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI:SS'))
);

CREATE TABLE IF NOT EXISTS custom_options (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id  bigint UNIQUE,
  category   TEXT NOT NULL CHECK (category IN ('root_cause','issue_type')),
  value      TEXT NOT NULL,
  created_by uuid REFERENCES profiles(id),
  created_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI:SS')),
  UNIQUE (category, value)
);

-- "Call back requested" outcome schedules a follow-up rather than
-- resolving/escalating the ticket. assigned_to starts as whoever scheduled
-- it, but a Team Lead can hand it to another agent.
CREATE TABLE IF NOT EXISTS scheduled_callbacks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id    bigint UNIQUE,
  ticket_id    uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  created_by   uuid REFERENCES profiles(id),
  assigned_to  uuid REFERENCES profiles(id),
  scheduled_at TEXT NOT NULL,
  note         TEXT,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','cancelled')),
  created_at   TEXT DEFAULT (to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI:SS')),
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_tickets_status      ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_queue       ON tickets(queue);
CREATE INDEX IF NOT EXISTS idx_tickets_dest        ON tickets(escalation_destination);
CREATE INDEX IF NOT EXISTS idx_events_ticket       ON ticket_events(ticket_id);
CREATE INDEX IF NOT EXISTS idx_aqa_queue           ON agent_queue_assignments(queue);
CREATE INDEX IF NOT EXISTS idx_aqa_date            ON agent_queue_assignments(date);
CREATE INDEX IF NOT EXISTS idx_solutions_ticket    ON ticket_solutions(ticket_id);
CREATE INDEX IF NOT EXISTS idx_solutions_review    ON ticket_solutions(review_status);
CREATE INDEX IF NOT EXISTS idx_knowledge_problem   ON ai_knowledge(problem);
CREATE INDEX IF NOT EXISTS idx_escalations_ticket  ON ticket_escalations(ticket_id);
CREATE INDEX IF NOT EXISTS idx_escalations_team    ON ticket_escalations(escalate_to);
CREATE INDEX IF NOT EXISTS idx_escalations_status  ON ticket_escalations(status);
CREATE INDEX IF NOT EXISTS idx_callbacks_ticket    ON scheduled_callbacks(ticket_id);
CREATE INDEX IF NOT EXISTS idx_callbacks_assigned  ON scheduled_callbacks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_callbacks_status    ON scheduled_callbacks(status);
