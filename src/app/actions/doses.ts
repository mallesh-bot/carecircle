"use server";

import { fail, ok, refreshCircle, type ActionState } from "@/lib/action-utils";
import { getDb } from "@/lib/db";
import * as repo from "@/lib/repo";
import { requireViewer } from "@/lib/session";
import { TIME } from "@/lib/time";
import { doseActionSchema } from "@/lib/validation";

/** Doses can be logged from two days back up to twelve hours ahead (people take medicine early). */
const LOG_WINDOW_PAST_MS = 2 * TIME.DAY;
const LOG_WINDOW_FUTURE_MS = 12 * 60 * TIME.MINUTE;

export async function logDoseAction(medicationId: string, scheduledAtIso: string, status: "taken" | "skipped" | "undo"): Promise<ActionState> {
  const { member, circle } = await requireViewer();
  const parsed = doseActionSchema.safeParse({ medicationId, scheduledAt: scheduledAtIso, status });
  if (!parsed.success) return fail("Invalid dose.");
  const { scheduledAt } = parsed.data;

  const drift = scheduledAt.getTime() - Date.now();
  if (drift > LOG_WINDOW_FUTURE_MS || drift < -LOG_WINDOW_PAST_MS) return fail("That dose is outside the logging window.");

  const db = await getDb();
  const med = await repo.getMedication(db, circle.id, medicationId);
  if (!med) return fail("Medicine not found.");

  if (parsed.data.status === "undo") {
    await repo.undoDose(db, circle.id, medicationId, scheduledAt);
    await repo.addActivity(db, circle.id, member.name, `undid a log for ${med.name}`);
  } else {
    await repo.logDose(db, circle.id, medicationId, scheduledAt, parsed.data.status, member.name);
    await repo.addActivity(db, circle.id, member.name, `marked ${med.name} as ${parsed.data.status}`);
  }
  refreshCircle();
  return ok(parsed.data.status === "undo" ? `${med.name}: log undone.` : `${med.name} marked as ${parsed.data.status}.`);
}
