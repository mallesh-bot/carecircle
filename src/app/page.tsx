import { redirect } from "next/navigation";
import { startDemoAction } from "@/app/actions";
import { OnboardingForms } from "@/components/OnboardingForms";
import { SiteFooter } from "@/components/SiteFooter";
import { getViewer } from "@/lib/session";

export const dynamic = "force-dynamic";

const FEATURES = [
  {
    icon: "📷",
    title: "Snap a prescription",
    body: "Google Gemini reads the doctor's handwriting — even 1-0-1 shorthand — and builds the medicine schedule for you.",
  },
  {
    icon: "🗣️",
    title: "Voice-first Elder Mode",
    body: "Huge buttons, the day's medicines read aloud in their language, and “I took it” by voice. Dignity, not dashboards.",
  },
  {
    icon: "👨‍👩‍👧",
    title: "One circle, many hands",
    body: "Elder, caretaker and family share one passcode-protected profile. Everyone sees who gave what, and when.",
  },
  {
    icon: "📧",
    title: "Reminders that escalate",
    body: "Email nudges before each dose; if a dose is missed, the family is told — not just the phone that was ignored.",
  },
  {
    icon: "📈",
    title: "Adherence you can see",
    body: "A 7-day adherence ring, per-medicine trends, refill alerts and an AI weekly care digest for busy families.",
  },
  {
    icon: "🆘",
    title: "Emergency QR card",
    body: "A printable card with medicines, allergies and contacts for paramedics — one scan, no login needed.",
  },
];

export default async function Home() {
  if (await getViewer()) redirect("/circle");
  return (
    <>
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <span className="flex items-center gap-2 text-xl font-extrabold text-[var(--brand)]">
          <span aria-hidden className="grid h-9 w-9 place-items-center rounded-full bg-[var(--brand)] text-white">
            ◎
          </span>
          CareCircle
        </span>
        <span className="chip bg-[var(--brand-soft)] text-[var(--brand)]">Powered by Google Gemini</span>
      </header>

      <main id="main" className="mx-auto grid max-w-6xl gap-10 px-4 pb-8 pt-4 lg:grid-cols-[1.1fr_1fr] lg:items-start">
        <section aria-labelledby="hero-title" className="flex flex-col gap-6 lg:pt-6">
          <h1 id="hero-title" className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Caring together for the ones who <span className="text-[var(--brand)]">cared for us.</span>
          </h1>
          <p className="max-w-xl text-lg text-[var(--muted)]">
            CareCircle keeps an elderly parent&apos;s medicines, doctor visits and reminders in one shared, secure place — so the
            elder stays in charge of their own health, and the whole family can help.
          </p>
          <form action={startDemoAction} className="flex flex-wrap items-center gap-3">
            <button className="btn-primary px-6 text-lg">▶ Try the live demo</button>
            <span className="text-sm text-[var(--muted)]">One click · a private sample circle with a week of real-looking data</span>
          </form>
          <ul className="grid gap-3 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <li key={f.title} className="card flex gap-3 p-4">
                <span aria-hidden className="text-2xl">
                  {f.icon}
                </span>
                <span>
                  <strong className="block">{f.title}</strong>
                  <span className="text-sm text-[var(--muted)]">{f.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="Create or join a care circle" className="lg:sticky lg:top-6">
          <OnboardingForms />
          <p className="mt-3 text-center text-sm text-[var(--muted)]">
            No app install, no accounts to remember — just a circle code and a passcode.
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
