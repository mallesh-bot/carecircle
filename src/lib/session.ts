import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { sha256 } from "./crypto";
import { getDb } from "./db";
import { isProduction } from "./env";
import { createSession, deleteSession, getSession, SESSION_DAYS, type CircleDetails } from "./repo";
import type { Member } from "./types";

const COOKIE = "cc_session";

export interface Viewer {
  member: Member;
  circle: CircleDetails;
}

/** The signed-in member and their circle for this request (one query, memoised per request). */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  return getSession(await getDb(), token);
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
    secure: isProduction(),
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

/** A privacy-preserving client identifier for rate limiting (hashed, never stored raw). */
export async function clientKey(): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return sha256(`ip:${ip}`).slice(0, 32);
}
