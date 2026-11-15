import { describe, expect, it } from "vitest";
import { generateCircleCode, hashPasscode, normalizeCircleCode, randomToken, sha256, verifyPasscode } from "@/lib/crypto";
import { createCircleSchema, joinCircleSchema, medicationSchema } from "@/lib/validation";

describe("passcodes", () => {
  it("hashes with a random salt and verifies", async () => {
    const a = await hashPasscode("amma-2026");
    const b = await hashPasscode("amma-2026");
    expect(a).not.toBe(b);
    expect(a).not.toContain("amma-2026");
    expect(await verifyPasscode("amma-2026", a)).toBe(true);
    expect(await verifyPasscode("wrong-pass", a)).toBe(false);
  });

  it("rejects malformed stored hashes", async () => {
    expect(await verifyPasscode("x", "plaintext")).toBe(false);
  });
});

describe("codes and tokens", () => {
  it("generates readable circle codes without ambiguous characters", () => {
    for (let i = 0; i < 50; i++) expect(generateCircleCode()).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  });

  it("normalises user-typed codes", () => {
    expect(normalizeCircleCode(" kq7m p3xa ")).toBe("KQ7M-P3XA");
    expect(normalizeCircleCode("kq7m-p3xa")).toBe("KQ7M-P3XA");
  });

  it("creates unique random tokens and stable hashes", () => {
    expect(randomToken()).not.toBe(randomToken());
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("input validation", () => {
  const circle = { elderName: "Amma", yourName: "Priya", yourEmail: "", yourRole: "family", passcode: "secret1", timezone: "Asia/Kolkata", language: "te" };

  it("accepts a valid circle and treats a blank email as none", () => {
    const parsed = createCircleSchema.parse(circle);
    expect(parsed.yourEmail).toBeNull();
  });

  it("rejects short passcodes, bad emails, roles and timezones", () => {
    expect(createCircleSchema.safeParse({ ...circle, passcode: "123" }).success).toBe(false);
    expect(createCircleSchema.safeParse({ ...circle, yourEmail: "not-an-email" }).success).toBe(false);
    expect(createCircleSchema.safeParse({ ...circle, yourRole: "admin" }).success).toBe(false);
    expect(createCircleSchema.safeParse({ ...circle, timezone: "Nowhere/City" }).success).toBe(false);
    expect(joinCircleSchema.safeParse({ code: "", passcode: "x", name: "A", email: "", role: "family" }).success).toBe(false);
  });

  it("normalises medicine times and days and checks dates", () => {
    const base = { name: "Aspirin", dosage: "", instructions: "", times: ["20:00", "08:00", "08:00"], daysOfWeek: ["3", "1"], startDate: "2026-11-15", endDate: null, stock: null, refillThreshold: 5 };
    expect(medicationSchema.parse(base)).toMatchObject({ times: ["08:00", "20:00"], daysOfWeek: [1, 3] });
    expect(medicationSchema.safeParse({ ...base, times: ["25:00"] }).success).toBe(false);
    expect(medicationSchema.safeParse({ ...base, endDate: "2026-11-01" }).success).toBe(false);
    expect(medicationSchema.safeParse({ ...base, times: [] }).success).toBe(false);
  });
});
