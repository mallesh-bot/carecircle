"use client";

import { useActionState, useEffect, useState } from "react";
import { saveMedicationAction } from "@/app/actions";
import type { Medication } from "@/lib/types";
import { FormStatus } from "./FormStatus";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function MedicationForm({ med, today, onDone }: { med?: Medication; today: string; onDone?: () => void }) {
  const [state, action, pending] = useActionState(saveMedicationAction, null);
  const [times, setTimes] = useState<string[]>(med?.times.length ? med.times : ["08:00"]);

  useEffect(() => {
    if (state?.ok) onDone?.();
  }, [state, onDone]);

  const idPrefix = med ? `med-${med.id}` : "med-new";
  return (
    <form action={action} className="flex flex-col gap-4" aria-label={med ? `Edit ${med.name}` : "Add a medicine"}>
      {med && <input type="hidden" name="id" value={med.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field">
          Medicine name
          <input className="input" name="name" required maxLength={80} defaultValue={med?.name} placeholder="e.g. Metformin 500mg" />
        </label>
        <label className="field">
          Dose
          <input className="input" name="dosage" maxLength={60} defaultValue={med?.dosage} placeholder="e.g. 1 tablet" />
        </label>
      </div>
      <label className="field">
        Instructions
        <input className="input" name="instructions" maxLength={240} defaultValue={med?.instructions} placeholder="e.g. After breakfast, with water" />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Times of day</legend>
        <div className="flex flex-wrap gap-2">
          {times.map((t, i) => (
            <span key={i} className="flex items-center gap-1">
              <input
                className="input w-32"
                type="time"
                name="times"
                required
                value={t}
                aria-label={`Dose time ${i + 1}`}
                onChange={(e) => setTimes((prev) => prev.map((p, j) => (j === i ? e.target.value : p)))}
              />
              {times.length > 1 && (
                <button type="button" className="btn-ghost px-3" aria-label={`Remove time ${i + 1}`} onClick={() => setTimes((prev) => prev.filter((_, j) => j !== i))}>
                  ×
                </button>
              )}
            </span>
          ))}
          {times.length < 8 && (
            <button type="button" className="btn-ghost text-sm" onClick={() => setTimes((prev) => [...prev, "20:00"])}>
              + Add time
            </button>
          )}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium">
          Days <span className="font-normal text-[var(--muted)]">(leave all unticked for every day)</span>
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {DAYS.map((d, i) => (
            <label key={d} htmlFor={`${idPrefix}-day-${i}`} className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-3">
              <input id={`${idPrefix}-day-${i}`} type="checkbox" name="days" value={i} defaultChecked={med?.daysOfWeek.includes(i)} className="h-4 w-4" />
              {d}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-4">
        <label className="field">
          Start date
          <input className="input" type="date" name="startDate" required defaultValue={med?.startDate ?? today} />
        </label>
        <label className="field">
          End date <span className="font-normal text-[var(--muted)]">(optional)</span>
          <input className="input" type="date" name="endDate" defaultValue={med?.endDate ?? ""} />
        </label>
        <label className="field">
          Pills in stock
          <input className="input" type="number" name="stock" min={0} max={10000} defaultValue={med?.stock ?? ""} placeholder="optional" />
        </label>
        <label className="field">
          Refill alert at
          <input className="input" type="number" name="refillThreshold" min={0} max={1000} defaultValue={med?.refillThreshold ?? 5} />
        </label>
      </div>

      <FormStatus state={state} />
      <div className="flex gap-2">
        <button className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : med ? "Save changes" : "Add medicine"}
        </button>
        {onDone && (
          <button type="button" className="btn-ghost" onClick={onDone}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
