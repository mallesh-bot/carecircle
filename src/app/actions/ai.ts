"use server";

import { fail, ok, RATE_LIMITED, refreshCircle, type ActionState } from "@/lib/action-utils";
import { getDb } from "@/lib/db";
import { careDigest, explainMedicine, extractPrescription, GeminiError, type CareDigest, type ExtractedMedication, type MedicineExplanation } from "@/lib/gemini";
import { consume, LIMITS } from "@/lib/rate-limit";
import * as repo from "@/lib/repo";
import { computeAdherence, needsRefill } from "@/lib/schedule";
import { requireViewer } from "@/lib/session";
import { addDays, localDate, TIME } from "@/lib/time";
import { medicationSchema, scannedMedicationsSchema, uuid } from "@/lib/validation";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);

const aiError = (err: unknown, fallback: string) => ({ ok: false as const, error: err instanceof GeminiError ? err.message : fallback });

async function allowAi(circleId: string): Promise<boolean> {
  return consume(await getDb(), `ai:${circleId}`, LIMITS.ai);
}

// ---------------------------------------------------------------- prescription scan

export type ScanState = { ok: boolean; error?: string; medications?: ExtractedMedication[]; notes?: string } | null;

export async function scanPrescriptionAction(_: ScanState, fd: FormData): Promise<ScanState> {
  const { circle } = await requireViewer();
  const file = fd.get("photo");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a photo of the prescription." };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: "Photo is too large (max 4 MB)." };
  if (!IMAGE_TYPES.has(file.type)) return { ok: false, error: "Use a JPG, PNG, WEBP or HEIC photo." };
  if (!(await allowAi(circle.id))) return { ok: false, error: RATE_LIMITED };
  try {
    const data = Buffer.from(await file.arrayBuffer()).toString("base64");
    const result = await extractPrescription(data, file.type);
    if (result.medications.length === 0) return { ok: false, error: "No medicines found in that photo. Try a clearer picture." };
    return { ok: true, medications: result.medications, notes: result.notes };
  } catch (err) {
    return aiError(err, "Could not read the prescription.");
  }
}

/** Saves the medicines a family member confirmed after reviewing a scan. */
export async function addScannedMedicationsAction(items: ExtractedMedication[]): Promise<ActionState> {
  const { member, circle } = await requireViewer();
  const parsed = scannedMedicationsSchema.safeParse(items);
  if (!parsed.success) return fail("Nothing could be added.");
  const today = localDate(new Date(), circle.timezone);
  const db = await getDb();

  let added = 0;
  for (const item of parsed.data) {
    const med = medicationSchema.safeParse({
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
    if (!med.success) continue;
    await repo.createMedication(db, circle.id, med.data);
    added++;
  }
  if (!added) return fail("Nothing could be added.");
  await repo.addActivity(db, circle.id, member.name, `added ${added} medicine(s) from a scanned prescription`);
  refreshCircle();
  return ok(`${added} medicine(s) added.`);
}

// ---------------------------------------------------------------- explain a medicine

export type ExplainState = { ok: boolean; error?: string; explanation?: MedicineExplanation } | null;

export async function explainMedicineAction(medicationId: string): Promise<ExplainState> {
  const { circle } = await requireViewer();
  if (!uuid.safeParse(medicationId).success) return { ok: false, error: "Invalid medicine." };
  const med = await repo.getMedication(await getDb(), circle.id, medicationId);
  if (!med) return { ok: false, error: "Medicine not found." };
  if (!(await allowAi(circle.id))) return { ok: false, error: RATE_LIMITED };
  try {
    return { ok: true, explanation: await explainMedicine(med, circle.language) };
  } catch (err) {
    return aiError(err, "Could not get an explanation.");
  }
}

// ---------------------------------------------------------------- weekly digest

export type DigestState = { ok: boolean; error?: string; digest?: CareDigest } | null;

export async function careDigestAction(): Promise<DigestState> {
  const { circle } = await requireViewer();
  const db = await getDb();
  const now = new Date();
  const [meds, logs, appts] = await Promise.all([
    repo.listMedications(db, circle.id),
    repo.listDoseLogsSince(db, circle.id, new Date(now.getTime() - 8 * TIME.DAY)),
    repo.listAppointments(db, circle.id, now),
  ]);
  if (meds.length === 0) return { ok: false, error: "Add a medicine first — the digest summarises the week's doses." };
  if (!(await allowAi(circle.id))) return { ok: false, error: RATE_LIMITED };

  const adherence = computeAdherence(meds, logs, circle.timezone, now);
  // Only aggregate, non-identifying facts are sent to the model.
  const facts = [
    `7-day adherence: ${adherence.rate ?? "n/a"}% (${adherence.taken} taken, ${adherence.missed} missed, ${adherence.skipped} skipped)`,
    ...adherence.byMedication.map((m) => `- ${m.name}: ${m.rate ?? "n/a"}% adherence, ${m.missed} missed`),
    ...adherence.days.map((d) => `${d.date}: ${d.taken} taken, ${d.missed} missed, ${d.skipped} skipped`),
    `Medicines needing refill: ${needsRefill(meds).map((m) => m.name).join(", ") || "none"}`,
    `Upcoming appointments: ${appts.slice(0, 3).map((a) => a.title).join(", ") || "none"}`,
  ].join("\n");
  try {
    return { ok: true, digest: await careDigest(facts, circle.language) };
  } catch (err) {
    return aiError(err, "Could not create the digest.");
  }
}
