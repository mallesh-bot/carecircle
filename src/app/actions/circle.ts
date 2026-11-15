"use server";

import { fail, invalid, ok, RATE_LIMITED, refreshCircle, text, type ActionState } from "@/lib/action-utils";
import { getDb } from "@/lib/db";
import { consume, LIMITS } from "@/lib/rate-limit";
import { runRemindersForCircle } from "@/lib/reminder-runner";
import * as repo from "@/lib/repo";
import { requireViewer } from "@/lib/session";
import { canManageMembers, canRemove } from "@/lib/permissions";
import { emergencySchema, memberUpdateSchema, uuid } from "@/lib/validation";

export async function updateMyNotificationsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { member, circle } = await requireViewer();
  const parsed = memberUpdateSchema.safeParse({ email: text(fd, "email"), notify: fd.get("notify") === "on" });
  if (!parsed.success) return invalid(parsed.error);
  await repo.updateMember(await getDb(), circle.id, member.id, parsed.data);
  refreshCircle();
  return ok("Notification settings saved.");
}

export async function removeMemberAction(memberId: string): Promise<ActionState> {
  const { member, circle } = await requireViewer();
  if (!canManageMembers(member.role)) return fail("Only the elder or a caretaker can remove members.");
  if (!uuid.safeParse(memberId).success) return fail("Invalid member.");
  const db = await getDb();
  const target = (await repo.listMembers(db, circle.id)).find((m) => m.id === memberId);
  if (!target) return fail("Member not found.");
  if (!canRemove(member.role, target.role, target.id === member.id)) return fail("The elder and yourself can't be removed.");
  await repo.removeMember(db, circle.id, memberId);
  await repo.addActivity(db, circle.id, member.name, `removed ${target.name} from the circle`);
  refreshCircle();
  return ok("Member removed.");
}

export async function saveEmergencyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { member, circle } = await requireViewer();
  const parsed = emergencySchema.safeParse({
    bloodGroup: text(fd, "bloodGroup"),
    conditions: text(fd, "conditions"),
    allergies: text(fd, "allergies"),
    emergencyContact: text(fd, "emergencyContact"),
    doctorContact: text(fd, "doctorContact"),
    language: text(fd, "language"),
  });
  if (!parsed.success) return invalid(parsed.error);
  const db = await getDb();
  await repo.updateEmergencyInfo(db, circle.id, parsed.data);
  await repo.addActivity(db, circle.id, member.name, "updated the health profile");
  refreshCircle();
  return ok("Health profile saved.");
}

export async function sendRemindersNowAction(): Promise<ActionState> {
  const { circle } = await requireViewer();
  const db = await getDb();
  if (!(await consume(db, `remind:${circle.id}`, LIMITS.sendReminders))) return fail(RATE_LIMITED);
  const sent = await runRemindersForCircle(db, circle.id, { force: true });
  refreshCircle();
  return ok(sent ? `${sent} new reminder(s) sent.` : "Everything is up to date — no reminders due right now.");
}
