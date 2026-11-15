import { PGlite } from "@electric-sql/pglite";
import type { Db } from "@/lib/db";
import { SCHEMA_SQL } from "@/lib/schema";
import type { Medication, Member } from "@/lib/types";

/** Fresh in-memory Postgres with the production schema applied. */
export async function testDb(): Promise<Db> {
  const db = new PGlite(undefined, { parsers: { 1082: (v: string) => v } });
  await db.exec(SCHEMA_SQL);
  return db as unknown as Db;
}

export function med(overrides: Partial<Medication> = {}): Medication {
  return {
    id: "med-1",
    circleId: "circle-1",
    name: "Metformin 500mg",
    dosage: "1 tablet",
    instructions: "After food",
    times: ["08:00", "20:00"],
    daysOfWeek: [],
    startDate: "2026-01-01",
    endDate: null,
    stock: null,
    refillThreshold: 5,
    active: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

export function member(overrides: Partial<Member> = {}): Member {
  return {
    id: "m-1",
    circleId: "circle-1",
    name: "Priya",
    email: "priya@example.com",
    role: "family",
    notify: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}
