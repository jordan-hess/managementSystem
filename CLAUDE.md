# CLAUDE.md

@AGENTS.md

- Next.js 16: middleware lives in `proxy.ts` (exported function `proxy`); `cookies()`, `params` and `searchParams` are async.
- Data access goes through `lib/db/pool.ts` (`sql` tagged template). Authorization checks live in `lib/auth/authz.ts`.
- This copy connects to no database and has no auth. `sql` runs on an in-process, in-memory PGlite built from `Database/` on first use (`lib/db/local/bootstrap.ts`); `lib/db/local/sqlAdapter.ts` implements the postgres.js subset the code uses (`sql(list)`, `sql('ident')`, `SET ${sql(obj)}`, `sql.json`, `sql.begin`). `postgres` is a types-only dev dependency.
- Identity is the `demo_role` cookie set by the role-select modal (`components/layout/RoleSwitcher.tsx`); `getCurrentUserId()` resolves it to a seeded profile (`Database/seeds/demo-role-profiles.sql`), defaulting to admin until a role is picked.
- New schema/migration files are picked up automatically; fix replay-order problems in `Database/local/overrides.sql`.
