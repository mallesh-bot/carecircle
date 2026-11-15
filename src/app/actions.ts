"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hashPasscode, normalizeCircleCode, verifyPasscode } from "@/lib/crypto";
import { getDb } from "@/lib/db";
import { careDigest, explainMedicine, extractPrescription, GeminiError, type CareDigest, type ExtractedMedication, type MedicineExplanation } from "@/lib/gemini";
import { seedDemoCircle } from "@/lib/demo";
import { runRemindersForCircle } from "@/lib/reminder-runner";
import * as repo from "@/lib/repo";
import { computeAdherence, needsRefill } from "@/lib/schedule";
import { getViewer, requireViewer, signIn, signOut } from "@/lib/session";
import { addDays, localDate, parseLocalDateTime, TIME } from "@/lib/time";
import {
  appointmentSchema,
  createCircleSchema,
  emergencySchema,
  firstError,
  joinCircleSchema,
  medicationSchema,
  memberUpdateSchema,
  uuid,
} from "@/lib/validation";

export type ActionState = { ok: boolean; error?: string; message?: string } | null;

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "");
const optionalNumber = (fd: FormData, key: string) => (str(fd, key).trim() === "" ? null : str(fd, key));

function refresh() {
  revalidatePath("/circle");
}

// ---------------------------------------------------------------- onboarding

export async function createCircleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = createCircleSchema.safeParse({
    elderName: str(fd, "elderName"),
    yourName: str(fd, "yourName"),
    yourEmail: str(fd, "yourEmail"),
    yourRole: str(fd, "yourRole"),
    passcode: str(fd, "passcode"),
    timezone: str(fd, "timezone"),
    language: str(fd, "language"),
  });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const input = parsed.data;
  const db = await getDb();
  const circle = await repo.createCircle(db, {
    elderName: input.elderName,
    timezone: input.timezone,
    language: input.language,
    passcodeHash: await hashPasscode(input.passcode),
  });
  const member = await repo.addMember(db, circle.id, { name: input.yourName, email: input.yourEmail, role: input.yourRole });
  await repo.addActivity(db, circle.id, input.yourName, `created ${circle.name}`);
  await signIn(member.id);
  redirect("/circle?welcome=1");
}

export async function joinCircleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = joinCircleSchema.safeParse({
    code: str(fd, "code"),
    passcode: str(fd, "passcode"),
    name: str(fd, "name"),
    email: str(fd, "email"),
    role: str(fd, "role"),
  });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const input = parsed.data;
  const code = normalizeCircleCode(input.code);
  const db = await getDb();

  if ((await repo.recentFailedAttempts(db, code, LOCKOUT_MINUTES)) >= MAX_FAILED_LOGINS) {
    return { ok: false, error: `Too many wrong attempts. Please wait ${LOCKOUT_MINUTES} minutes and try again.` };
  }
  const circle = await repo.findCircleForLogin(db, code);
  const valid = circle ? await verifyPasscode(input.passcode, circle.passcodeHash) : false;
  await repo.recordLoginAttempt(db, code, valid);
  // Same message for unknown code and wrong passcode, so codes can't be probed.
  if (!circle || !valid) return { ok: false, error: "That circle code and passcode don't match." };

  const member = await repo.addMember(db, circle.id, { name: input.name, email: input.email, role: input.role });
  await repo.addActivity(db, circle.id, input.name, `joined the circle as ${input.role}`);
  await signIn(member.id);
  redirect("/circle");
}

/** One-click demo: a private, pre-filled circle so visitors can try every feature. */
export async function startDemoAction(): Promise<void> {
  const db = await getDb();
  const { circle, visitor } = await seedDemoCircle(db, "You (demo)");
  await runRemindersForCircle(db, circle.id); // populate the reminder log right away
  await signIn(visitor.id);
  redirect("/circle?demo=1");
}

export async function signOutAction(): Promise<void> {
  await signOut();
  redirect("/");
}

// ---------------------------------------------------------------- medications

function parseMedication(fd: FormData) {
  return medicationSchema.safeParse({
    name: str(fd, "name"),
    dosage: str(fd, "dosage"),
    instructions: str(fd, "instructions"),
    times: fd.getAll("times").map(String).filter(Boolean),
    daysOfWeek: fd.getAll("days").map(String),
    startDate: str(fd, "startDate"),
    endDate: str(fd, "endDate") || null,
    stock: optionalNumber(fd, "stock"),
    refillThreshold: str(fd, "refillThreshold") || "5",
  });
}

export async function saveMedicationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { member, circle } = await requireViewer();
  const parsed = parseMedication(fd);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const db = await getDb();
  const id = str(fd, "id");
  if (id) {
    if (!uuid.safeParse(id).success || !(await repo.updateMedication(db, circle.id, id, parsed.data))) {
      return { ok: false, error: "Medicine not found." };
    }
    await repo.addActivity(db, circle.id, member.name, `updated ${parsed.data.name}`);
  } else {
    await repo.createMedication(db, circle.id, parsed.data);
    await repo.addActivity(db, circle.id, member.name, `added ${parsed.data.name} (${parsed.data.times.join(", ")})`);
  }
  refresh();
  return { ok: true, message: `${parsed.data.name} saved.` };
}

