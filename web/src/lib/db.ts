/**
 * Postgres client for server components. Read-only by convention (and by role, once
 * migration 0006's `web_reader` is the user in DATABASE_URL).
 *
 * DATABASE_URL must be Supabase's **session pooler** URI (IPv4; the direct host is IPv6-only
 * and unreachable from Vercel). Session mode keeps server-side prepared statements valid.
 * If it ever becomes the transaction pooler (port 6543), add `prepare: false` below.
 *
 * `max: 3` per instance and force-dynamic pages (16 rows a request) keep the pooler's small connection
 * budget mostly idle. The value of DATABASE_URL is never logged.
 */
import postgres, { type Sql } from "postgres";

declare global {
  var __nflEdgeSql: Sql | undefined;
}

export function sql(): Sql {
  if (globalThis.__nflEdgeSql) return globalThis.__nflEdgeSql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (web/.env.local locally, project env on Vercel)");
  const client = postgres(url, {
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: "require",
    // numeric/decimal come back as strings by default; the queries cast to float8 instead.
  });
  globalThis.__nflEdgeSql = client; // one pool per process; survives dev HMR
  return client;
}
