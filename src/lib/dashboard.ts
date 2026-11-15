import "server-only";
import { getDb } from "./db";
import * as repo from "./repo";
import { buildDaySchedule, computeAdherence, needsRefill } from "./schedule";
import { localDate, TIME } from "./time";

/** Everything the circle dashboard needs, fetched in parallel. */
export async function loadDashboard(circleId: string, timezone: string, now = new Date()) {
  const db = await getDb();
  const [members, medications, logs, appointments, activity, notifications] = await Promise.all([
    repo.listMembers(db, circleId),
    repo.listMedications(db, circleId),
    repo.listDoseLogsSince(db, circleId, new Date(now.getTime() - 8 * TIME.DAY)),
    repo.listAppointments(db, circleId, new Date(now.getTime() - 2 * 60 * TIME.MINUTE)),
    repo.listActivity(db, circleId),
    repo.listNotifications(db, circleId),
  ]);
  const today = localDate(now, timezone);
  return {
    today,
    members,
    medications,
    appointments,
    activity,
    notifications,
    schedule: buildDaySchedule(medications, logs, today, timezone, now),
    adherence: computeAdherence(medications, logs, timezone, now),
    refills: needsRefill(medications),
  };
}
