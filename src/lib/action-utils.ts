import "server-only";
import { revalidatePath } from "next/cache";
import type { z } from "zod";

/** Uniform result returned by every Server Action that a form displays. */
export type ActionState = {
  ok: boolean;
  error?: string;
  message?: string;
  /** Name of the form field the error belongs to, for aria-invalid wiring. */
  field?: string;
} | null;

export const ok = (message?: string): ActionState => ({ ok: true, message });
export const fail = (error: string, field?: string): ActionState => ({ ok: false, error, field });

/** Converts a failed zod parse into a form error that points at the offending field. */
export function invalid(error: z.ZodError): ActionState {
  const issue = error.issues[0];
  return fail(issue?.message ?? "Invalid input", issue?.path[0] !== undefined ? String(issue.path[0]) : undefined);
}

/** Reads a FormData entry as a string ("" when missing or a file). */
export function text(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

/** Reads an optional numeric field: blank becomes null so zod can treat it as "not set". */
export function optionalText(fd: FormData, key: string): string | null {
  const v = text(fd, key).trim();
  return v === "" ? null : v;
}

export const RATE_LIMITED = "You're doing that too often. Please wait a few minutes and try again.";

/** Re-renders the dashboard after a mutation. */
export function refreshCircle(): void {
  revalidatePath("/circle", "layout");
}
