import { describe, expect, it } from "vitest";
import { planReminders, type ReminderContext } from "@/lib/reminders";
import { med, member } from "./helpers";

const base = (overrides: Partial<ReminderContext> = {}): ReminderContext => ({
  circleId: "circle-1",
  elderName: "Amma",
  timezone: "Asia/Kolkata",
  members: [
    member({ id: "e", name: "Amma", role: "elder", email: "amma@example.com" }),
    member({ id: "f", name: "Priya", role: "family", email: "priya@example.com" }),
    member({ id: "x", name: "Ravi", role: "family", email: null }),
    member({ id: "n", name: "Quiet", role: "caretaker", email: "quiet@example.com", notify: false }),
  ],
  medications: [med()],
  logs: [],
  appointments: [],
  appUrl: "https://carecircle.test",
  ...overrides,
});

describe("planReminders", () => {
  it("sends an upcoming-dose reminder to everyone opted in, shortly before the dose", () => {
    const r = planReminders(base(), new Date("2026-11-15T02:10:00Z")); // 07:40 IST, dose at 08:00
    const upcoming = r.filter((x) => x.kind === "upcoming_dose");
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0].recipients).toEqual(["amma@example.com", "priya@example.com"]);
    expect(upcoming[0].subject).toContain("Metformin");
  });

  it("does not remind too early", () => {
    expect(planReminders(base(), new Date("2026-11-15T01:00:00Z")).filter((x) => x.kind === "upcoming_dose")).toHaveLength(0);
  });

  it("escalates missed doses to family and caretakers only", () => {
    const r = planReminders(base(), new Date("2026-11-15T04:00:00Z")); // 09:30 IST, 08:00 dose missed
    const missed = r.filter((x) => x.kind === "missed_dose");
    expect(missed).toHaveLength(1);
    expect(missed[0].recipients).toEqual(["priya@example.com"]);
  });

  it("does not alert for doses that were taken", () => {
    const logs = [{ id: "l", medicationId: "med-1", scheduledAt: new Date("2026-11-15T02:30:00Z"), status: "taken" as const, loggedBy: "Amma", loggedAt: new Date() }];
    expect(planReminders(base({ logs }), new Date("2026-11-15T04:00:00Z")).filter((x) => x.kind === "missed_dose")).toHaveLength(0);
  });

  it("reminds about appointments within 24 hours, and refills", () => {
    const now = new Date("2026-11-15T06:00:00Z");
    const r = planReminders(
      base({
        medications: [med({ stock: 2, times: ["23:00"] })],
        appointments: [
          { id: "a1", circleId: "circle-1", title: "Eye check-up", doctor: "Dr. Rao", location: "", notes: "", startsAt: new Date("2026-11-16T04:30:00Z"), createdAt: now },
          { id: "a2", circleId: "circle-1", title: "Far away", doctor: "", location: "", notes: "", startsAt: new Date("2026-11-20T04:30:00Z"), createdAt: now },
        ],
      }),
      now,
    );
    expect(r.filter((x) => x.kind === "appointment").map((x) => x.dedupeKey)).toEqual(["appt:a1:2026-11-16T04:30:00.000Z"]);
    expect(r.filter((x) => x.kind === "refill")).toHaveLength(1);
  });

  it("produces stable dedupe keys so repeated runs don't double-send", () => {
    const now = new Date("2026-11-15T02:10:00Z");
    expect(planReminders(base(), now).map((x) => x.dedupeKey)).toEqual(planReminders(base(), new Date(now.getTime() + 60_000)).map((x) => x.dedupeKey));
  });
});

describe("in-app reminders", () => {
  it("still plans reminders when nobody has email, so they show in the app", () => {
    const r = planReminders(base({ members: [member({ email: null })] }), new Date("2026-11-15T04:00:00Z"));
    expect(r.find((x) => x.kind === "missed_dose")?.recipients).toEqual([]);
  });
});
