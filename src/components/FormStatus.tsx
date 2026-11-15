"use client";

import type { ActionState } from "@/app/actions";

/** Accessible success/error message for a form's last action result. */
export function FormStatus({ state }: { state: ActionState | { ok: boolean; error?: string; message?: string } }) {
  return (
    <p role="status" aria-live="polite" className="min-h-[1.25rem] text-sm">
      {state?.error && <span className="font-medium text-[var(--danger)]">{state.error}</span>}
      {state?.ok && state.message && <span className="font-medium text-[var(--ok)]">{state.message}</span>}
    </p>
  );
}
