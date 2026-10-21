// Postgres connection pool (node-postgres) with TLS settings for Supabase
import { readFileSync } from "fs";
import type { ConnectionOptions } from "tls";
import { Pool, types } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

// TLS for the Postgres connection.
//
// Default (nothing set): encrypted but WITHOUT server-certificate verification
// (`rejectUnauthorized: false`). This is the long-standing behavior — Supabase's pooler
// presents a cert that isn't in the system trust store, so verifying against system CAs
// fails and takes the connection down. The link is still encrypted; it just isn't
// authenticated, which leaves it MITM-able in principle.
//
// To turn on verification without risking an outage, set ONE of these env vars:
//   • DATABASE_CA_CERT — the provider's CA certificate, either the PEM text itself
//     (Railway supports multi-line values) or a path to a .pem file. Verifies against it.
//   • DATABASE_SSL_STRICT=true — verify against the system CA store (use only if the DB
//     cert is publicly trusted; no custom CA needed).
// Either one flips `rejectUnauthorized` on. Leaving both unset keeps today's behavior, so
// this change cannot break an existing deployment.
function buildSsl(): ConnectionOptions | false {
  // Local dev / test only: a bare local Postgres (e.g. a throwaway Docker container used by the
  // timezone-scoring test harness) speaks no SSL, and `rejectUnauthorized:false` still *requests*
  // it — the handshake then fails outright. This escape hatch turns SSL off entirely. Defaults
  // OFF, so production (which never sets it) is completely unaffected.
  if (process.env.DATABASE_SSL_DISABLE === "true") return false;
  const caEnv = process.env.DATABASE_CA_CERT?.trim();
  if (caEnv) {
    const ca = caEnv.startsWith("-----BEGIN") ? caEnv : readFileSync(caEnv, "utf8");
    return { ca, rejectUnauthorized: true };
  }
  if (process.env.DATABASE_SSL_STRICT === "true") {
    return { rejectUnauthorized: true };
  }
  return { rejectUnauthorized: false };
}

// node-postgres parses `date` columns into JS Date objects assuming local
// timezone, so `.toISOString()` on the result silently shifts by the local
// UTC offset (e.g. '2026-07-15' can round-trip as '2026-07-14T22:00:00.000Z').
// We treat dates as plain calendar days everywhere, so keep them as raw
// 'YYYY-MM-DD' strings instead of letting pg convert them.
const DATE_OID = 1082;
types.setTypeParser(DATE_OID, (val) => val);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: buildSsl(),
  // The Supabase pooler runs in SESSION mode (port 5432), so each pooled client holds one real
  // Postgres connection for its lifetime — `max` is a hard ceiling AND it must stay under the
  // pooler's own limit. That limit is 15 (`pool_size: 15`): build 16 set `max: 20`, which the
  // pooler rejected under load with FATAL `EMAXCONNSESSION` errors — every dashboard read then
  // 500'd and syncs failed, i.e. an empty app. 12 serves the dashboard's ~11 concurrent reads
  // without queueing and leaves ~3 connections' headroom (hourly insights job, /health checks,
  // the odd manual connection) below the 15 ceiling. If more headroom is ever needed, move
  // DATABASE_URL to the TRANSACTION pooler (port 6543), which multiplexes and lifts this cap.
  max: 12,
  // Never let a read wait indefinitely for a connection when the pool is momentarily saturated:
  // fail after 5s so the client's GET retry can recover it, instead of hanging past the app's
  // 20s request timeout and flipping the screen to the "couldn't load — Retry" state.
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
});
