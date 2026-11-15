import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { runAllReminders } from "@/lib/reminder-runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Sends due reminders for every circle. Called by Vercel Cron and a GitHub
 * Actions schedule. Runs are idempotent (dedupe keys) and throttled per
 * circle, so extra calls are harmless and cheap; when CRON_SECRET is set,
 * callers must present it as a bearer token.
 */
export async function GET(req: NextRequest) {
  const secret = env().CRON_SECRET;
  if (secret && !safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const sent = await runAllReminders(await getDb());
    return NextResponse.json({ ok: true, sent, at: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("reminder cron failed", String(err));
    return NextResponse.json({ ok: false, error: "reminder run failed" }, { status: 500 });
  }
}
