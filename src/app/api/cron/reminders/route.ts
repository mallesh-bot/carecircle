import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { runAllReminders } from "@/lib/reminder-runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Sends due reminders for every circle. Called by Vercel Cron and a GitHub
 * Actions schedule. Runs are idempotent (dedupe keys), so extra calls are
 * harmless; when CRON_SECRET is set, callers must present it.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sent = await runAllReminders(await getDb());
  return NextResponse.json({ ok: true, sent, at: new Date().toISOString() });
}
