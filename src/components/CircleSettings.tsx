"use client";

import { useActionState, useState, useTransition } from "react";
import { removeMemberAction, sendRemindersNowAction, updateMyNotificationsAction } from "@/app/actions/circle";
import type { ActionState } from "@/lib/action-utils";
import { canRemove } from "@/lib/permissions";
import type { Role } from "@/lib/types";
import { FormStatus } from "./FormStatus";

export interface MemberView {
  id: string;
  name: string;
  role: Role;
  hasEmail: boolean;
  notify: boolean;
}

const ROLE_LABEL: Record<Role, string> = { elder: "Elder", caretaker: "Caretaker", family: "Family" };

export function MemberList({ members, meId, viewerRole }: { members: MemberView[]; meId: string; viewerRole: Role }) {
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<ActionState>(null);
  return (
    <>
    <FormStatus state={status} />
    <ul className="flex flex-col gap-2">
      {members.map((m) => (
        <li key={m.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-white px-4 py-3">
          <span className="flex items-center gap-3">
            <span aria-hidden className="grid h-9 w-9 place-items-center rounded-full bg-[var(--brand-soft)] font-bold text-[var(--brand)]">
              {m.name.slice(0, 1).toUpperCase()}
            </span>
            <span>
              <span className="font-semibold">
                {m.name} {m.id === meId && <span className="font-normal text-[var(--muted)]">(you)</span>}
              </span>
              <span className="block text-xs text-[var(--muted)]">
                {ROLE_LABEL[m.role]} · {m.hasEmail && m.notify ? "gets email reminders" : "in-app only"}
              </span>
            </span>
          </span>
          {canRemove(viewerRole, m.role, m.id === meId) && (
            <button
              type="button"
              className="btn-ghost text-sm"
              disabled={pending}
              onClick={() => start(async () => setStatus(await removeMemberAction(m.id)))}
              aria-label={`Remove ${m.name}`}
            >
              Remove
            </button>
          )}
        </li>
      ))}
    </ul>
    </>
  );
}

export function MyNotifications({ email, notify }: { email: string | null; notify: boolean }) {
  const [state, action, pending] = useActionState(updateMyNotificationsAction, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="field">
        My email for reminders
        <input className="input" type="email" name="email" defaultValue={email ?? ""} autoComplete="email" />
      </label>
      <label className="flex min-h-[44px] items-center gap-3">
        <input type="checkbox" name="notify" defaultChecked={notify} className="h-5 w-5" />
        Email me dose, missed-dose, appointment and refill reminders
      </label>
      <FormStatus state={state} />
      <button className="btn-ghost self-start" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

export function SendRemindersButton() {
  const [state, setState] = useState<ActionState>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <button className="btn-ghost self-start" disabled={pending} onClick={() => start(async () => setState(await sendRemindersNowAction()))}>
        {pending ? "Checking…" : "🔔 Check & send reminders now"}
      </button>
      <FormStatus state={state} />
    </div>
  );
}
