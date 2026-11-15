/**
 * Data access layer. Every query is parameterised and every write is scoped by
 * circle_id, so one circle can never read or change another circle's data.
 */
import type { Db } from "./db";
import { generateCircleCode, randomToken, sha256 } from "./crypto";
import type {
  Activity,
  Appointment,
  Circle,
  DoseLog,
  LoggedDoseStatus,
  Medication,
  Member,
  Notification,
  ReminderKind,
  Role,
} from "./types";
import type { AppointmentInput, EmergencyInput, Language, MedicationInput } from "./validation";

type Row = Record<string, unknown>;

const asDate = (v: unknown) => (v instanceof Date ? v : new Date(String(v)));
const asIsoDate = (v: unknown): string =>
  v instanceof Date
    ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`
    : String(v).slice(0, 10);

export interface CircleDetails extends Circle {
  language: Language;
  bloodGroup: string;
  conditions: string;
  allergies: string;
  emergencyContact: string;
  doctorContact: string;
  cardToken: string;
}

function toCircle(r: Row): CircleDetails {
  return {
    id: String(r.id),
    code: String(r.code),
    name: String(r.name),
    elderName: String(r.elder_name),
    timezone: String(r.timezone),
    language: String(r.language) as Language,
    bloodGroup: String(r.blood_group),
    conditions: String(r.conditions),
    allergies: String(r.allergies),
    emergencyContact: String(r.emergency_contact),
    doctorContact: String(r.doctor_contact),
    cardToken: String(r.card_token),
    createdAt: asDate(r.created_at),
  };
}

function toMember(r: Row): Member {
  return {
    id: String(r.id),
    circleId: String(r.circle_id),
    name: String(r.name),
    email: r.email ? String(r.email) : null,
    role: String(r.role) as Role,
    notify: Boolean(r.notify),
    createdAt: asDate(r.created_at),
  };
}

function toMedication(r: Row): Medication {
  return {
    id: String(r.id),
    circleId: String(r.circle_id),
    name: String(r.name),
    dosage: String(r.dosage),
    instructions: String(r.instructions),
    times: (r.times as string[]) ?? [],
    daysOfWeek: ((r.days_of_week as number[]) ?? []).map(Number),
    startDate: asIsoDate(r.start_date),
    endDate: r.end_date ? asIsoDate(r.end_date) : null,
    stock: r.stock === null || r.stock === undefined ? null : Number(r.stock),
    refillThreshold: Number(r.refill_threshold),
    active: Boolean(r.active),
    createdAt: asDate(r.created_at),
  };
}

function toDoseLog(r: Row): DoseLog {
  return {
    id: String(r.id),
    medicationId: String(r.medication_id),
    scheduledAt: asDate(r.scheduled_at),
    status: String(r.status) as LoggedDoseStatus,
    loggedBy: String(r.logged_by),
    loggedAt: asDate(r.logged_at),
  };
}

function toAppointment(r: Row): Appointment {
  return {
    id: String(r.id),
    circleId: String(r.circle_id),
    title: String(r.title),
    doctor: String(r.doctor),
    location: String(r.location),
    startsAt: asDate(r.starts_at),
    notes: String(r.notes),
    createdAt: asDate(r.created_at),
  };
}

// ---------------------------------------------------------------- circles

export async function createCircle(
  db: Db,
  input: { elderName: string; timezone: string; language: Language; passcodeHash: string },
): Promise<CircleDetails> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const { rows } = await db.query(
        `INSERT INTO circles (code, name, elder_name, timezone, language, passcode_hash, card_token)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [
          generateCircleCode(),
          `${input.elderName}'s Care Circle`,
          input.elderName,
          input.timezone,
          input.language,
          input.passcodeHash,
          randomToken(18),
        ],
      );
      return toCircle(rows[0]);
    } catch (err) {
      // Retry only on the (astronomically rare) circle-code collision.
      if (!String(err).includes("unique") || attempt === 4) throw err;
    }
  }
  throw new Error("unreachable");
}

export async function findCircleForLogin(db: Db, code: string) {
  const { rows } = await db.query(`SELECT id, passcode_hash FROM circles WHERE code = $1`, [code]);
  return rows[0] ? { id: String(rows[0].id), passcodeHash: String(rows[0].passcode_hash) } : null;
}

export async function getCircle(db: Db, circleId: string): Promise<CircleDetails | null> {
  const { rows } = await db.query(`SELECT * FROM circles WHERE id = $1`, [circleId]);
  return rows[0] ? toCircle(rows[0]) : null;
}

