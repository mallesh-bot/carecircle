import "server-only";
import type { Db } from "./db";
import { sendEmail } from "./email";
import { env } from "./env";
import { planReminders } from "./reminders";
import * as repo from "./repo";
import { TIME } from "./time";

/** Page loads and cron may both trigger reminders; a circle is checked at most this often. */
const MIN_INTERVAL_SECONDS = 120;
/** Circles processed in parallel by the cron job. */
const CONCURRENCY = 5;

export function appUrl(): string {
  const e = env();
  if (e.APP_URL) return e.APP_URL.replace(/\/$/, "");
  if (e.VERCEL_PROJECT_PRODUCTION_URL) return `https://${e.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

/**
 * Plans and delivers due reminders for one circle. Idempotent: each reminder
 * is claimed by a unique dedupe key before it is sent. Unless `force` is set,
 * runs are throttled per circle so frequent triggers stay cheap.
 */
export async function runRemindersForCircle(db: Db, circleId: string, { force = false, now = new Date() } = {}): Promise<number> {
  if (!force && !(await repo.claimReminderRun(db, circleId, MIN_INTERVAL_SECONDS))) return 0;
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

  let created = 0;
  for (const reminder of planned) {
    const id = await repo.claimNotification(db, circleId, reminder);
    if (!id) continue; // already handled by an earlier run
    created++;
    try {
      if (await sendEmail({ to: reminder.recipients, subject: reminder.subject, text: reminder.text })) {
        await repo.markNotificationDelivered(db, id);
      }
    } catch (err) {
      // The reminder stays visible in the app even if email delivery fails.
      console.error("reminder email failed", { circleId, kind: reminder.kind, error: String(err) });
    }
  }
  return created;
}

/** Runs reminders for every circle that has something to remind about, a few at a time. */
export async function runAllReminders(db: Db, now = new Date()): Promise<number> {
  const queue = await repo.listCirclesNeedingReminders(db);
  let total = 0;
  const worker = async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      total += await runRemindersForCircle(db, id, { now });
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return total;
}
