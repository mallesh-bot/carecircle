/** Appointments, the activity feed, notifications and login throttling. */
import type { Db } from "../db";
import type { Activity, Appointment, Notification, ReminderKind } from "../types";
import type { AppointmentInput } from "../validation";
import { toActivity, toAppointment, toNotification } from "./mappers";

// ---------------------------------------------------------------- appointments

export async function listAppointments(db: Db, circleId: string, from: Date): Promise<Appointment[]> {
  const { rows } = await db.query(`SELECT * FROM appointments WHERE circle_id = $1 AND starts_at >= $2 ORDER BY starts_at`, [circleId, from]);
  return rows.map(toAppointment);
}

export async function createAppointment(db: Db, circleId: string, a: AppointmentInput, startsAt: Date): Promise<Appointment> {
  const { rows } = await db.query(
    `INSERT INTO appointments (circle_id, title, doctor, location, starts_at, notes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [circleId, a.title, a.doctor, a.location, startsAt, a.notes],
  );
  return toAppointment(rows[0]);
}

export async function updateAppointment(db: Db, circleId: string, id: string, a: AppointmentInput, startsAt: Date): Promise<boolean> {
  const { rows } = await db.query(
    `UPDATE appointments SET title = $3, doctor = $4, location = $5, starts_at = $6, notes = $7
     WHERE circle_id = $1 AND id = $2 RETURNING id`,
    [circleId, id, a.title, a.doctor, a.location, startsAt, a.notes],
  );
  return rows.length > 0;
}

export async function deleteAppointment(db: Db, circleId: string, id: string): Promise<boolean> {
  const { rows } = await db.query(`DELETE FROM appointments WHERE circle_id = $1 AND id = $2 RETURNING id`, [circleId, id]);
  return rows.length > 0;
}

// ---------------------------------------------------------------- activity feed

export async function addActivity(db: Db, circleId: string, actor: string, message: string): Promise<void> {
  await db.query(`INSERT INTO activity (circle_id, actor, message) VALUES ($1, $2, $3)`, [circleId, actor, message]);
}

export async function listActivity(db: Db, circleId: string, limit = 15): Promise<Activity[]> {
  const { rows } = await db.query(`SELECT * FROM activity WHERE circle_id = $1 ORDER BY created_at DESC LIMIT $2`, [circleId, limit]);
  return rows.map(toActivity);
}

// ---------------------------------------------------------------- notifications

/** Inserts a notification unless its dedupe key exists. Returns the new id, or null if already handled. */
export async function claimNotification(
  db: Db,
  circleId: string,
  n: { dedupeKey: string; kind: ReminderKind; recipients: string[]; subject: string },
): Promise<string | null> {
  const { rows } = await db.query(
    `INSERT INTO notifications (circle_id, dedupe_key, kind, recipients, subject) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`,
    [circleId, n.dedupeKey, n.kind, n.recipients, n.subject],
  );
  return rows[0] ? String(rows[0].id) : null;
}

export async function markNotificationDelivered(db: Db, id: string): Promise<void> {
  await db.query(`UPDATE notifications SET delivered = true WHERE id = $1`, [id]);
}

export async function listNotifications(db: Db, circleId: string, limit = 10): Promise<Notification[]> {
  const { rows } = await db.query(`SELECT * FROM notifications WHERE circle_id = $1 ORDER BY created_at DESC LIMIT $2`, [circleId, limit]);
  return rows.map(toNotification);
}

// ---------------------------------------------------------------- login throttling

export async function recordLoginAttempt(db: Db, code: string, succeeded: boolean): Promise<void> {
  await db.query(`INSERT INTO login_attempts (circle_code, succeeded) VALUES ($1, $2)`, [code, succeeded]);
}

export async function recentFailedAttempts(db: Db, code: string, windowMinutes: number): Promise<number> {
  const { rows } = await db.query<{ n: string | number }>(
    `SELECT count(*) AS n FROM login_attempts
     WHERE circle_code = $1 AND NOT succeeded AND created_at > now() - make_interval(mins => $2)`,
    [code, windowMinutes],
  );
  return Number(rows[0]?.n ?? 0);
}
