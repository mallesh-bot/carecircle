"use server";

import { fail, invalid, ok, refreshCircle, text, type ActionState } from "@/lib/action-utils";
import { getDb } from "@/lib/db";
import * as repo from "@/lib/repo";
import { requireViewer } from "@/lib/session";
import { parseLocalDateTime } from "@/lib/time";
import { appointmentSchema, uuid } from "@/lib/validation";

export async function saveAppointmentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { member, circle } = await requireViewer();
  const parsed = appointmentSchema.safeParse({
    title: text(fd, "title"),
    doctor: text(fd, "doctor"),
    location: text(fd, "location"),
    startsAt: text(fd, "startsAt"),
    notes: text(fd, "notes"),
  });
  if (!parsed.success) return invalid(parsed.error);
  const startsAt = parseLocalDateTime(parsed.data.startsAt, circle.timezone);
  const db = await getDb();
  const id = text(fd, "id");

  if (id) {
    if (!uuid.safeParse(id).success || !(await repo.updateAppointment(db, circle.id, id, parsed.data, startsAt))) return fail("Appointment not found.");
    await repo.addActivity(db, circle.id, member.name, `updated appointment "${parsed.data.title}"`);
  } else {
    await repo.createAppointment(db, circle.id, parsed.data, startsAt);
    await repo.addActivity(db, circle.id, member.name, `scheduled "${parsed.data.title}"`);
  }
  refreshCircle();
  return ok("Appointment saved.");
}

export async function deleteAppointmentAction(id: string): Promise<ActionState> {
  const { member, circle } = await requireViewer();
  if (!uuid.safeParse(id).success) return fail("Invalid appointment.");
  const db = await getDb();
  if (!(await repo.deleteAppointment(db, circle.id, id))) return fail("Appointment not found.");
  await repo.addActivity(db, circle.id, member.name, "cancelled an appointment");
  refreshCircle();
  return ok("Appointment cancelled.");
}
