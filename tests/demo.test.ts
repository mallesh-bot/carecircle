import { describe, expect, it } from "vitest";
import { seedDemoCircle } from "@/lib/demo";
import * as repo from "@/lib/repo";
import { computeAdherence } from "@/lib/schedule";
import { testDb } from "./helpers";

describe("demo circle", () => {
  it("creates an isolated, realistic circle with history and a visible adherence pattern", async () => {
    const db = await testDb();
    const now = new Date("2026-11-15T09:00:00Z"); // 14:30 IST
    const { circle, visitor } = await seedDemoCircle(db, "Judge", now);

    expect(visitor.circleId).toBe(circle.id);
    expect(await repo.listMembers(db, circle.id)).toHaveLength(4);
    const meds = await repo.listMedications(db, circle.id);
    expect(meds).toHaveLength(4);
    expect((await repo.listAppointments(db, circle.id, now)).length).toBe(2);

    const logs = await repo.listDoseLogsSince(db, circle.id, new Date("2026-11-01"));
    const adherence = computeAdherence(meds, logs, circle.timezone, now);
    expect(adherence.missed).toBeGreaterThan(0);
    expect(adherence.rate).toBeGreaterThan(70);
    expect(adherence.rate).toBeLessThan(100);

    // A second demo is a completely separate circle.
    const second = await seedDemoCircle(db, "Judge 2", now);
    expect(second.circle.id).not.toBe(circle.id);
    expect(await repo.listMedications(db, second.circle.id)).toHaveLength(4);
  });
});
