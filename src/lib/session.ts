import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "./db";
import { createSession, deleteSession, getCircle, getSessionMember, SESSION_DAYS, type CircleDetails } from "./repo";
import type { Member } from "./types";

const COOKIE = "cc_session";

export interface Viewer {
  member: Member;
  circle: CircleDetails;
}

/** The signed-in member and their circle for this request, or null. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const member = await getSessionMember(db, token);
  if (!member) return null;
  const circle = await getCircle(db, member.circleId);
  return circle ? { member, circle } : null;
});

export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/?signin=1");
  return viewer;
}

export async function signIn(memberId: string): Promise<void> {
  const token = await createSession(await getDb(), memberId);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await deleteSession(await getDb(), token);
  jar.delete(COOKIE);
}
