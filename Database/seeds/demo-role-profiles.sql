-- One active profile per role for the role-select modal
-- (components/layout/RoleSwitcher.tsx, lib/auth/demoRole.ts).
-- Loaded into the local in-memory database (lib/db/local/bootstrap.ts) after
-- every migration and Database/local/overrides.sql. There is no login: the
-- demo_role cookie picks which of these the request acts as.

INSERT INTO profiles (id, email, full_name, role, is_active)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'demo.agent@example.com',       'Demo Agent',       'agent',       TRUE),
  ('00000000-0000-4000-8000-000000000002', 'demo.t3@example.com',          'Demo T3',          't3',          TRUE),
  ('00000000-0000-4000-8000-000000000003', 'demo.qa_analyst@example.com',  'Demo QA Analyst',  'qa_analyst',  TRUE),
  ('00000000-0000-4000-8000-000000000004', 'demo.team_leader@example.com', 'Demo Team Leader', 'team_leader', TRUE),
  ('00000000-0000-4000-8000-000000000005', 'demo.admin@example.com',       'Demo Admin',       'admin',       TRUE),
  ('00000000-0000-4000-8000-000000000006', 'demo.management@example.com',  'Demo Manager',     'management',  TRUE),
  ('00000000-0000-4000-8000-000000000007', 'demo.hod@example.com',         'Demo HOD',         'hod',         TRUE)
ON CONFLICT DO NOTHING;
