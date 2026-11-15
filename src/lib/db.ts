import "server-only";
import { databaseUrl, env } from "./env";
import { SCHEMA_SQL } from "./schema";

/** Minimal query interface shared by node-postgres (production) and PGlite (local/dev/tests). */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

/** Postgres DATE columns stay "YYYY-MM-DD" strings so they never shift by timezone. */
export const DATE_OID = 1082;

declare global {
  var __carecircleDb: Promise<Db> | undefined;
}

async function connectPostgres(url: string): Promise<Db> {
  const { Pool, types } = await import("pg");
  types.setTypeParser(DATE_OID, (v: string) => v);
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const pool = new Pool({
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 10_000,
    // Managed Postgres (Neon) presents a publicly trusted certificate: always verify it.
    ssl: isLocal ? undefined : { rejectUnauthorized: true },
  });
  pool.on("error", (err) => console.error("postgres pool error", err.message));
  // A multi-statement simple query runs in one implicit transaction; the advisory
  // lock stops concurrent cold starts from racing on CREATE TABLE.
  await pool.query(`SELECT pg_advisory_xact_lock(4242);\n${SCHEMA_SQL}`);
  return pool as unknown as Db;
}

async function connectEmbedded(): Promise<Db> {
  // No database configured: an embedded Postgres runs the same SQL with zero setup.
  const { PGlite } = await import("@electric-sql/pglite");
  const lite = new PGlite(env().PGLITE_DIR ?? "./.pglite", { parsers: { [DATE_OID]: (v: string) => v } });
  await lite.exec(SCHEMA_SQL);
  return lite as unknown as Db;
}

/** Lazily created, process-wide database handle with the schema applied. */
export function getDb(): Promise<Db> {
  if (!globalThis.__carecircleDb) {
    const url = databaseUrl();
    globalThis.__carecircleDb = (url ? connectPostgres(url) : connectEmbedded()).catch((err) => {
      globalThis.__carecircleDb = undefined;
      throw err;
    });
  }
  return globalThis.__carecircleDb;
}