export async function deleteMedicationAction(id: string): Promise<ActionState> {
  const { member, circle } = await requireViewer();
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid medicine." };
  const db = await getDb();
  const med = await repo.getMedication(db, circle.id, id);
  if (!med || !(await repo.deleteMedication(db, circle.id, id))) return { ok: false, error: "Medicine not found." };
  await repo.addActivity(db, circle.id, member.name, `removed ${med.name}`);
  refresh();
  return { ok: true };
}

export async function setMedicationActiveAction(id: string, active: boolean): Promise<ActionState> {
  const { member, circle } = await requireViewer();
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid medicine." };
  const db = await getDb();
  const med = await repo.getMedication(db, circle.id, id);
  if (!med) return { ok: false, error: "Medicine not found." };
  await repo.setMedicationActive(db, circle.id, id, active);
  await repo.addActivity(db, circle.id, member.name, `${active ? "resumed" : "paused"} ${med.name}`);
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------- doses

export async function logDoseAction(medicationId: string, scheduledAtIso: string, status: "taken" | "skipped" | "undo"): Promise<ActionState> {
  const { member, circle } = await requireViewer();
  const scheduledAt = new Date(scheduledAtIso);
  if (!uuid.safeParse(medicationId).success || Number.isNaN(scheduledAt.getTime())) return { ok: false, error: "Invalid dose." };
  // Doses can be logged from two days back up to 12 hours ahead.
  const drift = scheduledAt.getTime() - Date.now();
  if (drift > 12 * 60 * TIME.MINUTE || drift < -2 * TIME.DAY) return { ok: false, error: "That dose is outside the logging window." };

  const db = await getDb();
  const med = await repo.getMedication(db, circle.id, medicationId);
  if (!med) return { ok: false, error: "Medicine not found." };
  if (status === "undo") {
    await repo.undoDose(db, circle.id, medicationId, scheduledAt);
    await repo.addActivity(db, circle.id, member.name, `undid a log for ${med.name}`);
  } else {
    await repo.logDose(db, circle.id, medicationId, scheduledAt, status, member.name);
    await repo.addActivity(db, circle.id, member.name, `marked ${med.name} as ${status}`);
  }
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------- appointments

export async function saveAppointmentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { member, circle } = await requireViewer();
  const parsed = appointmentSchema.safeParse({
    title: str(fd, "title"),
    doctor: str(fd, "doctor"),
    location: str(fd, "location"),
    startsAt: str(fd, "startsAt"),
    notes: str(fd, "notes"),
  });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const startsAt = parseLocalDateTime(parsed.data.startsAt, circle.timezone);
  const db = await getDb();
  const id = str(fd, "id");
  if (id) {
    if (!uuid.safeParse(id).success || !(await repo.updateAppointment(db, circle.id, id, parsed.data, startsAt))) {
      return { ok: false, error: "Appointment not found." };
    }
    await repo.addActivity(db, circle.id, member.name, `updated appointment "${parsed.data.title}"`);
  } else {
    await repo.createAppointment(db, circle.id, parsed.data, startsAt);
    await repo.addActivity(db, circle.id, member.name, `scheduled "${parsed.data.title}"`);
  }
  refresh();
  return { ok: true, message: "Appointment saved." };
}

export async function deleteAppointmentAction(id: string): Promise<ActionState> {
  const { member, circle } = await requireViewer();
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid appointment." };
  const db = await getDb();
  if (!(await repo.deleteAppointment(db, circle.id, id))) return { ok: false, error: "Appointment not found." };
  await repo.addActivity(db, circle.id, member.name, "cancelled an appointment");
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------- members & settings

export async function updateMyNotificationsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { member, circle } = await requireViewer();
  const parsed = memberUpdateSchema.safeParse({ email: str(fd, "email"), notify: fd.get("notify") === "on" });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  await repo.updateMember(await getDb(), circle.id, member.id, parsed.data);
  refresh();
  return { ok: true, message: "Notification settings saved." };
}

export async function removeMemberAction(memberId: string): Promise<ActionState> {
  const { member, circle } = await requireViewer();
  if (member.role === "family") return { ok: false, error: "Only the elder or a caretaker can remove members." };
  if (!uuid.safeParse(memberId).success || memberId === member.id) return { ok: false, error: "Invalid member." };
  const db = await getDb();
  await repo.removeMember(db, circle.id, memberId);
  await repo.addActivity(db, circle.id, member.name, "removed a member from the circle");
  refresh();
  return { ok: true };
}

export async function saveEmergencyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { member, circle } = await requireViewer();
  const parsed = emergencySchema.safeParse({
    bloodGroup: str(fd, "bloodGroup"),
    conditions: str(fd, "conditions"),
    allergies: str(fd, "allergies"),
    emergencyContact: str(fd, "emergencyContact"),
    doctorContact: str(fd, "doctorContact"),
    language: str(fd, "language"),
  });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const db = await getDb();
  await repo.updateEmergencyInfo(db, circle.id, parsed.data);
  await repo.addActivity(db, circle.id, member.name, "updated the health profile");
  refresh();
  return { ok: true, message: "Health profile saved." };
}

