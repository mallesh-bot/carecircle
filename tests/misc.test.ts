import { describe, expect, it } from "vitest";
import { googleCalendarUrl } from "@/lib/calendar";
import { partOfDay, phrasesFor } from "@/lib/elder-phrases";
import { meansTaken } from "@/lib/speech";

describe("Google Calendar links", () => {
  it("builds a one-hour event in UTC", () => {
    const url = new URL(
      googleCalendarUrl({ title: "Eye check-up", doctor: "Dr. Rao", location: "Apollo", notes: "", startsAt: new Date("2026-11-20T05:00:00Z") }, "Amma"),
    );
    expect(url.hostname).toBe("calendar.google.com");
    expect(url.searchParams.get("dates")).toBe("20261120T050000Z/20261120T060000Z");
    expect(url.searchParams.get("text")).toBe("Eye check-up — Amma");
    expect(url.searchParams.get("location")).toBe("Apollo");
  });
});

describe("voice commands", () => {
  it.each(["I took it", "yes done", "मैंने ले ली", "వేసుకున్నాను", "சாப்பிட்டேன்"])("understands %s", (phrase) => {
    expect(meansTaken(phrase)).toBe(true);
  });

  it("ignores unrelated speech", () => {
    expect(meansTaken("what's the weather")).toBe(false);
  });
});

describe("elder phrases", () => {
  it("greets by part of day in the elder's language", () => {
    expect(partOfDay(9)).toBe("morning");
    expect(partOfDay(15)).toBe("afternoon");
    expect(partOfDay(20)).toBe("evening");
    expect(phrasesFor("en").greeting("morning", "Amma")).toBe("Good morning, Amma");
    expect(phrasesFor("te").tookIt).toBe("వేసుకున్నాను");
    expect(phrasesFor("ta").tookIt).toBe("I took it"); // falls back to English UI
  });
});
