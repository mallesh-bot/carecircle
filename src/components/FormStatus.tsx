import type { ActionState } from "@/lib/action-utils";

/** Accessible success/error message for a form's last action result. */
export function FormStatus({ state, id }: { state: ActionState; id?: string }) {
  return (
    <p id={id} role="status" aria-live="polite" className="min-h-[1.25rem] text-sm">
      {state?.error && <span className="font-medium text-[var(--danger)]">{state.error}</span>}
      {state?.ok && state.message && <span className="font-medium text-[var(--ok)]">{state.message}</span>}
    </p>
  );
}

/**
 * ARIA wiring for an input: marks it invalid and points it at the form's
 * status message when the last error was about this field.
 */
export function fieldA11y(state: ActionState, field: string, statusId: string) {
  const invalid = state?.ok === false && state.field === field;
  return invalid ? { "aria-invalid": true as const, "aria-describedby": statusId } : {};
}
