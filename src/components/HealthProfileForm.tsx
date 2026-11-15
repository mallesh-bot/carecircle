"use client";

import { useActionState } from "react";
import { saveEmergencyAction } from "@/app/actions/circle";
import { LANGUAGES, type Language } from "@/lib/validation";
import { FormStatus } from "./FormStatus";

export interface HealthProfile {
  bloodGroup: string;
  conditions: string;
  allergies: string;
  emergencyContact: string;
  doctorContact: string;
  language: Language;
}

const BLOOD_GROUPS = ["", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export function HealthProfileForm({ profile }: { profile: HealthProfile }) {
  const [state, action, pending] = useActionState(saveEmergencyAction, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field">
          Blood group
          <select className="input" name="bloodGroup" defaultValue={profile.bloodGroup}>
            {BLOOD_GROUPS.map((b) => (
              <option key={b} value={b}>
                {b || "Not set"}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Language for voice &amp; AI
          <select className="input" name="language" defaultValue={profile.language}>
            {Object.entries(LANGUAGES).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        Health conditions
        <input className="input" name="conditions" maxLength={300} defaultValue={profile.conditions} placeholder="e.g. Type 2 diabetes, hypertension" />
      </label>
      <label className="field">
        Allergies
        <input className="input" name="allergies" maxLength={300} defaultValue={profile.allergies} placeholder="e.g. Penicillin" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field">
          Emergency contact
          <input className="input" name="emergencyContact" maxLength={160} defaultValue={profile.emergencyContact} placeholder="e.g. Priya (daughter) +91 98xxxxxx" />
        </label>
        <label className="field">
          Doctor
          <input className="input" name="doctorContact" maxLength={160} defaultValue={profile.doctorContact} placeholder="e.g. Dr. Rao, +91 40 xxxx xxxx" />
        </label>
      </div>
      <FormStatus state={state} />
      <button className="btn-primary self-start" disabled={pending}>
        {pending ? "Saving…" : "Save health profile"}
      </button>
    </form>
  );
}
