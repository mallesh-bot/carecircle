"use server";

import { fail, invalid, ok, optionalText, refreshCircle, text, type ActionState } from "@/lib/action-utils";
import { getDb } from "@/lib/db";
import * as repo from "@/lib/repo";
import { requireViewer } from "@/lib/session";
import { medicationSchema, uuid } from "@/lib/validation";

function parseMedication(fd: FormData) {
  return medicationSchema.safeParse({
    name: text(fd, "name"),
    dosage: text(fd, "dosage"),
    instructions: text(fd, "instructions"),
    times: fd.getAll("times").map(String).filter(Boolean),
    daysOfWeek: fd.getAll("days").map(String),
    startDate: text(fd, "startDate"),
    endDate: optionalText(fd, "endDate"),
    stock: optionalText(fd, "stock"),
    refillThreshold: optionalText(fd, "refillThreshold") ?? "5",
  });
}

export async function saveMedicationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { member, circle } = await requireViewer();
  const parsed = parseMedication(fd);
  if (!parsed.success) return invalid(parsed.error);
  const db = await getDb();
  const id = text(fd, "id");

  if (id) {
    if (!uuid.safeParse(id).success || !(await repo.updateMedication(db, circle.id, id, parsed.data))) return fail("Medicine not found.");
    await repo.addActivity(db, circle.id, member.name, `updated ${parsed.data.name}`);
  } else {
    await repo.createMedication(db, circle.id, parsed.data);
    await repo.addActivity(db, circle.id, member.name, `added ${parsed.data.name} (${parsed.data.times.join(", ")})`);
  }
  refreshCircle();
  return ok(`${parsed.data.name} saved.`);
}

export async function deleteMedicationAction(id: string): Promise<ActionState> {
  const { member, circle } = await requireViewer();
  if (!uuid.safeParse(id).success) return fail("Invalid medicine.");
  const db = await getDb();
  const med = await repo.getMedication(db, circle.id, id);
  if (!med || !(await repo.deleteMedication(db, circle.id, id))) return fail("Medicine not found.");
  await repo.addActivity(db, circle.id, member.name, `removed ${med.name}`);
  refreshCircle();
  return ok(`${med.name} removed.`);
}

export async function setMedicationActiveAction(id: string, active: boolean): Promise<ActionState> {
  const { member, circle } = await requireViewer();
  if (!uuid.safeParse(id).success || typeof active !== "boolean") return fail("Invalid medicine.");
  const db = await getDb();
  const med = await repo.getMedication(db, circle.id, id);
  if (!med || !(await repo.setMedicationActive(db, circle.id, id, active))) return fail("Medicine not found.");
  await repo.addActivity(db, circle.id, member.name, `${active ? "resumed" : "paused"} ${med.name}`);
  refreshCircle();
  return ok(`${med.name} ${active ? "resumed" : "paused"}.`);
}
