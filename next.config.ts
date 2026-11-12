import type { NextConfig } from "next";

const nextConfig: NextConfig = {


  reactCompiler: true,
  output: "standalone",

  // The local in-memory database (lib/db/local/): PGlite loads its own
  // .wasm/.data files at runtime, so it must not be bundled, and the schema
  // it builds from is read from Database/ at startup.
  serverExternalPackages: ["@electric-sql/pglite"],
  outputFileTracingIncludes: {
    "/**": ["./Database/**/*.sql", "./node_modules/@electric-sql/pglite/dist/**/*"],
  },

  // Phase 2 (unified Tickets page) — /customers, /support-tickets, and
  // every /t2 route are retired in favor of /tickets. Order matters:
  // redirects() entries are evaluated in array order, first match wins, so
  // the two more-specific static T2 sub-paths must be listed before the
  // dynamic /t2/:id catch-all, and that in turn before the bare /t2 ->
  // /tickets fallback, or they'd never be reached. /t2/:id preserves the
  // ticket id at its new location so a bookmarked/shared link still resolves
  // to the same ticket.
  async redirects() {
    return [
      // /tickets/sla-breaches itself is retired (Management Reporting
      // Dashboard redesign — escalation visibility is now the existing
      // "Escalated" status badge on every ticket, not a dedicated page).
      { source: "/t2/sla-breaches", destination: "/tickets", permanent: true },
      { source: "/tickets/sla-breaches", destination: "/tickets", permanent: true },
      { source: "/t2/queues", destination: "/tickets/queue-assignment", permanent: true },
      { source: "/t2/:id", destination: "/tickets/t2/:id", permanent: true },
      { source: "/t2", destination: "/tickets", permanent: true },
      { source: "/support-tickets", destination: "/tickets", permanent: true },
      { source: "/customers", destination: "/tickets", permanent: true },
    ];
  },

};

export default nextConfig;