export async function getCircleByCardToken(db: Db, token: string): Promise<CircleDetails | null> {
  const { rows } = await db.query(`SELECT * FROM circles WHERE card_token = $1`, [token]);
  return rows[0] ? toCircle(rows[0]) : null;
}

export async function listCircleIds(db: Db): Promise<string[]> {
  const { rows } = await db.query(`SELECT id FROM circles`);
  return rows.map((r) => String(r.id));
}

export async function updateEmergencyInfo(db: Db, circleId: string, input: EmergencyInput): Promise<void> {
  await db.query(
    `UPDATE circles SET blood_group = $2, conditions = $3, allergies = $4, emergency_contact = $5,
       doctor_contact = $6, language = $7 WHERE id = $1`,
    [circleId, input.bloodGroup, input.conditions, input.allergies, input.emergencyContact, input.doctorContact, input.language],
  );
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

// ---------------------------------------------------------------- members & sessions

export async function addMember(
  db: Db,
  circleId: string,
  input: { name: string; email: string | null; role: Role },
): Promise<Member> {
  const { rows } = await db.query(
    `INSERT INTO members (circle_id, name, email, role) VALUES ($1, $2, $3, $4) RETURNING *`,
    [circleId, input.name, input.email, input.role],
  );
  return toMember(rows[0]);
}

export async function listMembers(db: Db, circleId: string): Promise<Member[]> {
  const { rows } = await db.query(`SELECT * FROM members WHERE circle_id = $1 ORDER BY created_at`, [circleId]);
  return rows.map(toMember);
}

export async function updateMember(
  db: Db,
  circleId: string,
  memberId: string,
  input: { email: string | null; notify: boolean },
): Promise<void> {
  await db.query(`UPDATE members SET email = $3, notify = $4 WHERE id = $2 AND circle_id = $1`, [
    circleId,
    memberId,
    input.email,
    input.notify,
  ]);
}

export async function removeMember(db: Db, circleId: string, memberId: string): Promise<void> {
  await db.query(`DELETE FROM members WHERE id = $2 AND circle_id = $1`, [circleId, memberId]);
}

export const SESSION_DAYS = 30;

export async function createSession(db: Db, memberId: string): Promise<string> {
  const token = randomToken();
  await db.query(
    `INSERT INTO sessions (token_hash, member_id, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))`,
    [sha256(token), memberId, SESSION_DAYS],
  );
  return token;
}

export async function getSessionMember(db: Db, token: string): Promise<Member | null> {
  const { rows } = await db.query(
    `SELECT m.* FROM sessions s JOIN members m ON m.id = s.member_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [sha256(token)],
  );
  return rows[0] ? toMember(rows[0]) : null;
}

export async function deleteSession(db: Db, token: string): Promise<void> {
  await db.query(`DELETE FROM sessions WHERE token_hash = $1`, [sha256(token)]);
}

// ---------------------------------------------------------------- medications

export async function listMedications(db: Db, circleId: string): Promise<Medication[]> {
  const { rows } = await db.query(`SELECT * FROM medications WHERE circle_id = $1 ORDER BY name`, [circleId]);
  return rows.map(toMedication);
}

export async function getMedication(db: Db, circleId: string, id: string): Promise<Medication | null> {
  const { rows } = await db.query(`SELECT * FROM medications WHERE circle_id = $1 AND id = $2`, [circleId, id]);
  return rows[0] ? toMedication(rows[0]) : null;
}

export async function createMedication(db: Db, circleId: string, m: MedicationInput): Promise<Medication> {
  const { rows } = await db.query(
    `INSERT INTO medications (circle_id, name, dosage, instructions, times, days_of_week, start_date, end_date, stock, refill_threshold)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [circleId, m.name, m.dosage, m.instructions, m.times, m.daysOfWeek, m.startDate, m.endDate, m.stock, m.refillThreshold],
  );
  return toMedication(rows[0]);
}

export async function updateMedication(db: Db, circleId: string, id: string, m: MedicationInput): Promise<boolean> {
  const { rows } = await db.query(
    `UPDATE medications SET name = $3, dosage = $4, instructions = $5, times = $6, days_of_week = $7,
       start_date = $8, end_date = $9, stock = $10, refill_threshold = $11
     WHERE circle_id = $1 AND id = $2 RETURNING id`,
    [circleId, id, m.name, m.dosage, m.instructions, m.times, m.daysOfWeek, m.startDate, m.endDate, m.stock, m.refillThreshold],
  );
  return rows.length > 0;
}

export async function setMedicationActive(db: Db, circleId: string, id: string, active: boolean): Promise<void> {
  await db.query(`UPDATE medications SET active = $3 WHERE circle_id = $1 AND id = $2`, [circleId, id, active]);
}

export async function deleteMedication(db: Db, circleId: string, id: string): Promise<boolean> {
  const { rows } = await db.query(`DELETE FROM medications WHERE circle_id = $1 AND id = $2 RETURNING id`, [circleId, id]);
  return rows.length > 0;
}

// ---------------------------------------------------------------- dose logs

/**
 * Records (or changes) the outcome of one scheduled dose. Stock is adjusted
 * only when a dose moves into or out of "taken", so repeated taps are safe.
 */
export async function logDose(
  db: Db,
  circleId: string,
  medicationId: string,
  scheduledAt: Date,
  status: LoggedDoseStatus,
  loggedBy: string,
): Promise<boolean> {
  const med = await getMedication(db, circleId, medicationId);
  if (!med) return false;
  const { rows: prev } = await db.query(`SELECT status FROM dose_logs WHERE medication_id = $1 AND scheduled_at = $2`, [
    medicationId,
    scheduledAt,
  ]);
  const wasTaken = prev[0]?.status === "taken";
  await db.query(
    `INSERT INTO dose_logs (medication_id, scheduled_at, status, logged_by) VALUES ($1, $2, $3, $4)
     ON CONFLICT (medication_id, scheduled_at)
     DO UPDATE SET status = EXCLUDED.status, logged_by = EXCLUDED.logged_by, logged_at = now()`,
    [medicationId, scheduledAt, status, loggedBy],
  );
  const delta = (status === "taken" ? -1 : 0) + (wasTaken ? 1 : 0);
  if (delta !== 0) {
    await db.query(`UPDATE medications SET stock = GREATEST(stock + $3, 0) WHERE circle_id = $1 AND id = $2 AND stock IS NOT NULL`, [
      circleId,
      medicationId,
      delta,
    ]);
  }
  return true;
}

export async function undoDose(db: Db, circleId: string, medicationId: string, scheduledAt: Date): Promise<void> {
  const { rows } = await db.query(
    `DELETE FROM dose_logs d USING medications m
     WHERE d.medication_id = m.id AND m.circle_id = $1 AND d.medication_id = $2 AND d.scheduled_at = $3
     RETURNING d.status`,
    [circleId, medicationId, scheduledAt],
  );
  if (rows[0]?.status === "taken") {
    await db.query(`UPDATE medications SET stock = stock + 1 WHERE circle_id = $1 AND id = $2 AND stock IS NOT NULL`, [
      circleId,
      medicationId,
    ]);
  }
}

export async function listDoseLogsSince(db: Db, circleId: string, since: Date): Promise<DoseLog[]> {
  const { rows } = await db.query(
    `SELECT d.* FROM dose_logs d JOIN medications m ON m.id = d.medication_id
     WHERE m.circle_id = $1 AND d.scheduled_at >= $2`,
    [circleId, since],
  );
  return rows.map(toDoseLog);
}

// ---------------------------------------------------------------- appointments

export async function listAppointments(db: Db, circleId: string, from: Date): Promise<Appointment[]> {
  const { rows } = await db.query(`SELECT * FROM appointments WHERE circle_id = $1 AND starts_at >= $2 ORDER BY starts_at`, [
    circleId,
    from,
  ]);
  return rows.map(toAppointment);
}

export async function createAppointment(db: Db, circleId: string, a: AppointmentInput, startsAt: Date): Promise<Appointment> {
  const { rows } = await db.query(
    `INSERT INTO appointments (circle_id, title, doctor, location, starts_at, notes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [circleId, a.title, a.doctor, a.location, startsAt, a.notes],
  );
  return toAppointment(rows[0]);
}

export async function updateAppointment(
  db: Db,
  circleId: string,
  id: string,
  a: AppointmentInput,
  startsAt: Date,
): Promise<boolean> {
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
  const { rows } = await db.query(`SELECT * FROM activity WHERE circle_id = $1 ORDER BY created_at DESC LIMIT $2`, [
    circleId,
    limit,
  ]);
  return rows.map((r) => ({ id: String(r.id), actor: String(r.actor), message: String(r.message), createdAt: asDate(r.created_at) }));
}

// ---------------------------------------------------------------- notifications

/** Inserts a notification unless one with the same dedupe key exists. Returns true if new. */
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
  const { rows } = await db.query(`SELECT * FROM notifications WHERE circle_id = $1 ORDER BY created_at DESC LIMIT $2`, [
    circleId,
    limit,
  ]);
  return rows.map((r) => ({
    id: String(r.id),
    kind: String(r.kind) as ReminderKind,
    recipients: (r.recipients as string[]) ?? [],
    subject: String(r.subject),
    delivered: Boolean(r.delivered),
    createdAt: asDate(r.created_at),
  }));
}
