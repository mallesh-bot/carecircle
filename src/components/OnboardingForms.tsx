"use client";

import { useActionState, useEffect, useState } from "react";
import { createCircleAction, joinCircleAction } from "@/app/actions";
import { LANGUAGES } from "@/lib/validation";
import { FormStatus } from "./FormStatus";

const ROLE_OPTIONS = [
  { value: "family", label: "Family member" },
  { value: "caretaker", label: "Caretaker / nurse" },
  { value: "elder", label: "I am the elder" },
];

export function OnboardingForms({ defaultTab = "create" }: { defaultTab?: "create" | "join" }) {
  const [tab, setTab] = useState<"create" | "join">(defaultTab);
  return (
    <div className="card">
      <div role="tablist" aria-label="Get started" className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-stone-100 p-1">
        {(["create", "join"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            id={`tab-${t}`}
            aria-selected={tab === t}
            aria-controls={`panel-${t}`}
            onClick={() => setTab(t)}
            className={`min-h-[44px] rounded-lg font-semibold ${tab === t ? "bg-white shadow" : "text-[var(--muted)]"}`}
          >
            {t === "create" ? "Start a circle" : "Join a circle"}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "create" ? <CreateForm /> : <JoinForm />}
      </div>
    </div>
  );
}

function CreateForm() {
  const [state, action, pending] = useActionState(createCircleAction, null);
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  useEffect(() => {
    try {
      setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata");
    } catch {}
  }, []);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="timezone" value={timezone} />
      <label className="field">
        Who are we caring for?
        <input className="input" name="elderName" required maxLength={60} placeholder="e.g. Amma / Ramesh Rao" autoComplete="off" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field">
          Your name
          <input className="input" name="yourName" required maxLength={60} autoComplete="name" />
        </label>
        <label className="field">
          You are
          <select className="input" name="yourRole" defaultValue="family">
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        Your email <span className="font-normal text-[var(--muted)]">(for reminders — optional)</span>
        <input className="input" type="email" name="yourEmail" autoComplete="email" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field">
          Circle passcode
          <input className="input" type="password" name="passcode" required minLength={6} maxLength={64} autoComplete="new-password" aria-describedby="passcode-help" />
        </label>
        <label className="field">
          Preferred language
          <select className="input" name="language" defaultValue="en">
            {Object.entries(LANGUAGES).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p id="passcode-help" className="-mt-2 text-xs text-[var(--muted)]">
        Share this passcode only with people you trust. Everyone who knows it can join and help.
      </p>
      <FormStatus state={state} />
      <button className="btn-primary" disabled={pending}>
        {pending ? "Creating…" : "Create our care circle"}
      </button>
    </form>
  );
}

function JoinForm() {
  const [state, action, pending] = useActionState(joinCircleAction, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field">
          Circle code
          <input className="input uppercase tracking-widest" name="code" required maxLength={12} placeholder="ABCD-2345" autoComplete="off" />
        </label>
        <label className="field">
          Passcode
          <input className="input" type="password" name="passcode" required maxLength={64} autoComplete="current-password" />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field">
          Your name
          <input className="input" name="name" required maxLength={60} autoComplete="name" />
        </label>
        <label className="field">
          You are
          <select className="input" name="role" defaultValue="family">
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        Your email <span className="font-normal text-[var(--muted)]">(for reminders — optional)</span>
        <input className="input" type="email" name="email" autoComplete="email" />
      </label>
      <FormStatus state={state} />
      <button className="btn-primary" disabled={pending}>
        {pending ? "Joining…" : "Join the circle"}
      </button>
    </form>
  );
}