export async function sendRemindersNowAction(): Promise<ActionState> {
  const { circle } = await requireViewer();
  const sent = await runRemindersForCircle(await getDb(), circle.id);
  refresh();
  return { ok: true, message: sent ? `${sent} new reminder(s) sent.` : "Everything is up to date — no reminders due right now." };
}

// ---------------------------------------------------------------- Gemini AI

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];

export type ScanState = { ok: boolean; error?: string; medications?: ExtractedMedication[]; notes?: string } | null;

export async function scanPrescriptionAction(_: ScanState, fd: FormData): Promise<ScanState> {
  await requireViewer();
  const file = fd.get("photo");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a photo of the prescription." };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: "Photo is too large (max 4 MB)." };
  if (!IMAGE_TYPES.includes(file.type)) return { ok: false, error: "Use a JPG, PNG, WEBP or HEIC photo." };
  try {
    const data = Buffer.from(await file.arrayBuffer()).toString("base64");
    const result = await extractPrescription(data, file.type);
    if (result.medications.length === 0) return { ok: false, error: "No medicines found in that photo. Try a clearer picture." };
    return { ok: true, medications: result.medications, notes: result.notes };
  } catch (err) {
    return { ok: false, error: err instanceof GeminiError ? err.message : "Could not read the prescription." };
  }
}

export async function addScannedMedicationsAction(items: ExtractedMedication[]): Promise<ActionState> {
  const { member, circle } = await requireViewer();
  const today = localDate(new Date(), circle.timezone);
  const db = await getDb();
  let added = 0;
  for (const item of items.slice(0, 20)) {
    const parsed = medicationSchema.safeParse({
      name: item.name,
      dosage: item.dosage,
      instructions: item.instructions,
      times: item.times.length ? item.times : ["08:00"],
      daysOfWeek: [],
      startDate: today,
      endDate: item.durationDays ? addDays(today, item.durationDays - 1) : null,
      stock: null,
      refillThreshold: 5,
    });
    if (!parsed.success) continue;
    await repo.createMedication(db, circle.id, parsed.data);
    added++;
  }
  if (added) await repo.addActivity(db, circle.id, member.name, `added ${added} medicine(s) from a scanned prescription`);
  refresh();
  return added ? { ok: true, message: `${added} medicine(s) added.` } : { ok: false, error: "Nothing could be added." };
}

export type ExplainState = { ok: boolean; error?: string; explanation?: MedicineExplanation } | null;

export async function explainMedicineAction(medicationId: string): Promise<ExplainState> {
  const { circle } = await requireViewer();
  if (!uuid.safeParse(medicationId).success) return { ok: false, error: "Invalid medicine." };
  const med = await repo.getMedication(await getDb(), circle.id, medicationId);
  if (!med) return { ok: false, error: "Medicine not found." };
  try {
    return { ok: true, explanation: await explainMedicine(med, circle.language) };
  } catch (err) {
    return { ok: false, error: err instanceof GeminiError ? err.message : "Could not get an explanation." };
  }
}

export type DigestState = { ok: boolean; error?: string; digest?: CareDigest } | null;

export async function careDigestAction(): Promise<DigestState> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Please sign in again." };
  const { circle } = viewer;
  const db = await getDb();
  const now = new Date();
  const [meds, logs, appts] = await Promise.all([
    repo.listMedications(db, circle.id),
    repo.listDoseLogsSince(db, circle.id, new Date(now.getTime() - 8 * TIME.DAY)),
    repo.listAppointments(db, circle.id, now),
  ]);
  if (meds.length === 0) return { ok: false, error: "Add a medicine first — the digest summarises the week's doses." };
  const adherence = computeAdherence(meds, logs, circle.timezone, now);
  const facts = [
    `Elder: ${circle.elderName}`,
    `7-day adherence: ${adherence.rate ?? "n/a"}% (${adherence.taken} taken, ${adherence.missed} missed, ${adherence.skipped} skipped)`,
    ...adherence.byMedication.map((m) => `- ${m.name}: ${m.rate ?? "n/a"}% adherence, ${m.missed} missed`),
    ...adherence.days.map((d) => `${d.date}: ${d.taken} taken, ${d.missed} missed, ${d.skipped} skipped`),
    `Medicines needing refill: ${needsRefill(meds).map((m) => m.name).join(", ") || "none"}`,
    `Upcoming appointments: ${appts.slice(0, 3).map((a) => a.title).join(", ") || "none"}`,
  ].join("\n");
  try {
    return { ok: true, digest: await careDigest(facts, circle.language) };
  } catch (err) {
    return { ok: false, error: err instanceof GeminiError ? err.message : "Could not create the digest." };
  }
}
