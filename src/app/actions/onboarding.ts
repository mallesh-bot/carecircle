"use server";

import { redirect } from "next/navigation";
import { fail, invalid, RATE_LIMITED, text, type ActionState } from "@/lib/action-utils";
import { hashPasscode, normalizeCircleCode, verifyPasscode } from "@/lib/crypto";
import { getDb } from "@/lib/db";
import { seedDemoCircle } from "@/lib/demo";
import { consume, LIMITS } from "@/lib/rate-limit";
import { runRemindersForCircle } from "@/lib/reminder-runner";
import * as repo from "@/lib/repo";
import { clientKey, signIn, signOut } from "@/lib/session";
import { createCircleSchema, joinCircleSchema } from "@/lib/validation";

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;

export async function createCircleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = createCircleSchema.safeParse({
    elderName: text(fd, "elderName"),
    yourName: text(fd, "yourName"),
    yourEmail: text(fd, "yourEmail"),
    yourRole: text(fd, "yourRole"),
    passcode: text(fd, "passcode"),
    timezone: text(fd, "timezone"),
    language: text(fd, "language"),
  });
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;
  const db = await getDb();
  if (!(await consume(db, `create:${await clientKey()}`, LIMITS.createCircle))) return fail(RATE_LIMITED);

  const circle = await repo.createCircle(db, {
    elderName: input.elderName,
    timezone: input.timezone,
    language: input.language,
    passcodeHash: await hashPasscode(input.passcode),
  });
  const member = await repo.addMember(db, circle.id, { name: input.yourName, email: input.yourEmail, role: input.yourRole });
  await repo.addActivity(db, circle.id, input.yourName, `created ${circle.name}`);
  await signIn(member.id);
  redirect("/circle?welcome=1");
}

export async function joinCircleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = joinCircleSchema.safeParse({
    code: text(fd, "code"),
    passcode: text(fd, "passcode"),
    name: text(fd, "name"),
    email: text(fd, "email"),
    role: text(fd, "role"),
  });
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;
  const code = normalizeCircleCode(input.code);
  const db = await getDb();

  if ((await repo.recentFailedAttempts(db, code, LOCKOUT_MINUTES)) >= MAX_FAILED_LOGINS) {
    return fail(`Too many wrong attempts. Please wait ${LOCKOUT_MINUTES} minutes and try again.`);
  }
  const circle = await repo.findCircleForLogin(db, code);
  const valid = circle ? await verifyPasscode(input.passcode, circle.passcodeHash) : false;
  await repo.recordLoginAttempt(db, code, valid);
  // Same message for an unknown code and a wrong passcode, so codes can't be probed.
  if (!circle || !valid) return fail("That circle code and passcode don't match.", "passcode");

  const member = await repo.addMember(db, circle.id, { name: input.name, email: input.email, role: input.role });
  await repo.addActivity(db, circle.id, input.name, `joined the circle as ${input.role}`);
  await signIn(member.id);
  redirect("/circle");
}

/** One-click demo: a private, pre-filled circle so visitors can try every feature. */
export async function startDemoAction(): Promise<void> {
  const db = await getDb();
  if (!(await consume(db, `demo:${await clientKey()}`, LIMITS.demo))) redirect("/?limited=1");
  const { circle, visitor } = await seedDemoCircle(db, "You (demo)");
  await runRemindersForCircle(db, circle.id, { force: true }); // populate the reminder log right away
  await signIn(visitor.id);
  redirect("/circle?demo=1");
}

export async function signOutAction(): Promise<void> {
  await signOut();
  redirect("/");
}
