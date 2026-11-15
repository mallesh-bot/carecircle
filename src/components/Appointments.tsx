"use client";

import { useActionState, useCallback, useEffect, useState, useTransition } from "react";
import { deleteAppointmentAction, saveAppointmentAction } from "@/app/actions";
import { googleCalendarUrl } from "@/lib/calendar";
import { formatDateTime, toLocalDateTimeInput } from "@/lib/time";
import { FormStatus } from "./FormStatus";

export interface AppointmentView {
  id: string;
  title: string;
  doctor: string;
  location: string;
  notes: string;
  startsAt: string;
}

export function Appointments({ items, timezone, elderName }: { items: AppointmentView[]; timezone: string; elderName: string }) {
  const [adding, setAdding] = useState(false);
  const close = useCallback(() => setAdding(false), []);
  return (
    <div className="flex flex-col gap-4">
      {items.length === 0 && !adding && <p className="text-[var(--muted)]">No upcoming appointments.</p>}
      <ul className="flex flex-col gap-3">
        {items.map((a) => (
          <AppointmentRow key={a.id} appt={a} timezone={timezone} elderName={elderName} />
        ))}
      </ul>
      {adding ? (
        <div className="rounded-xl border border-[var(--line)] bg-stone-50 p-4">
          <AppointmentForm timezone={timezone} onDone={close} />
        </div>
      ) : (
        <button className="btn-primary self-start" onClick={() => setAdding(true)}>
          + Add an appointment
        </button>
      )}
    </div>
  );
}

function AppointmentRow({ appt, timezone, elderName }: { appt: AppointmentView; timezone: string; elderName: string }) {
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const close = useCallback(() => setEditing(false), []);
  const startsAt = new Date(appt.startsAt);
  if (editing) {
    return (
      <li className="rounded-xl border border-[var(--line)] bg-stone-50 p-4">
        <AppointmentForm appt={appt} timezone={timezone} onDone={close} />
      </li>
    );
  }
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-[var(--line)] bg-white p-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-[var(--brand)]">
          <time dateTime={appt.startsAt}>{formatDateTime(startsAt, timezone)}</time>
        </p>
        <h3 className="text-lg font-semibold">{appt.title}</h3>
        <p className="text-sm text-[var(--muted)]">{[appt.doctor, appt.location].filter(Boolean).join(" · ")}</p>
        {appt.notes && <p className="text-sm">{appt.notes}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <a
          className="btn-ghost text-sm"
          href={googleCalendarUrl({ ...appt, startsAt }, elderName)}
          target="_blank"
          rel="noopener noreferrer"
        >
          📅 Google Calendar
        </a>
        <button className="btn-ghost text-sm" onClick={() => setEditing(true)}>
          Edit
        </button>
        {confirm ? (
          <button className="btn-danger text-sm" disabled={pending} onClick={() => start(async () => void (await deleteAppointmentAction(appt.id)))}>
            Confirm cancel
          </button>
        ) : (
          <button className="btn-danger text-sm" onClick={() => setConfirm(true)} aria-label={`Cancel ${appt.title}`}>
            Cancel
          </button>
        )}
      </div>
    </li>
  );
}

function AppointmentForm({ appt, timezone, onDone }: { appt?: AppointmentView; timezone: string; onDone: () => void }) {
  const [state, action, pending] = useActionState(saveAppointmentAction, null);
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  return (
    <form action={action} className="flex flex-col gap-4" aria-label={appt ? `Edit ${appt.title}` : "Add an appointment"}>
      {appt && <input type="hidden" name="id" value={appt.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field">
          What is it?
          <input className="input" name="title" required maxLength={80} defaultValue={appt?.title} placeholder="e.g. Diabetes check-up" />
        </label>
        <label className="field">
          When
          <input
            className="input"
            type="datetime-local"
            name="startsAt"
            required
            defaultValue={appt ? toLocalDateTimeInput(new Date(appt.startsAt), timezone) : undefined}
          />
        </label>
        <label className="field">
          Doctor
          <input className="input" name="doctor" maxLength={80} defaultValue={appt?.doctor} placeholder="e.g. Dr. Sharma" />
        </label>
        <label className="field">
          Where
          <input className="input" name="location" maxLength={160} defaultValue={appt?.location} placeholder="e.g. Apollo Clinic, Kukatpally" />
        </label>
      </div>
      <label className="field">
        Notes
        <textarea className="input" name="notes" rows={2} maxLength={500} defaultValue={appt?.notes} placeholder="e.g. Fasting blood test — no breakfast" />
      </label>
      <FormStatus state={state} />
      <div className="flex gap-2">
        <button className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save appointment"}
        </button>
        <button type="button" className="btn-ghost" onClick={onDone}>
          Close
        </button>
      </div>
    </form>
  );
}
