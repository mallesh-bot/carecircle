import { describe, expect, it } from "vitest";
import { addDays, isValidTimezone, localDate, parseLocalDateTime, toLocalDateTimeInput, zonedTimeToUtc } from "@/lib/time";

describe("time helpers", () => {
  it("converts IST wall-clock time to UTC", () => {
    expect(zonedTimeToUtc("2026-11-15", "08:00", "Asia/Kolkata").toISOString()).toBe("2026-11-15T02:30:00.000Z");
  });

  it("handles DST zones on both sides of a transition", () => {
    // New York: EDT (UTC-4) in October, EST (UTC-5) in November.
    expect(zonedTimeToUtc("2026-10-15", "09:00", "America/New_York").toISOString()).toBe("2026-10-15T13:00:00.000Z");
    expect(zonedTimeToUtc("2026-11-15", "09:00", "America/New_York").toISOString()).toBe("2026-11-15T14:00:00.000Z");
  });

  it("finds the local date of an instant", () => {
    const lateUtc = new Date("2026-11-14T20:00:00Z"); // 01:30 on the 15th in India
    expect(localDate(lateUtc, "Asia/Kolkata")).toBe("2026-11-15");
    expect(localDate(lateUtc, "UTC")).toBe("2026-11-14");
  });

  it("adds days across month boundaries", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("round-trips datetime-local values", () => {
    const at = parseLocalDateTime("2026-11-20T10:30", "Asia/Kolkata");
    expect(at.toISOString()).toBe("2026-11-20T05:00:00.000Z");
    expect(toLocalDateTimeInput(at, "Asia/Kolkata")).toBe("2026-11-20T10:30");
  });

  it("validates timezones", () => {
    expect(isValidTimezone("Asia/Kolkata")).toBe(true);
    expect(isValidTimezone("Mars/Olympus")).toBe(false);
  });
});
