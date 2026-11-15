"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { logDoseAction } from "@/app/actions/doses";
import { partOfDay, phraseLanguage, phrasesFor } from "@/lib/elder-phrases";
import { canSpeak, getRecognition, meansTaken, speak, SPEECH_LANG } from "@/lib/speech";
import { formatTime } from "@/lib/time";
import type { Language } from "@/lib/validation";
import type { DoseSlotView } from "./DoseList";

const NO_VOICE = "Voice needs Chrome or Edge on this device — you can still tap the big button.";

const subscribeNoop = () => () => {};
const NO_SUPPORT = { speak: false, listen: false };
let cachedSupport: typeof NO_SUPPORT | null = null;
/** Browser voice capabilities (stable snapshot for useSyncExternalStore). */
const voiceSupport = () => (cachedSupport ??= { speak: canSpeak(), listen: Boolean(getRecognition()) });

const ICON = { taken: "✅", skipped: "⏭️", missed: "⚠️", due: "⏰", upcoming: "🕒" } as const;

export function ElderMode({
  elderName,
  slots,
  timezone,
  language,
  hour,
}: {
  elderName: string;
  slots: DoseSlotView[];
  timezone: string;
  language: Language;
  hour: number;
}) {
  const t = phrasesFor(language);
  const voiceLang = phraseLanguage(language);
  const [pending, start] = useTransition();
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const voiceSupported = useSyncExternalStore(subscribeNoop, voiceSupport, () => NO_SUPPORT);
  const recognitionRef = useRef<{ stop(): void } | null>(null);

  // The dose to act on: anything due or missed first, otherwise the next upcoming one.
  const current = slots.find((s) => s.status === "due" || s.status === "missed") ?? slots.find((s) => s.status === "upcoming");
  const actionable = Boolean(current);

  const markTaken = () => {
    if (!current) return;
    start(async () => {
      const res = await logDoseAction(current.medicationId, current.scheduledAt, "taken");
      const msg = res?.ok ? t.saved(current.medicationName) : res?.error ?? "Something went wrong.";
      setMessage(msg);
      speak(msg, voiceLang);
    });
  };

  const readAll = () => {
    if (slots.length === 0) return speak(t.noMeds, voiceLang);
    const items = slots.map((s) => `${formatTime(new Date(s.scheduledAt), timezone)}: ${s.medicationName}${s.dosage ? `, ${s.dosage}` : ""}.`).join(" ");
    speak(t.summary(slots.length, items), voiceLang);
  };

  const listen = () => {
    const Recognition = getRecognition();
    if (!Recognition) return;
    const rec = new Recognition();
    rec.lang = SPEECH_LANG[language];
    rec.interimResults = false;
    rec.maxAlternatives = 3;
    rec.onresult = (e) => {
      const heard = Array.from(e.results[0] ?? []).map((a) => a.transcript).join(" ");
      if (meansTaken(heard)) markTaken();
      else setMessage(`“${heard}”`);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    setMessage(null);
    rec.start();
  };

  useEffect(() => () => recognitionRef.current?.stop(), []);

  return (
    <main id="main" lang={voiceLang} className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-4 py-6 text-[1.35rem]">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold sm:text-4xl">{t.greeting(partOfDay(hour), elderName)} 🙏</h1>
        <Link href="/circle" className="btn-ghost shrink-0 text-base" lang="en">
          Family view
        </Link>
      </div>

      <section aria-labelledby="next-title" className="card border-2 border-[var(--brand)] p-6">
        <h2 id="next-title" className="text-lg font-semibold text-[var(--muted)]">
          {t.next}
        </h2>
        {current ? (
          <>
            <p className="mt-2 text-4xl font-extrabold leading-tight">{current.medicationName}</p>
            <p className="mt-1 text-2xl">
              {current.dosage && <span>{current.dosage} · </span>}
              <time dateTime={current.scheduledAt}>{formatTime(new Date(current.scheduledAt), timezone)}</time>
            </p>
            {current.instructions && <p className="mt-1 text-xl text-[var(--muted)]">{current.instructions}</p>}
            <button
              className="btn mt-6 min-h-[88px] w-full rounded-2xl bg-[var(--ok)] text-3xl text-white hover:brightness-110"
              onClick={markTaken}
              disabled={pending || !actionable}
            >
              ✓ {t.tookIt}
            </button>
          </>
        ) : (
          <p className="mt-3 text-3xl font-bold text-[var(--ok)]">{t.allDone}</p>
        )}
        <p role="status" aria-live="assertive" className="mt-4 min-h-[2rem] text-xl font-semibold text-[var(--brand)]">
          {message}
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <button className="btn-ghost min-h-[72px] text-xl" onClick={voiceSupported.speak ? readAll : () => setMessage(NO_VOICE)}>
          🔊 {t.readAloud}
        </button>
        <button className="btn-ghost min-h-[72px] text-xl" onClick={voiceSupported.listen ? listen : () => setMessage(NO_VOICE)} disabled={listening || !actionable}>
          🎤 {listening ? t.listening : t.sayIt}
        </button>
      </div>

      <section aria-label="Today's medicines" className="card">
        <ol className="flex flex-col divide-y divide-[var(--line)]">
          {slots.map((s) => (
            <li key={`${s.medicationId}@${s.scheduledAt}`} className="flex items-center gap-4 py-3">
              <span aria-hidden className="text-3xl">
                {ICON[s.status]}
              </span>
              <span className="flex-1">
                <span className="block font-bold">{s.medicationName}</span>
                <span className="text-lg text-[var(--muted)]">{formatTime(new Date(s.scheduledAt), timezone)}</span>
              </span>
              <span className="sr-only">{s.status}</span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
