import { describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db";
import { testDb } from "./helpers";

const holder = vi.hoisted(() => ({ db: null as unknown as Db }));
vi.mock("@/lib/db", () => ({ getDb: async () => holder.db }));

const { loadDashboard } = await import("@/lib/dashboard");
const { seedDemoCircle } = await import("@/lib/demo");

describe("loadDashboard", () => {
  it("assembles today's schedule, adherence, refills and feeds for a circle", async () => {
    holder.db = await testDb();
    const now = new Date("2026-11-15T09:00:00Z");
    const { circle } = await seedDemoCircle(holder.db, "Judge", now);
    const data = await loadDashboard(circle.id, circle.timezone, now);

    expect(data.today).toBe("2026-11-15");
    expect(data.members).toHaveLength(4);
    expect(data.schedule.length).toBeGreaterThan(0);
    expect(data.schedule.some((s) => s.status === "taken")).toBe(true);
    expect(data.adherence.rate).not.toBeNull();
    expect(data.refills.map((m) => m.name)).toContain("Amlodipine 5mg");
    expect(data.appointments[0].title).toBe("Diabetes review + HbA1c");
    expect(data.activity.length).toBe(5);
  });
});
