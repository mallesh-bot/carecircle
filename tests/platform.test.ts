import { afterEach, describe, expect, it, vi } from "vitest";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { canManageMembers, canRemove } from "@/lib/permissions";
import { consume } from "@/lib/rate-limit";
import { appUrl, runAllReminders, runRemindersForCircle } from "@/lib/reminder-runner";
import * as repo from "@/lib/repo";
import { medicationSchema } from "@/lib/validation";
import { buildCsp, proxy } from "@/proxy";
import { testDb } from "./helpers";

afterEach(() => vi.unstubAllEnvs());

describe("rate limiting", () => {
  it("allows up to the limit per bucket and window", async () => {
    const db = await testDb();
    const limit = { limit: 3, windowSeconds: 60 };
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await consume(db, "demo:abc", limit));
    expect(results).toEqual([true, true, true, false, false]);
    expect(await consume(db, "demo:other", limit)).toBe(true);
  });
});

describe("permissions", () => {
  it("keeps the elder in control of who is in the circle", () => {
    expect(canManageMembers("elder")).toBe(true);
    expect(canManageMembers("caretaker")).toBe(true);
    expect(canManageMembers("family")).toBe(false);
    expect(canRemove("caretaker", "family", false)).toBe(true);
    expect(canRemove("caretaker", "elder", false)).toBe(false);
    expect(canRemove("elder", "caretaker", true)).toBe(false);
  });
});

describe("content security policy", () => {
  it("uses a nonce with strict-dynamic and no unsafe-inline scripts", () => {
    const csp = buildCsp("abc123", false);
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(buildCsp("x", true)).toContain("'unsafe-eval'"); // dev tooling only
  });

  it("sets a fresh nonce on every response", async () => {
    const { NextRequest } = await import("next/server");
    const a = proxy(new NextRequest("https://carecircle.test/"));
    const b = proxy(new NextRequest("https://carecircle.test/"));
    const nonceOf = (csp: string | null) => csp?.match(/'nonce-([^']+)'/)?.[1];
    expect(nonceOf(a.headers.get("content-security-policy"))).toBeTruthy();
    expect(nonceOf(a.headers.get("content-security-policy"))).not.toBe(nonceOf(b.headers.get("content-security-policy")));
  });
});

describe("environment", () => {
  it("treats blank variables as unset and validates APP_URL", () => {
    vi.stubEnv("GEMINI_API_KEY", "  ");
    expect(env().GEMINI_API_KEY).toBeUndefined();
    vi.stubEnv("APP_URL", "not a url");
    expect(() => env()).toThrow();
    vi.stubEnv("APP_URL", "https://care.example/");
    expect(appUrl()).toBe("https://care.example");
  });

  it("compares secrets in constant time", () => {
    expect(safeEqual("Bearer s3cret", "Bearer s3cret")).toBe(true);
    expect(safeEqual("Bearer s3cret", "Bearer s3cre")).toBe(false);
  });
});

describe("reminder runner", () => {
  it("records in-app reminders once, throttles repeat runs, and skips idle circles", async () => {
    const db = await testDb();
    const circle = await repo.createCircle(db, { elderName: "Amma", timezone: "Asia/Kolkata", language: "en", passcodeHash: "h" });
    await repo.createCircle(db, { elderName: "Idle", timezone: "Asia/Kolkata", language: "en", passcodeHash: "h" });
    await repo.addMember(db, circle.id, { name: "Priya", email: null, role: "family" });
    const med = await repo.createMedication(
      db,
      circle.id,
      medicationSchema.parse({ name: "Metformin", dosage: "", instructions: "", times: ["08:00"], daysOfWeek: [], startDate: "2026-11-01", endDate: null, stock: 2, refillThreshold: 5 }),
    );
    await db.query(`UPDATE medications SET created_at = '2026-11-01' WHERE id = $1`, [med.id]);
    const now = new Date("2026-11-15T04:00:00Z"); // 09:30 IST — the 08:00 dose is missed

    expect(await repo.listCirclesNeedingReminders(db)).toEqual([circle.id]);
    const first = await runAllReminders(db, now);
    expect(first).toBeGreaterThanOrEqual(2); // missed dose + refill
    expect(await runRemindersForCircle(db, circle.id, { now })).toBe(0); // throttled
    expect(await runRemindersForCircle(db, circle.id, { now, force: true })).toBe(0); // deduped
    const kinds = (await repo.listNotifications(db, circle.id)).map((n) => n.kind).sort();
    expect(kinds).toEqual(expect.arrayContaining(["missed_dose", "refill"]));
    expect((await repo.listNotifications(db, circle.id)).every((n) => !n.delivered)).toBe(true); // no email configured
  });
});
