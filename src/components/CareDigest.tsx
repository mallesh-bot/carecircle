"use client";

import { useState, useTransition } from "react";
import { careDigestAction, type DigestState } from "@/app/actions";
import { speak } from "@/lib/speech";
import type { Language } from "@/lib/validation";

export function CareDigest({ aiEnabled, language }: { aiEnabled: boolean; language: Language }) {
  const [state, setState] = useState<DigestState>(null);
  const [pending, start] = useTransition();
  const d = state?.digest;
  return (
    <section className="card" aria-labelledby="digest-title">
      <h2 id="digest-title" className="section-title">
        ✨ Weekly care digest
      </h2>
      <p className="mt-1 text-sm text-[var(--muted)]">A kind, plain-language summary of the week for busy family members — written by Gemini.</p>
      <div aria-live="polite" className="mt-3">
        {d ? (
          <div className="flex flex-col gap-2 text-sm">
            <p className="text-base font-semibold">{d.headline}</p>
            <p>{d.summary}</p>
            {d.suggestions.length > 0 && (
              <ul className="list-disc pl-5">
                {d.suggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            )}
            <button className="btn-ghost self-start text-sm" onClick={() => speak(`${d.headline}. ${d.summary}`, language)}>
              🔊 Read aloud
            </button>
          </div>
        ) : (
          state?.error && <p className="text-sm font-medium text-[var(--danger)]">{state.error}</p>
        )}
      </div>
      <button
        className="btn-primary mt-3"
        disabled={pending || !aiEnabled}
        title={aiEnabled ? undefined : "Add GEMINI_API_KEY to enable"}
        onClick={() => start(async () => setState(await careDigestAction()))}
      >
        {pending ? "Writing…" : d ? "Refresh digest" : "Generate this week's digest"}
      </button>
      {!aiEnabled && <p className="mt-2 text-xs text-[var(--muted)]">Gemini isn&apos;t switched on for this deployment yet.</p>}
    </section>
  );
}
