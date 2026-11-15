import type { Db } from "../db";
import type { DoseLog, LoggedDoseStatus, Medication } from "../types";
import type { MedicationInput } from "../validation";
import { toDoseLog, toMedication } from "./mappers";

export async function listMedications(db: Db, circleId: string): Promise<Medication[]> {
  const { rows } = await db.query(`SELECT * FROM medications WHERE circle_id = $1 ORDER BY name`, [circleId]);
  return rows.map(toMedication);
}

export async function getMedication(db: Db, circleId: string, id: string): Promise<Medication | null> {
  const { rows } = await db.query(`SELECT * FROM medications WHERE circle_id = $1 AND id = $2`, [circleId, id]);
  return rows[0] ? toMedication(rows[0]) : null;
}

const medicationParams = (m: MedicationInput) => [m.name, m.dosage, m.instructions, m.times, m.daysOfWeek, m.startDate, m.endDate, m.stock, m.refillThreshold];

export async function createMedication(db: Db, circleId: string, m: MedicationInput): Promise<Medication> {
  const { rows } = await db.query(
    `INSERT INTO medications (circle_id, name, dosage, instructions, times, days_of_week, start_date, end_date, stock, refill_threshold)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [circleId, ...medicationParams(m)],
  );
  return toMedication(rows[0]);
}

export async function updateMedication(db: Db, circleId: string, id: string, m: MedicationInput): Promise<boolean> {
  const { rows } = await db.query(
    `UPDATE medications SET name = $3, dosage = $4, instructions = $5, times = $6, days_of_week = $7,
       start_date = $8, end_date = $9, stock = $10, refill_threshold = $11
     WHERE circle_id = $1 AND id = $2 RETURNING id`,
    [circleId, id, ...medicationParams(m)],
  );
  return rows.length > 0;
}

export async function setMedicationActive(db: Db, circleId: string, id: string, active: boolean): Promise<boolean> {
  const { rows } = await db.query(`UPDATE medications SET active = $3 WHERE circle_id = $1 AND id = $2 RETURNING id`, [circleId, id, active]);
  return rows.length > 0;
}

export async function deleteMedication(db: Db, circleId: string, id: string): Promise<boolean> {
  const { rows } = await db.query(`DELETE FROM medications WHERE circle_id = $1 AND id = $2 RETURNING id`, [circleId, id]);
  return rows.length > 0;
}

// ---------------------------------------------------------------- dose logs

/**
 * Records (or changes) the outcome of one scheduled dose in a single atomic
 * statement. Stock moves only when a dose enters or leaves "taken", so
 * repeated taps and changed minds are safe. Returns false if the medicine
 * isn't in this circle.
 */
export async function logDose(
  db: Db,
  circleId: string,
  medicationId: string,
  scheduledAt: Date,
  status: LoggedDoseStatus,
  loggedBy: string,
): Promise<boolean> {
  const { rows } = await db.query<{ logged: number }>(
    `WITH med AS (
       SELECT id FROM medications WHERE id = $2 AND circle_id = $1
     ), prev AS (
       SELECT status FROM dose_logs WHERE medication_id = $2 AND scheduled_at = $3
     ), upsert AS (
       INSERT INTO dose_logs (medication_id, scheduled_at, status, logged_by)
       SELECT id, $3, $4, $5 FROM med
       ON CONFLICT (medication_id, scheduled_at)
       DO UPDATE SET status = EXCLUDED.status, logged_by = EXCLUDED.logged_by, logged_at = now()
       RETURNING 1
     ), stock AS (
       UPDATE medications SET stock = GREATEST(
         stock + (CASE WHEN $4::text = 'taken' THEN -1 ELSE 0 END)
               + (CASE WHEN (SELECT status FROM prev) = 'taken' THEN 1 ELSE 0 END), 0)
       WHERE id IN (SELECT id FROM med) AND stock IS NOT NULL
       RETURNING 1
     )
     SELECT (SELECT count(*) FROM upsert)::int AS logged`,
    [circleId, medicationId, scheduledAt, status, loggedBy],
  );
  return Number(rows[0]?.logged ?? 0) > 0;
}

/** Removes a dose log (and gives the pill back if it had been taken), in one statement. */
export async function undoDose(db: Db, circleId: string, medicationId: string, scheduledAt: Date): Promise<boolean> {
  const { rows } = await db.query<{ removed: number }>(
    `WITH removed AS (
       DELETE FROM dose_logs d USING medications m
       WHERE d.medication_id = m.id AND m.circle_id = $1 AND d.medication_id = $2 AND d.scheduled_at = $3
       RETURNING d.status
     ), stock AS (
       UPDATE medications SET stock = stock + 1
       WHERE id = $2 AND circle_id = $1 AND stock IS NOT NULL AND EXISTS (SELECT 1 FROM removed WHERE status = 'taken')
       RETURNING 1
     )
     SELECT (SELECT count(*) FROM removed)::int AS removed`,
    [circleId, medicationId, scheduledAt],
  );
  return Number(rows[0]?.removed ?? 0) > 0;
}

export async function listDoseLogsSince(db: Db, circleId: string, since: Date): Promise<DoseLog[]> {
  const { rows } = await db.query(
    `SELECT d.* FROM dose_logs d JOIN medications m ON m.id = d.medication_id
     WHERE m.circle_id = $1 AND d.scheduled_at >= $2`,
    [circleId, since],
  );
  return rows.map(toDoseLog);
}
