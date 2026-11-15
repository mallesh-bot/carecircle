import type { Db } from "./db";

export interface RateLimit {
  /** Maximum hits allowed per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

/** Limits for abuse-prone or costly actions. */
export const LIMITS = {
  createCircle: { limit: 10, windowSeconds: 3600 },
  demo: { limit: 20, windowSeconds: 3600 },
  ai: { limit: 30, windowSeconds: 3600 },
  sendReminders: { limit: 10, windowSeconds: 600 },
} satisfies Record<string, RateLimit>;

/**
 * Fixed-window counter stored in Postgres, so limits hold across serverless
 * instances. Returns true when the hit is allowed.
 */
export async function consume(db: Db, bucket: string, { limit, windowSeconds }: RateLimit): Promise<boolean> {
  const { rows } = await db.query<{ hits: number }>(
    `INSERT INTO rate_limits (bucket, window_start)
     VALUES ($1, to_timestamp(floor(extract(epoch FROM now()) / $2) * $2))
     ON CONFLICT (bucket, window_start) DO UPDATE SET hits = rate_limits.hits + 1
     RETURNING hits`,
    [bucket, windowSeconds],
  );
  // Opportunistic cleanup keeps the table tiny.
  if (Math.random() < 0.02) await db.query(`DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'`);
  return Number(rows[0]?.hits ?? 0) <= limit;
}
