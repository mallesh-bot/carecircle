/**
 * Server Action tests: real validation, authorization and SQL (embedded
 * Postgres); only the Next.js request context (cookies, redirects) is mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db";
import * as repo from "@/lib/repo";
import type { CircleDetails } from "@/lib/repo";
import type { Member } from "@/lib/types";
import { testDb } from "./helpers";

const state = vi.hoisted(() => ({
  db: null as unknown as Db,
  viewer: null as null | { member: Member; circle: CircleDetails | null },
  signedIn: null as string | null,
}));

vi.mock("@/lib/db", () => ({ getDb: async () => state.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error(`REDIRECT:${url}`), { url });
  },
}));
vi.mock("@/lib/session", () => ({
  requireViewer: async () => {
    if (!state.viewer) throw new Error("REDIRECT:/?signin=1");
    return state.viewer;
  },
  signIn: async (memberId: string) => {
    state.signedIn = memberId;
  },
  signOut: async () => {},
  clientKey: async () => "test-client",
}));

const { createCircleAction, joinCircleAction, startDemoAction } = await import("@/app/actions/onboarding");
const { saveMedicationAction, deleteMedicationAction, setMedicationActiveAction } = await import("@/app/actions/medications");
const { logDoseAction } = await import("@/app/actions/doses");
const { saveAppointmentAction, deleteAppointmentAction } = await import("@/app/actions/appointments");
const { removeMemberAction, saveEmergencyAction, updateMyNotificationsAction, sendRemindersNowAction } = await import("@/app/actions/circle");
const { addScannedMedicationsAction, explainMedicineAction } = await import("@/app/actions/ai");

function form(fields: Record<string, string | string[]>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const item of [v].flat()) fd.append(k, item);
  return fd;
}

const circleForm = { elderName: "Amma", yourName: "Priya", yourEmail: "", yourRole: "family", passcode: "secret-123", timezone: "Asia/Kolkata", language: "en" };

async function expectRedirect(p: Promise<unknown>, to: string) {
  await expect(p).rejects.toThrow(`REDIRECT:${to}`);
}

async function signInAs(role: Member["role"]) {
  const circle = (await repo.getCircle(state.db, state.viewer?.circle?.id ?? ""))!;
  const member = await repo.addMember(state.db, circle.id, { name: `A ${role}`, email: null, role });
  state.viewer = { member, circle };
  return member;
}

beforeEach(async () => {
  state.db = await testDb();
  state.viewer = null;
  state.signedIn = null;
  await expectRedirect(createCircleAction(null, form(circleForm)), "/circle?welcome=1");
  const members = await state.db.query<{ id: string; circle_id: string }>(`SELECT id, circle_id FROM members`);
  const circle = await repo.getCircle(state.db, members.rows[0].circle_id);
  state.viewer = { member: (await repo.listMembers(state.db, circle!.id))[0], circle };
});

describe("onboarding", () => {
  it("creates a circle, hashes the passcode and signs the creator in", async () => {
    const { rows } = await state.db.query<{ passcode_hash: string }>(`SELECT passcode_hash FROM circles`);
    expect(rows[0].passcode_hash).toMatch(/^scrypt\$/);
    expect(state.signedIn).toBe(state.viewer!.member.id);
  });

  it("returns field-level validation errors", async () => {
    expect(await createCircleAction(null, form({ ...circleForm, passcode: "123" }))).toMatchObject({ ok: false, field: "passcode" });
    expect(await createCircleAction(null, form({ ...circleForm, yourEmail: "nope" }))).toMatchObject({ ok: false, field: "yourEmail" });
  });

  it("joins with the right passcode and rejects the wrong one without revealing which part was wrong", async () => {
    const code = state.viewer!.circle!.code;
    const join = { code: code.toLowerCase().replace("-", " "), passcode: "secret-123", name: "Ravi", email: "", role: "family" };
    expect(await joinCircleAction(null, form({ ...join, passcode: "wrong-pass" }))).toMatchObject({ ok: false, error: "That circle code and passcode don't match." });
    expect(await joinCircleAction(null, form({ ...join, code: "ZZZZ-ZZZZ" }))).toMatchObject({ ok: false, error: "That circle code and passcode don't match." });
    await expectRedirect(joinCircleAction(null, form(join)), "/circle");
    expect((await repo.listMembers(state.db, state.viewer!.circle!.id)).map((m) => m.name)).toContain("Ravi");
  });

  it("locks a circle code after repeated wrong passcodes", async () => {
    const join = { code: state.viewer!.circle!.code, passcode: "wrong-pass", name: "Mallory", email: "", role: "family" };
    for (let i = 0; i < 5; i++) await joinCircleAction(null, form(join));
    const locked = await joinCircleAction(null, form({ ...join, passcode: "secret-123" }));
    expect(locked?.error).toMatch(/Too many wrong attempts/);
  });

  it("rate-limits circle creation per client", async () => {
    for (let i = 0; i < 9; i++) await createCircleAction(null, form(circleForm)).catch(() => {});
    expect(await createCircleAction(null, form(circleForm))).toMatchObject({ ok: false, error: expect.stringMatching(/too often/) });
  });

  it("starts a populated demo circle", async () => {
    await expectRedirect(startDemoAction(), "/circle?demo=1");
    const { rows } = await state.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM circles WHERE elder_name = 'Lakshmi Amma'`);
    expect(rows[0].n).toBe(1);
  });
});

describe("medications and doses", () => {
  const medForm = { name: "Metformin 500mg", dosage: "1 tablet", instructions: "", times: ["20:00", "08:00"], startDate: "2026-11-01", endDate: "", stock: "10", refillThreshold: "3" };

  it("adds, edits, pauses and deletes a medicine, logging activity", async () => {
    expect(await saveMedicationAction(null, form(medForm))).toMatchObject({ ok: true });
    const [med] = await repo.listMedications(state.db, state.viewer!.circle!.id);
    expect(med.times).toEqual(["08:00", "20:00"]);

    expect(await saveMedicationAction(null, form({ ...medForm, id: med.id, name: "Metformin 1g" }))).toMatchObject({ ok: true });
    expect(await setMedicationActiveAction(med.id, false)).toMatchObject({ ok: true });
    expect((await repo.getMedication(state.db, state.viewer!.circle!.id, med.id))).toMatchObject({ name: "Metformin 1g", active: false });
    expect(await deleteMedicationAction(med.id)).toMatchObject({ ok: true });
    expect(await repo.listMedications(state.db, state.viewer!.circle!.id)).toHaveLength(0);

    const feed = (await repo.listActivity(state.db, state.viewer!.circle!.id)).map((a) => a.message);
    expect(feed).toEqual(expect.arrayContaining(["paused Metformin 1g", "removed Metformin 1g"]));
  });

  it("rejects invalid medicines and ids from other circles", async () => {
    expect(await saveMedicationAction(null, form({ ...medForm, times: ["25:00"] }))).toMatchObject({ ok: false, field: "times" });
    expect(await deleteMedicationAction("not-a-uuid")).toMatchObject({ ok: false });
    expect(await deleteMedicationAction("00000000-0000-4000-8000-000000000000")).toMatchObject({ ok: false, error: "Medicine not found." });
  });

  it("logs and undoes doses within the allowed window only", async () => {
    await saveMedicationAction(null, form(medForm));
    const [med] = await repo.listMedications(state.db, state.viewer!.circle!.id);
    const recent = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    expect(await logDoseAction(med.id, recent, "taken")).toMatchObject({ ok: true });
    expect((await repo.getMedication(state.db, state.viewer!.circle!.id, med.id))?.stock).toBe(9);
    expect(await logDoseAction(med.id, recent, "undo")).toMatchObject({ ok: true });
    expect((await repo.getMedication(state.db, state.viewer!.circle!.id, med.id))?.stock).toBe(10);

    const longAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(await logDoseAction(med.id, longAgo, "taken")).toMatchObject({ ok: false });
    expect(await logDoseAction(med.id, "yesterday", "taken")).toMatchObject({ ok: false, error: "Invalid dose." });
    expect(await logDoseAction(med.id, recent, "eaten" as "taken")).toMatchObject({ ok: false });
  });

  it("requires a signed-in member", async () => {
    state.viewer = null;
    await expect(saveMedicationAction(null, form(medForm))).rejects.toThrow("REDIRECT");
  });
});

describe("appointments, members and health profile", () => {
  it("schedules and cancels an appointment in the circle's timezone", async () => {
    expect(await saveAppointmentAction(null, form({ title: "Eye check-up", doctor: "", location: "", startsAt: "2027-01-10T10:30", notes: "" }))).toMatchObject({ ok: true });
    const [appt] = await repo.listAppointments(state.db, state.viewer!.circle!.id, new Date("2026-01-01"));
    expect(appt.startsAt.toISOString()).toBe("2027-01-10T05:00:00.000Z");
    expect(await deleteAppointmentAction(appt.id)).toMatchObject({ ok: true });
    expect(await saveAppointmentAction(null, form({ title: "", doctor: "", location: "", startsAt: "", notes: "" }))).toMatchObject({ ok: false, field: "title" });
  });

  it("lets only the elder or a caretaker remove members, and never the elder", async () => {
    const family = state.viewer!.member;
    const caretaker = await signInAs("caretaker");
    const elder = await repo.addMember(state.db, state.viewer!.circle!.id, { name: "Amma", email: null, role: "elder" });

    expect(await removeMemberAction(elder.id)).toMatchObject({ ok: false });
    expect(await removeMemberAction(caretaker.id)).toMatchObject({ ok: false });
    expect(await removeMemberAction(family.id)).toMatchObject({ ok: true });

    await signInAs("family");
    expect(await removeMemberAction(caretaker.id)).toMatchObject({ ok: false, error: expect.stringMatching(/Only the elder/) });
  });

  it("saves notification settings and the health profile", async () => {
    expect(await updateMyNotificationsAction(null, form({ email: "Priya@Example.com", notify: "on" }))).toMatchObject({ ok: true });
    expect((await repo.listMembers(state.db, state.viewer!.circle!.id))[0].email).toBe("priya@example.com");
    const profile = { bloodGroup: "B+", conditions: "Diabetes", allergies: "Penicillin", emergencyContact: "Ravi", doctorContact: "Dr. Rao", language: "te" };
    expect(await saveEmergencyAction(null, form(profile))).toMatchObject({ ok: true });
    expect(await repo.getCircle(state.db, state.viewer!.circle!.id)).toMatchObject({ allergies: "Penicillin", language: "te" });
    expect(await saveEmergencyAction(null, form({ ...profile, bloodGroup: "Z+" }))).toMatchObject({ ok: false, field: "bloodGroup" });
  });

  it("checks reminders on demand", async () => {
    expect(await sendRemindersNowAction()).toMatchObject({ ok: true });
  });
});

describe("AI actions", () => {
  it("adds only re-validated scanned medicines", async () => {
    const res = await addScannedMedicationsAction([
      { name: "Amlodipine 5mg", dosage: "1 tab", instructions: "", times: ["09:00"], durationDays: 5 },
      { name: "SOS painkiller", dosage: "", instructions: "when needed", times: [], durationDays: null },
    ]);
    expect(res).toMatchObject({ ok: true, message: "2 medicine(s) added." });
    const meds = await repo.listMedications(state.db, state.viewer!.circle!.id);
    expect(meds.find((m) => m.name === "Amlodipine 5mg")?.endDate).not.toBeNull();
    expect(await addScannedMedicationsAction([{ name: "", dosage: "", instructions: "", times: [], durationDays: null }])).toMatchObject({ ok: false });
  });

  it("explains a medicine only when Gemini is configured", async () => {
    await saveMedicationAction(null, form({ name: "Aspirin", dosage: "", instructions: "", times: ["08:00"], startDate: "2026-11-01", endDate: "", stock: "", refillThreshold: "5" }));
    const [med] = await repo.listMedications(state.db, state.viewer!.circle!.id);
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(await explainMedicineAction(med.id)).toMatchObject({ ok: false, error: expect.stringMatching(/not configured/) });
    vi.unstubAllEnvs();
  });
});

describe("AI actions with Gemini (mocked API)", () => {
  function mockGemini(payload: unknown) {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }))),
    );
  }

  it("explains a medicine, writes a digest and scans a prescription", async () => {
    const { careDigestAction, scanPrescriptionAction } = await import("@/app/actions/ai");
    await saveMedicationAction(null, form({ name: "Aspirin", dosage: "", instructions: "", times: ["08:00"], startDate: "2026-11-01", endDate: "", stock: "", refillThreshold: "5" }));
    const [med] = await repo.listMedications(state.db, state.viewer!.circle!.id);

    mockGemini({ whatItIsFor: "Thins the blood", howToTake: "After food", commonSideEffects: [], callDoctorIf: [] });
    expect(await explainMedicineAction(med.id)).toMatchObject({ ok: true, explanation: { whatItIsFor: "Thins the blood" } });

    mockGemini({ headline: "Good week", summary: "Well done", suggestions: [] });
    expect(await careDigestAction()).toMatchObject({ ok: true, digest: { headline: "Good week" } });

    mockGemini({ medications: [{ name: "Metformin 500mg", dosage: "1", instructions: "", times: ["08:00"], durationDays: null }], notes: "" });
    const photo = new File([new Uint8Array([1, 2, 3])], "rx.png", { type: "image/png" });
    const withPhoto = new FormData();
    withPhoto.append("photo", photo);
    expect(await scanPrescriptionAction(null, withPhoto)).toMatchObject({
      ok: true,
      medications: [expect.objectContaining({ name: "Metformin 500mg" })],
    });

    const notImage = new FormData();
    notImage.append("photo", new File(["x"], "a.txt", { type: "text/plain" }));
    expect(await scanPrescriptionAction(null, notImage)).toMatchObject({ ok: false, error: expect.stringMatching(/JPG/) });
    expect(await scanPrescriptionAction(null, new FormData())).toMatchObject({ ok: false });

    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("needs at least one medicine for a digest", async () => {
    const { careDigestAction } = await import("@/app/actions/ai");
    expect(await careDigestAction()).toMatchObject({ ok: false, error: expect.stringMatching(/Add a medicine/) });
  });
});
