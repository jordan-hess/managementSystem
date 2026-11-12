# Management System

An operations management platform for customer-care teams, built with **Next.js 16** and **Postgres**: agent workflow, customers, callbacks and follow-ups, team rostering, leave/overtime requests, warnings, coaching, QA scorecards, and a queue board.

> This is a portfolio copy. It contains no production data or credentials and connects to nothing: there is no login, and the data lives in an in-memory database built at startup.

## Getting started

```bash
npm install
npm run dev
```

No `.env.local` is needed. On first request the app builds an in-memory Postgres (PGlite, running in-process) from `Database/`: `schema.sql`, the feature schema files, then `Database/migrations/`, followed by `Database/local/` (stand-ins for old Supabase objects, plus final-state fixes) and `Database/seeds/` (one demo user per role, sample customers). It takes a few seconds, and all data resets when the server restarts.

A modal asks which role to use the app as (agent, T3, QA analyst, team leader, admin, management, HOD). Switch any time from the button above **Sign out** in the sidebar; **Sign out** brings the modal back.

## Testing

```bash
npm test
npm run lint
```

See `MANUAL.md` for the end-user manual.
