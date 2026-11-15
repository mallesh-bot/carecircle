import { randomToken, sha256 } from "../crypto";
import type { Db } from "../db";
import type { Member, Role } from "../types";
import { toCircle, toMember, type CircleDetails } from "./mappers";

export const SESSION_DAYS = 30;

export async function addMember(db: Db, circleId: string, input: { name: string; email: string | null; role: Role }): Promise<Member> {
  const { rows } = await db.query(`INSERT INTO members (circle_id, name, email, role) VALUES ($1, $2, $3, $4) RETURNING *`, [
    circleId,
    input.name,
    input.email,
    input.role,
  ]);
  return toMember(rows[0]);
}

export async function listMembers(db: Db, circleId: string): Promise<Member[]> {
  const { rows } = await db.query(`SELECT * FROM members WHERE circle_id = $1 ORDER BY created_at`, [circleId]);
  return rows.map(toMember);
}

export async function updateMember(db: Db, circleId: string, memberId: string, input: { email: string | null; notify: boolean }): Promise<void> {
  await db.query(`UPDATE members SET email = $3, notify = $4 WHERE id = $2 AND circle_id = $1`, [circleId, memberId, input.email, input.notify]);
}

export async function removeMember(db: Db, circleId: string, memberId: string): Promise<boolean> {
  const { rows } = await db.query(`DELETE FROM members WHERE id = $2 AND circle_id = $1 RETURNING id`, [circleId, memberId]);
  return rows.length > 0;
}

// ---------------------------------------------------------------- sessions

/** Creates a session and returns the raw token; only its SHA-256 is stored. Expired sessions are pruned. */
export async function createSession(db: Db, memberId: string): Promise<string> {
  const token = randomToken();
  await db.query(`DELETE FROM sessions WHERE expires_at < now()`);
  await db.query(`INSERT INTO sessions (token_hash, member_id, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))`, [
    sha256(token),
    memberId,
    SESSION_DAYS,
  ]);
  return token;
}

/** Resolves a session token to its member and circle in a single query. */
export async function getSession(db: Db, token: string): Promise<{ member: Member; circle: CircleDetails } | null> {
  const { rows } = await db.query(
    `SELECT row_to_json(m.*) AS member, row_to_json(c.*) AS circle
     FROM sessions s
     JOIN members m ON m.id = s.member_id
     JOIN circles c ON c.id = m.circle_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [sha256(token)],
  );
  const row = rows[0] as { member: Record<string, unknown>; circle: Record<string, unknown> } | undefined;
  return row ? { member: toMember(row.member), circle: toCircle(row.circle) } : null;
}

export async function deleteSession(db: Db, token: string): Promise<void> {
  await db.query(`DELETE FROM sessions WHERE token_hash = $1`, [sha256(token)]);
}
