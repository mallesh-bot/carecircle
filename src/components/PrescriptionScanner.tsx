"use client";

import { useActionState, useState, useTransition } from "react";
import { addScannedMedicationsAction, scanPrescriptionAction } from "@/app/actions/ai";
import type { ActionState } from "@/lib/action-utils";
import type { ExtractedMedication } from "@/lib/gemini";
import { FormStatus } from "./FormStatus";

/** Upload a prescription photo → Gemini extracts medicines → family reviews → add. */
export function PrescriptionScanner({ aiEnabled }: { aiEnabled: boolean }) {
  const [scan, scanAction, scanning] = useActionState(scanPrescriptionAction, null);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [result, setResult] = useState<ActionState>(null);
  const [adding, startAdding] = useTransition();
  const meds = scan?.medications ?? [];

  const add = () =>
    startAdding(async () => {
      const chosen: ExtractedMedication[] = meds.filter((_, i) => selected[i] !== false);
      setResult(await addScannedMedicationsAction(chosen));
    });

  return (
    <div className="flex flex-col gap-4">
      {!aiEnabled && (
        <p className="rounded-xl bg-[var(--warn-soft)] p-3 text-sm text-[var(--warn)]">
          Gemini isn&apos;t switched on for this deployment yet (missing GEMINI_API_KEY). You can still add medicines manually.
        </p>
      )}
      <form action={scanAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="field flex-1">
          Photo of the prescription
          <input className="input py-2" type="file" name="photo" accept="image/jpeg,image/png,image/webp,image/heic" capture="environment" required />
        </label>
        <button className="btn-primary" disabled={scanning || !aiEnabled}>
          {scanning ? "Reading with Gemini…" : "📷 Scan with Gemini"}
        </button>
      </form>
      <FormStatus state={scan && !scan.ok ? { ok: false, error: scan.error } : null} />

      {meds.length > 0 && !result?.ok && (
        <div className="rounded-xl border border-[var(--line)] bg-stone-50 p-4">
          <h3 className="font-semibold">Gemini found {meds.length} medicine(s). Please check before adding:</h3>
          <ul className="mt-3 flex flex-col gap-2">
            {meds.map((m, i) => (
              <li key={i}>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-white p-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5"
                    checked={selected[i] !== false}
                    onChange={(e) => setSelected((s) => ({ ...s, [i]: e.target.checked }))}
                  />
                  <span>
                    <strong>{m.name}</strong> {m.dosage && `· ${m.dosage}`}
                    <span className="block text-sm text-[var(--muted)]">
                      {m.times.length ? m.times.join(" · ") : "When needed (no fixed time — defaults to 08:00)"}
                      {m.durationDays ? ` · for ${m.durationDays} days` : ""}
                      {m.instructions && ` · ${m.instructions}`}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {scan?.notes && <p className="mt-3 text-sm text-[var(--warn)]">Note from Gemini: {scan.notes}</p>}
          <button className="btn-primary mt-4" onClick={add} disabled={adding}>
            {adding ? "Adding…" : "Add selected medicines"}
          </button>
        </div>
      )}
      <FormStatus state={result} />
    </div>
  );
}
