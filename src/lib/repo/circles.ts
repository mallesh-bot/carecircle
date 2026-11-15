import { generateCircleCode, randomToken } from "../crypto";
import type { Db } from "../db";
import type { EmergencyInput, Language } from "../validation";
import { toCircle, type CircleDetails } from "./mappers";

const MAX_CODE_ATTEMPTS = 5;

export async function createCircle(
  db: Db,
  input: { elderName: string; timezone: string; language: Language; passcodeHash: string },
): Promise<CircleDetails> {
  for (let attempt = 1; ; attempt++) {
    try {
      const { rows } = await db.query(
        `INSERT INTO circles (code, name, elder_name, timezone, language, passcode_hash, card_token)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [generateCircleCode(), `${input.elderName}'s Care Circle`, input.elderName, input.timezone, input.language, input.passcodeHash, randomToken(18)],
      );
      return toCircle(rows[0]);
    } catch (err) {
      // Retry only on the (astronomically rare) circle-code collision.
      if (!String(err).includes("unique") || attempt >= MAX_CODE_ATTEMPTS) throw err;
    }
  }
}

export async function findCircleForLogin(db: Db, code: string): Promise<{ id: string; passcodeHash: string } | null> {
  const { rows } = await db.query<{ id: string; passcode_hash: string }>(`SELECT id, passcode_hash FROM circles WHERE code = $1`, [code]);
  return rows[0] ? { id: String(rows[0].id), passcodeHash: rows[0].passcode_hash } : null;
}

export async function getCircle(db: Db, circleId: string): Promise<CircleDetails | null> {
  const { rows } = await db.query(`SELECT * FROM circles WHERE id = $1`, [circleId]);
  return rows[0] ? toCircle(rows[0]) : null;
}

export async function getCircleByCardToken(db: Db, token: string): Promise<CircleDetails | null> {
  const { rows } = await db.query(`SELECT * FROM circles WHERE card_token = $1`, [token]);
  return rows[0] ? toCircle(rows[0]) : null;
}

/** Circles that could have something to remind about (active medicines or future appointments). */
export async function listCirclesNeedingReminders(db: Db): Promise<string[]> {
  const { rows } = await db.query<{ id: string }>(
    `SELECT c.id FROM circles c
     WHERE EXISTS (SELECT 1 FROM medications m WHERE m.circle_id = c.id AND m.active)
        OR EXISTS (SELECT 1 FROM appointments a WHERE a.circle_id = c.id AND a.starts_at > now())`,
  );
  return rows.map((r) => String(r.id));
}

/**
 * Atomically claims the right to run reminders for a circle, at most once per
 * `minIntervalSeconds`. Concurrent callers (cron, page loads) can't double-run.
 */
export async function claimReminderRun(db: Db, circleId: string, minIntervalSeconds: number): Promise<boolean> {
  const { rows } = await db.query(
    `UPDATE circles SET reminders_checked_at = now()
     WHERE id = $1 AND (reminders_checked_at IS NULL OR reminders_checked_at < now() - make_interval(secs => $2))
     RETURNING id`,
    [circleId, minIntervalSeconds],
  );
  return rows.length > 0;
}

export async function updateEmergencyInfo(db: Db, circleId: string, input: EmergencyInput): Promise<void> {
  await db.query(
    `UPDATE circles SET blood_group = $2, conditions = $3, allergies = $4, emergency_contact = $5,
       doctor_contact = $6, language = $7 WHERE id = $1`,
    [circleId, input.bloodGroup, input.conditions, input.allergies, input.emergencyContact, input.doctorContact, input.language],
  );
}
