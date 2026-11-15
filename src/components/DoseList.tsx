"use client";

import { useState, useTransition } from "react";
import { logDoseAction } from "@/app/actions/doses";
import { formatTime } from "@/lib/time";
import type { DoseStatus } from "@/lib/types";

export interface DoseSlotView {
  medicationId: string;
  medicationName: string;
  dosage: string;
  instructions: string;
  scheduledAt: string;
  status: DoseStatus;
  loggedBy: string | null;
}

const STATUS_STYLE: Record<DoseStatus, { label: string; className: string }> = {
  taken: { label: "Taken", className: "bg-[var(--ok-soft)] text-[var(--ok)]" },
  skipped: { label: "Skipped", className: "bg-stone-100 text-stone-600" },
  missed: { label: "Missed", className: "bg-[var(--danger-soft)] text-[var(--danger)]" },
  due: { label: "Due now", className: "bg-[var(--warn-soft)] text-[var(--warn)]" },
  upcoming: { label: "Upcoming", className: "bg-[var(--brand-soft)] text-[var(--brand)]" },
};

export function DoseList({ slots, timezone }: { slots: DoseSlotView[]; timezone: string }) {
  const [pending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (slots.length === 0) {
    return <p className="text-[var(--muted)]">No medicines scheduled today. Add one in the Medicines section.</p>;
  }

  const act = (slot: DoseSlotView, status: "taken" | "skipped" | "undo") => {
    const key = `${slot.medicationId}@${slot.scheduledAt}`;
    setBusyKey(key);
    setError(null);
    startTransition(async () => {
      const res = await logDoseAction(slot.medicationId, slot.scheduledAt, status);
      if (res && !res.ok) setError(res.error ?? "Something went wrong.");
      setBusyKey(null);
    });
  };

  return (
    <>
      <p role="status" aria-live="polite" className="text-sm font-medium text-[var(--danger)]">
        {error}
      </p>
      <ol className="flex flex-col gap-3">
        {slots.map((slot) => {
          const key = `${slot.medicationId}@${slot.scheduledAt}`;
          const style = STATUS_STYLE[slot.status];
          const logged = slot.status === "taken" || slot.status === "skipped";
          const busy = pending && busyKey === key;
          return (
            <li
              key={key}
              className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
                slot.status === "due" ? "border-amber-300 bg-amber-50/60" : "border-[var(--line)] bg-white"
              }`}
            >
              <div className="flex items-start gap-4">
                <time dateTime={slot.scheduledAt} className="w-20 shrink-0 text-lg font-bold tabular-nums">
                  {formatTime(new Date(slot.scheduledAt), timezone)}
                </time>
                <div>
                  <p className="font-semibold">
                    {slot.medicationName} {slot.dosage && <span className="font-normal text-[var(--muted)]">· {slot.dosage}</span>}
                  </p>
                  {slot.instructions && <p className="text-sm text-[var(--muted)]">{slot.instructions}</p>}
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    <span className={`chip ${style.className}`}>{style.label}</span>
                    {slot.loggedBy && <span className="text-[var(--muted)]">by {slot.loggedBy}</span>}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                {logged ? (
                  <button className="btn-ghost text-sm" onClick={() => act(slot, "undo")} disabled={busy} aria-label={`Undo ${slot.medicationName}`}>
                    Undo
                  </button>
                ) : (
                  <>
                    <button
                      className="btn-primary"
                      onClick={() => act(slot, "taken")}
                      disabled={busy}
                      aria-label={`Mark ${slot.medicationName} at ${formatTime(new Date(slot.scheduledAt), timezone)} as taken`}
                    >
                      {busy ? "Saving…" : "✓ Taken"}
                    </button>
                    <button className="btn-ghost text-sm" onClick={() => act(slot, "skipped")} disabled={busy} aria-label={`Skip ${slot.medicationName}`}>
                      Skip
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
