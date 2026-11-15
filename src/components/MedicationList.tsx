"use client";

import { useCallback, useState, useTransition } from "react";
import { explainMedicineAction, type ExplainState } from "@/app/actions/ai";
import { deleteMedicationAction, setMedicationActiveAction } from "@/app/actions/medications";
import { speak, stopSpeaking } from "@/lib/speech";
import type { Medication } from "@/lib/types";
import type { Language } from "@/lib/validation";
import type { ActionState } from "@/lib/action-utils";
import { FormStatus } from "./FormStatus";
import { MedicationForm } from "./MedicationForm";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function describeDays(days: number[]) {
  return days.length === 0 || days.length === 7 ? "Every day" : days.map((d) => DAY_NAMES[d]).join(", ");
}

export function MedicationList({ meds, today, language, aiEnabled }: { meds: Medication[]; today: string; language: Language; aiEnabled: boolean }) {
  const [adding, setAdding] = useState(false);
  const closeAdd = useCallback(() => setAdding(false), []);
  return (
    <div className="flex flex-col gap-4">
      {meds.length === 0 && !adding && <p className="text-[var(--muted)]">No medicines yet. Add one below or scan a prescription.</p>}
      <ul className="flex flex-col gap-3">
        {meds.map((m) => (
          <MedicationRow key={m.id} med={m} today={today} language={language} aiEnabled={aiEnabled} />
        ))}
      </ul>
      {adding ? (
        <div className="rounded-xl border border-[var(--line)] bg-stone-50 p-4">
          <MedicationForm today={today} onDone={closeAdd} />
        </div>
      ) : (
        <button className="btn-primary self-start" onClick={() => setAdding(true)}>
          + Add a medicine
        </button>
      )}
    </div>
  );
}

function MedicationRow({ med, today, language, aiEnabled }: { med: Medication; today: string; language: Language; aiEnabled: boolean }) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [explain, setExplain] = useState<ExplainState>(null);
  const [status, setStatus] = useState<ActionState>(null);
  const [pending, startTransition] = useTransition();
  const closeEdit = useCallback(() => setEditing(false), []);
  const lowStock = med.stock !== null && med.stock <= med.refillThreshold;

  if (editing) {
    return (
      <li className="rounded-xl border border-[var(--line)] bg-stone-50 p-4">
        <MedicationForm med={med} today={today} onDone={closeEdit} />
      </li>
    );
  }

  const ex = explain?.explanation;
  const spoken = ex
    ? [ex.whatItIsFor, ex.howToTake, ...ex.commonSideEffects, ...ex.callDoctorIf].join(". ")
    : "";

  return (
    <li className={`rounded-xl border border-[var(--line)] bg-white p-4 ${med.active ? "" : "opacity-70"}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold">
            {med.name} {med.dosage && <span className="font-normal text-[var(--muted)]">· {med.dosage}</span>}
          </h3>
          <p className="text-sm text-[var(--muted)]">
            {med.times.join(" · ")} — {describeDays(med.daysOfWeek)}
            {med.endDate && ` · until ${med.endDate}`}
          </p>
          {med.instructions && <p className="text-sm">{med.instructions}</p>}
          <p className="mt-1 flex flex-wrap gap-2">
            {!med.active && <span className="chip bg-stone-100 text-stone-600">Paused</span>}
            {med.stock !== null && (
              <span className={`chip ${lowStock ? "bg-[var(--warn-soft)] text-[var(--warn)]" : "bg-stone-100 text-stone-600"}`}>
                {lowStock ? "⚠ Refill soon · " : ""}
                {med.stock} left
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-ghost text-sm"
            disabled={pending}
            title={aiEnabled ? undefined : "Add GEMINI_API_KEY to enable"}
            onClick={() =>
              startTransition(async () => {
                setExplain(await explainMedicineAction(med.id));
              })
            }
          >
            ✨ Explain simply
          </button>
          <button className="btn-ghost text-sm" onClick={() => setEditing(true)}>
            Edit
          </button>
          <button className="btn-ghost text-sm" disabled={pending} onClick={() => startTransition(async () => setStatus(await setMedicationActiveAction(med.id, !med.active)))}>
            {med.active ? "Pause" : "Resume"}
          </button>
          {confirmDelete ? (
            <button className="btn-danger text-sm" disabled={pending} onClick={() => startTransition(async () => setStatus(await deleteMedicationAction(med.id)))}>
              Confirm delete
            </button>
          ) : (
            <button className="btn-danger text-sm" onClick={() => setConfirmDelete(true)} aria-label={`Delete ${med.name}`}>
              Delete
            </button>
          )}
        </div>
      </div>
      {status?.error && <FormStatus state={status} />}
      <div aria-live="polite">
        {pending && !ex && <p className="mt-3 text-sm text-[var(--muted)]">Asking Gemini…</p>}
        {explain?.error && <p className="mt-3 text-sm font-medium text-[var(--danger)]">{explain.error}</p>}
        {ex && (
          <div className="mt-4 rounded-xl bg-[var(--brand-soft)] p-4 text-sm">
            <div className="mb-2 flex items-center justify-between gap-2">
              <strong>✨ In simple words (by Gemini)</strong>
              <span className="flex gap-2">
                <button className="btn-ghost min-h-0 px-3 py-1 text-xs" onClick={() => speak(spoken, language)}>
                  🔊 Read aloud
                </button>
                <button className="btn-ghost min-h-0 px-3 py-1 text-xs" onClick={() => { stopSpeaking(); setExplain(null); }}>
                  Close
                </button>
              </span>
            </div>
            <p>
              <strong>What it&apos;s for:</strong> {ex.whatItIsFor}
            </p>
            <p className="mt-1">
              <strong>How to take it:</strong> {ex.howToTake}
            </p>
            {ex.commonSideEffects.length > 0 && (
              <p className="mt-1">
                <strong>Common side effects:</strong> {ex.commonSideEffects.join(", ")}
              </p>
            )}
            {ex.callDoctorIf.length > 0 && (
              <p className="mt-1">
                <strong>Call the doctor if:</strong> {ex.callDoctorIf.join("; ")}
              </p>
            )}
            <p className="mt-2 text-xs text-[var(--muted)]">General information only — always follow the doctor&apos;s advice.</p>
          </div>
        )}
      </div>
    </li>
  );
}
