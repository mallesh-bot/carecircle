"use client";

import { useActionState, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { createCircleAction, joinCircleAction } from "@/app/actions/onboarding";
import { DEFAULT_TIMEZONE } from "@/lib/time";
import { LANGUAGES } from "@/lib/validation";
import { fieldA11y, FormStatus } from "./FormStatus";

const ROLE_OPTIONS = [
  { value: "family", label: "Family member" },
  { value: "caretaker", label: "Caretaker / nurse" },
  { value: "elder", label: "I am the elder" },
];

const TABS = [
  { id: "create", label: "Start a circle" },
  { id: "join", label: "Join a circle" },
] as const;
type Tab = (typeof TABS)[number]["id"];

/** Create/join forms behind an ARIA tablist with arrow-key navigation. */
export function OnboardingForms({ defaultTab = "create" }: { defaultTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(defaultTab);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const current = TABS.findIndex((t) => t.id === tab);
    const next = { ArrowRight: current + 1, ArrowLeft: current - 1, Home: 0, End: TABS.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const index = (next + TABS.length) % TABS.length;
    setTab(TABS[index].id);
    tabRefs.current[index]?.focus();
  };

  return (
    <div className="card">
      <div role="tablist" aria-label="Get started" onKeyDown={onKeyDown} className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-stone-100 p-1">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            className={`min-h-[44px] rounded-lg font-semibold ${tab === t.id ? "bg-white shadow" : "text-[var(--muted)]"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "create" ? <CreateForm /> : <JoinForm />}
      </div>
    </div>
  );
}

const subscribeNoop = () => () => {};
const browserTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
};

function CreateForm() {
  const [state, action, pending] = useActionState(createCircleAction, null);
  const timezone = useSyncExternalStore(subscribeNoop, browserTimezone, () => DEFAULT_TIMEZONE);
  const statusId = useId();
  return (
    <form action={action} className="flex flex-col gap-4" aria-label="Start a care circle">
      <input type="hidden" name="timezone" value={timezone} />
      <label className="field">
        Who are we caring for?
        <input className="input" name="elderName" required maxLength={60} placeholder="e.g. Amma / Ramesh Rao" autoComplete="off" {...fieldA11y(state, "elderName", statusId)} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field">
          Your name
          <input className="input" name="yourName" required maxLength={60} autoComplete="name" {...fieldA11y(state, "yourName", statusId)} />
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
        <span>
          Your email <span className="font-normal text-[var(--muted)]">(for reminders — optional)</span>
        </span>
        <input className="input" type="email" name="yourEmail" autoComplete="email" {...fieldA11y(state, "yourEmail", statusId)} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field">
          Circle passcode
          <input
            className="input"
            type="password"
            name="passcode"
            required
            minLength={6}
            maxLength={64}
            autoComplete="new-password"
            aria-describedby="passcode-help"
            {...fieldA11y(state, "passcode", statusId)}
          />
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
        At least 6 characters. Share it only with people you trust — everyone who knows it can join and help.
      </p>
      <FormStatus state={state} id={statusId} />
      <button className="btn-primary" disabled={pending}>
        {pending ? "Creating…" : "Create our care circle"}
      </button>
    </form>
  );
}

function JoinForm() {
  const [state, action, pending] = useActionState(joinCircleAction, null);
  const statusId = useId();
  return (
    <form action={action} className="flex flex-col gap-4" aria-label="Join a care circle">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field">
          Circle code
          <input
            className="input uppercase tracking-widest"
            name="code"
            required
            maxLength={12}
            placeholder="ABCD-2345"
            autoComplete="off"
            autoCapitalize="characters"
            {...fieldA11y(state, "code", statusId)}
          />
        </label>
        <label className="field">
          Passcode
          <input className="input" type="password" name="passcode" required maxLength={64} autoComplete="current-password" {...fieldA11y(state, "passcode", statusId)} />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field">
          Your name
          <input className="input" name="name" required maxLength={60} autoComplete="name" {...fieldA11y(state, "name", statusId)} />
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
        <span>
          Your email <span className="font-normal text-[var(--muted)]">(for reminders — optional)</span>
        </span>
        <input className="input" type="email" name="email" autoComplete="email" {...fieldA11y(state, "email", statusId)} />
      </label>
      <FormStatus state={state} id={statusId} />
      <button className="btn-primary" disabled={pending}>
        {pending ? "Joining…" : "Join the circle"}
      </button>
    </form>
  );
}
