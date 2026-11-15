import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import * as repo from "@/lib/repo";
import { medicationSchema } from "@/lib/validation";
import { testDb } from "./helpers";

const medInput = (overrides = {}) =>
  medicationSchema.parse({
    name: "Amlodipine 5mg",
    dosage: "1 tablet",
    instructions: "",
    times: ["08:00"],
    daysOfWeek: [],
    startDate: "2026-11-01",
    endDate: null,
    stock: 10,
    refillThreshold: 3,
    ...overrides,
  });

describe("repository (embedded Postgres)", () => {
  let db: Db;
  let circleId: string;

  beforeEach(async () => {
    db = await testDb();
    const circle = await repo.createCircle(db, { elderName: "Amma", timezone: "Asia/Kolkata", language: "en", passcodeHash: "scrypt$x$y" });
    circleId = circle.id;
  });

  it("creates circles with a code, card token and default name", async () => {
    const circle = await repo.getCircle(db, circleId);
    expect(circle?.name).toBe("Amma's Care Circle");
    expect(circle?.code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect((await repo.getCircleByCardToken(db, circle!.cardToken))?.id).toBe(circleId);
    expect(await repo.findCircleForLogin(db, circle!.code)).toEqual({ id: circleId, passcodeHash: "scrypt$x$y" });
  });

  it("issues sessions that resolve to the member and can be revoked", async () => {
    const m = await repo.addMember(db, circleId, { name: "Priya", email: "p@example.com", role: "family" });
    const token = await repo.createSession(db, m.id);
    expect((await repo.getSessionMember(db, token))?.name).toBe("Priya");
    expect(await repo.getSessionMember(db, "forged-token")).toBeNull();
    await repo.deleteSession(db, token);
    expect(await repo.getSessionMember(db, token)).toBeNull();
  });

  it("isolates circles from each other", async () => {
    const other = await repo.createCircle(db, { elderName: "Thatha", timezone: "Asia/Kolkata", language: "en", passcodeHash: "h" });
    const m = await repo.createMedication(db, circleId, medInput());
    expect(await repo.getMedication(db, other.id, m.id)).toBeNull();
    expect(await repo.deleteMedication(db, other.id, m.id)).toBe(false);
    expect(await repo.updateMedication(db, other.id, m.id, medInput({ name: "Hacked" }))).toBe(false);
    expect((await repo.getMedication(db, circleId, m.id))?.name).toBe("Amlodipine 5mg");
  });

  it("round-trips medicines with dates, times and days", async () => {
    const created = await repo.createMedication(db, circleId, medInput({ daysOfWeek: ["1", "3"], endDate: "2026-12-01" }));
    expect(created).toMatchObject({ startDate: "2026-11-01", endDate: "2026-12-01", times: ["08:00"], daysOfWeek: [1, 3], stock: 10 });
  });

  it("logs doses idempotently and keeps stock in sync", async () => {
    const m = await repo.createMedication(db, circleId, medInput());
    const at = new Date("2026-11-15T02:30:00Z");
    await repo.logDose(db, circleId, m.id, at, "taken", "Priya");
    await repo.logDose(db, circleId, m.id, at, "taken", "Priya"); // double tap
    expect((await repo.getMedication(db, circleId, m.id))?.stock).toBe(9);
    await repo.logDose(db, circleId, m.id, at, "skipped", "Priya"); // changed mind
    expect((await repo.getMedication(db, circleId, m.id))?.stock).toBe(10);
    await repo.logDose(db, circleId, m.id, at, "taken", "Amma");
    await repo.undoDose(db, circleId, m.id, at);
    expect((await repo.getMedication(db, circleId, m.id))?.stock).toBe(10);
    expect(await repo.listDoseLogsSince(db, circleId, new Date("2026-11-01"))).toHaveLength(0);
  });

  it("dedupes notifications by key", async () => {
    const n = { dedupeKey: "missed:x:1", kind: "missed_dose" as const, recipients: ["a@example.com"], subject: "s" };
    expect(await repo.claimNotification(db, circleId, n)).not.toBeNull();
    expect(await repo.claimNotification(db, circleId, n)).toBeNull();
    expect(await repo.listNotifications(db, circleId)).toHaveLength(1);
  });

  it("throttles failed logins per circle code", async () => {
    for (let i = 0; i < 3; i++) await repo.recordLoginAttempt(db, "ABCD-EFGH", false);
    await repo.recordLoginAttempt(db, "ABCD-EFGH", true);
    expect(await repo.recentFailedAttempts(db, "ABCD-EFGH", 15)).toBe(3);
    expect(await repo.recentFailedAttempts(db, "ZZZZ-ZZZZ", 15)).toBe(0);
  });
});
