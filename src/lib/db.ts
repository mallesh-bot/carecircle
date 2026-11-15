import "server-only";
import { SCHEMA_SQL } from "./schema";

/** Minimal query interface shared by node-postgres (production) and PGlite (local/dev). */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

declare global {
  // eslint-disable-next-line no-var
  var __carecircleDb: Promise<Db> | undefined;
}

const DATE_OID = 1082;

function connectionString(): string | undefined {
  return process.env.DATABASE_URL ?? process.env.DATABASE_POSTGRES_URL ?? process.env.POSTGRES_URL;
}

async function createDb(): Promise<Db> {
  const url = connectionString();
  let db: Db;
  if (url) {
    const { Pool, types } = await import("pg");
    types.setTypeParser(DATE_OID, (v: string) => v); // keep DATE as "YYYY-MM-DD", never shift by timezone
    const pool = new Pool({ connectionString: url, max: 5, ssl: url.includes("localhost") ? undefined : { rejectUnauthorized: false } });
    db = pool as unknown as Db;
  } else {
    // No database configured: use an embedded Postgres so the app runs with zero setup.
    const { PGlite } = await import("@electric-sql/pglite");
    const lite = new PGlite(process.env.PGLITE_DIR ?? "./.pglite", { parsers: { [DATE_OID]: (v: string) => v } });
    await lite.exec(SCHEMA_SQL);
    return lite as unknown as Db;
  }
  // A multi-statement simple query runs in one implicit transaction; the advisory
  // lock stops concurrent cold starts from racing on CREATE TABLE.
  await db.query(`SELECT pg_advisory_xact_lock(4242);\n${SCHEMA_SQL}`);
  return db;
}

/** Lazily created, process-wide database handle with the schema applied. */
export function getDb(): Promise<Db> {
  if (!globalThis.__carecircleDb) {
    globalThis.__carecircleDb = createDb().catch((err) => {
      globalThis.__carecircleDb = undefined;
      throw err;
    });
  }
  return globalThis.__carecircleDb;
}
