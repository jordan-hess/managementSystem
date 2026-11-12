-- Home page: agent recognition / kudos wall. Entries are logged by management on
-- behalf of customers (who have no login of their own), visible to everyone.
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS agent_kudos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES profiles(id),
  note text NOT NULL,
  customer_name text,
  created_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_kudos_agent_id ON agent_kudos (agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_kudos_created_at ON agent_kudos (created_at DESC);