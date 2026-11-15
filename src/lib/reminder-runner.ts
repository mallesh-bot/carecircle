import "server-only";
import type { Db } from "./db";
import { sendEmail } from "./email";
import { planReminders } from "./reminders";
import * as repo from "./repo";
import { TIME } from "./time";

export function appUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

/** Plans and delivers due reminders for one circle. Safe to call repeatedly. */
export async function runRemindersForCircle(db: Db, circleId: string, now = new Date()): Promise<number> {
  const circle = await repo.getCircle(db, circleId);
  if (!circle) return 0;
  const [members, medications, logs, appointments] = await Promise.all([
    repo.listMembers(db, circleId),
    repo.listMedications(db, circleId),
    repo.listDoseLogsSince(db, circleId, new Date(now.getTime() - 2 * TIME.DAY)),
    repo.listAppointments(db, circleId, now),
  ]);
  const planned = planReminders(
    { circleId, elderName: circle.elderName, timezone: circle.timezone, members, medications, logs, appointments, appUrl: appUrl() },
    now,
  );

  let sent = 0;
  for (const r of planned) {
    const id = await repo.claimNotification(db, circleId, r);
    if (!id) continue; // already handled by an earlier run
    sent++;
    try {
      if (await sendEmail({ to: r.recipients, subject: r.subject, text: r.text })) {
        await repo.markNotificationDelivered(db, id);
      }
    } catch (err) {
      console.error("reminder email failed", { circleId, kind: r.kind, err: String(err) });
    }
  }
  return sent;
}

export async function runAllReminders(db: Db, now = new Date()): Promise<number> {
  let total = 0;
  for (const id of await repo.listCircleIds(db)) total += await runRemindersForCircle(db, id, now);
  return total;
}
