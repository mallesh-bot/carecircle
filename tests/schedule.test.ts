import { describe, expect, it } from "vitest";
import { buildDaySchedule, computeAdherence, isScheduledOn, needsRefill, slotsForDate, statusFor } from "@/lib/schedule";
import type { DoseLog } from "@/lib/types";
import { med } from "./helpers";

const TZ = "Asia/Kolkata";
const log = (scheduledAt: string, status: DoseLog["status"] = "taken", medicationId = "med-1"): DoseLog => ({
  id: scheduledAt,
  medicationId,
  scheduledAt: new Date(scheduledAt),
  status,
  loggedBy: "Priya",
  loggedAt: new Date(scheduledAt),
});

describe("isScheduledOn", () => {
  it("respects start and end dates", () => {
    const m = med({ startDate: "2026-11-10", endDate: "2026-11-12" });
    expect(isScheduledOn(m, "2026-11-09")).toBe(false);
    expect(isScheduledOn(m, "2026-11-10")).toBe(true);
    expect(isScheduledOn(m, "2026-11-12")).toBe(true);
    expect(isScheduledOn(m, "2026-11-13")).toBe(false);
  });

  it("respects days of week and paused medicines", () => {
    const sundaysOnly = med({ daysOfWeek: [0] });
    expect(isScheduledOn(sundaysOnly, "2026-11-15")).toBe(true); // Sunday
    expect(isScheduledOn(sundaysOnly, "2026-11-16")).toBe(false);
    expect(isScheduledOn(med({ active: false }), "2026-11-15")).toBe(false);
  });
});

describe("slots and statuses", () => {
  it("creates one sorted slot per time in the circle timezone", () => {
    const slots = slotsForDate(med({ times: ["20:00", "08:00"] }), "2026-11-15", TZ);
    expect(slots.map((s) => s.toISOString())).toEqual(["2026-11-15T02:30:00.000Z", "2026-11-15T14:30:00.000Z"]);
  });

  it("derives upcoming → due → missed over time", () => {
    const at = new Date("2026-11-15T02:30:00Z");
    expect(statusFor(at, undefined, new Date("2026-11-15T01:00:00Z"))).toBe("upcoming");
    expect(statusFor(at, undefined, new Date("2026-11-15T02:10:00Z"))).toBe("due");
    expect(statusFor(at, undefined, new Date("2026-11-15T03:20:00Z"))).toBe("due");
    expect(statusFor(at, undefined, new Date("2026-11-15T03:31:00Z"))).toBe("missed");
    expect(statusFor(at, log("2026-11-15T02:30:00Z", "skipped"), new Date("2026-11-15T05:00:00Z"))).toBe("skipped");
  });

  it("builds a day schedule joined with logs", () => {
    const now = new Date("2026-11-15T10:00:00Z");
    const schedule = buildDaySchedule([med()], [log("2026-11-15T02:30:00Z")], "2026-11-15", TZ, now);
    expect(schedule.map((s) => s.status)).toEqual(["taken", "upcoming"]);
    expect(schedule[0].loggedBy).toBe("Priya");
  });
});

describe("computeAdherence", () => {
  it("counts settled doses only and ignores skips in the rate", () => {
    const now = new Date("2026-11-15T10:00:00Z"); // 15:30 IST — morning dose settled, evening not yet
    const m = med({ createdAt: new Date("2026-11-13T00:00:00Z") });
    const logs = [
      log("2026-11-13T02:30:00Z"), // 13th morning taken
      log("2026-11-13T14:30:00Z", "skipped"), // 13th evening skipped
      log("2026-11-14T02:30:00Z"), // 14th morning taken; 14th evening missed
      log("2026-11-15T02:30:00Z"), // 15th morning taken
    ];
    const a = computeAdherence([m], logs, TZ, now, 7);
    expect(a.taken).toBe(3);
    expect(a.missed).toBe(1);
    expect(a.skipped).toBe(1);
    expect(a.rate).toBe(75);
    expect(a.days).toHaveLength(7);
    expect(a.byMedication[0]).toMatchObject({ rate: 75, missed: 1 });
  });

  it("returns a null rate when nothing is measurable yet", () => {
    const now = new Date("2026-11-15T00:00:00Z");
    expect(computeAdherence([med({ createdAt: now })], [], TZ, now).rate).toBeNull();
  });
});

describe("needsRefill", () => {
  it("flags active medicines at or below threshold", () => {
    const meds = [med({ id: "a", stock: 5 }), med({ id: "b", stock: 6 }), med({ id: "c", stock: 0, active: false }), med({ id: "d", stock: null })];
    expect(needsRefill(meds).map((m) => m.id)).toEqual(["a"]);
  });
});
