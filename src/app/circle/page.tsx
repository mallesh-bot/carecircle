import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import QRCode from "qrcode";
import { signOutAction } from "@/app/actions";
import { AdherenceCard } from "@/components/AdherenceCard";
import { Appointments } from "@/components/Appointments";
import { CareDigest } from "@/components/CareDigest";
import { MemberList, MyNotifications, SendRemindersButton } from "@/components/CircleSettings";
import { CopyButton } from "@/components/CopyButton";
import { DoseList } from "@/components/DoseList";
import { HealthProfileForm } from "@/components/HealthProfileForm";
import { MedicationList } from "@/components/MedicationList";
import { PrescriptionScanner } from "@/components/PrescriptionScanner";
import { SiteFooter } from "@/components/SiteFooter";
import { TextSizeToggle } from "@/components/TextSizeToggle";
import { loadDashboard } from "@/lib/dashboard";
import { getDb } from "@/lib/db";
import { emailEnabled } from "@/lib/email";
import { geminiEnabled } from "@/lib/gemini";
import { appUrl, runRemindersForCircle } from "@/lib/reminder-runner";
import { requireViewer } from "@/lib/session";
import { formatDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Our circle", robots: { index: false } };

const NAV = [
  ["today", "Today"],
  ["medicines", "Medicines"],
  ["appointments", "Appointments"],
  ["circle", "Circle"],
  ["health", "Health card"],
] as const;

const KIND_ICON = { upcoming_dose: "💊", missed_dose: "⚠️", appointment: "🩺", refill: "📦" } as const;

export default async function CirclePage({ searchParams }: { searchParams: Promise<{ welcome?: string; demo?: string }> }) {
  const { member, circle } = await requireViewer();
  const { welcome, demo } = await searchParams;
  const now = new Date();
  const data = await loadDashboard(circle.id, circle.timezone, now);
  const aiEnabled = geminiEnabled();
  const cardUrl = `${appUrl()}/card/${circle.cardToken}`;
  const qrSvg = await QRCode.toString(cardUrl, { type: "svg", margin: 1, width: 160, errorCorrectionLevel: "M" });

  // Opportunistic reminder run after the response is sent — a safety net on top of cron.
  after(async () => {
    try {
      await runRemindersForCircle(await getDb(), circle.id);
    } catch (err) {
      console.error("background reminders failed", String(err));
    }
  });

  const due = data.schedule.filter((s) => s.status === "due").length;
  const missedToday = data.schedule.filter((s) => s.status === "missed").length;
  const nextAppt = data.appointments.find((a) => a.startsAt > now);

  return (
    <>
      <header className="no-print border-b border-[var(--line)] bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-lg font-extrabold text-[var(--brand)]">◎ {circle.name}</p>
            <p className="flex items-center gap-2 text-sm text-[var(--muted)]">
              Circle code <strong className="tracking-widest text-[var(--ink)]">{circle.code}</strong>
              <CopyButton text={circle.code} label="Copy" />
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/circle/elder" className="btn-primary">
              🗣️ Elder Mode
            </Link>
            <TextSizeToggle />
            <form action={signOutAction}>
              <button className="btn-ghost text-sm">Sign out</button>
            </form>
          </div>
        </div>
        <nav aria-label="Sections" className="mx-auto max-w-6xl overflow-x-auto px-4">
          <ul className="flex gap-1 pb-2">
            {NAV.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="block whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold text-[var(--muted)] hover:bg-stone-100 hover:text-[var(--ink)]">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main id="main" className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-6">
        {demo && (
          <div role="status" className="card border-[var(--brand)] bg-[var(--brand-soft)]">
            <p className="font-semibold">👋 Welcome to the demo — this is Lakshmi Amma&apos;s circle, just for you.</p>
            <p className="text-sm">
              Try: mark a dose as taken · open <strong>🗣️ Elder Mode</strong> and press &ldquo;Read my medicines&rdquo; · ✨ generate the weekly
              digest · open the 🆘 emergency card · add an appointment to Google Calendar.
            </p>
          </div>
        )}
        {welcome && (
          <div role="status" className="card border-[var(--brand)] bg-[var(--brand-soft)]">
            <p className="font-semibold">Your care circle is ready 🎉</p>
            <p className="text-sm">
              Invite family and caretakers: share the circle code <strong>{circle.code}</strong> and your passcode. Then add medicines below —
              or scan a prescription with Gemini.
            </p>
          </div>
        )}

        <section id="today" aria-labelledby="today-title" className="grid scroll-mt-28 gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="card">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h1 id="today-title" className="text-2xl font-bold">
                Today for {circle.elderName}
              </h1>
              <p className="text-sm text-[var(--muted)]">
                {due > 0 && <span className="chip mr-2 bg-[var(--warn-soft)] text-[var(--warn)]">{due} due now</span>}
                {missedToday > 0 && <span className="chip bg-[var(--danger-soft)] text-[var(--danger)]">{missedToday} missed</span>}
              </p>
            </div>
            <DoseList slots={data.schedule.map((s) => ({ ...s, scheduledAt: s.scheduledAt.toISOString() }))} timezone={circle.timezone} />
          </div>
          <div className="flex flex-col gap-6">
            <AdherenceCard adherence={data.adherence} />
            {(data.refills.length > 0 || nextAppt) && (
              <section className="card" aria-label="Heads up">
                <h2 className="section-title">Heads up</h2>
                <ul className="mt-3 flex flex-col gap-2 text-sm">
                  {nextAppt && (
                    <li>
                      🩺 <strong>{nextAppt.title}</strong> — {formatDateTime(nextAppt.startsAt, circle.timezone)}
                    </li>
                  )}
                  {data.refills.map((m) => (
                    <li key={m.id}>
                      📦 <strong>{m.name}</strong> is running low ({m.stock} left)
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <CareDigest aiEnabled={aiEnabled} language={circle.language} />
          </div>
        </section>

        <section id="medicines" aria-labelledby="medicines-title" className="grid scroll-mt-28 gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="card">
            <h2 id="medicines-title" className="section-title mb-4">
              Medicines
            </h2>
            <MedicationList meds={data.medications} today={data.today} language={circle.language} aiEnabled={aiEnabled} />
          </div>
          <div className="card self-start">
            <h2 className="section-title">📷 Scan a prescription</h2>
            <p className="mb-4 mt-1 text-sm text-[var(--muted)]">
              Take a photo of the doctor&apos;s prescription. Gemini reads it — including shorthand like 1-0-1, BD and HS — and you confirm
              before anything is added.
            </p>
            <PrescriptionScanner aiEnabled={aiEnabled} />
          </div>
        </section>

        <section id="appointments" aria-labelledby="appointments-title" className="card scroll-mt-28">
          <h2 id="appointments-title" className="section-title mb-4">
            Doctor appointments
          </h2>
          <Appointments
            items={data.appointments.map((a) => ({ ...a, startsAt: a.startsAt.toISOString(), createdAt: undefined }))}
            timezone={circle.timezone}
            elderName={circle.elderName}
          />
        </section>

        <section id="circle" aria-labelledby="circle-title" className="grid scroll-mt-28 gap-6 lg:grid-cols-2">
          <div className="card">
            <h2 id="circle-title" className="section-title mb-4">
              The circle
            </h2>
            <MemberList
              members={data.members.map((m) => ({ id: m.id, name: m.name, role: m.role, hasEmail: Boolean(m.email), notify: m.notify }))}
              meId={member.id}
              canRemove={member.role !== "family"}
            />
            <div className="mt-6 border-t border-[var(--line)] pt-4">
              <h3 className="mb-2 font-semibold">My reminders</h3>
              <MyNotifications email={member.email} notify={member.notify} />
            </div>
          </div>
          <div className="flex flex-col gap-6">
            <div className="card">
              <h2 className="section-title">Reminders</h2>
              <p className="mb-3 mt-1 text-sm text-[var(--muted)]">
                {emailEnabled()
                  ? "Email reminders are on. Members are emailed before each dose; caretakers and family are alerted about missed doses, appointments and refills."
                  : "Email delivery isn't configured on this deployment, so reminders appear here in the app."}
              </p>
              <SendRemindersButton />
              <ul className="mt-4 flex flex-col gap-2 text-sm">
                {data.notifications.length === 0 && <li className="text-[var(--muted)]">No reminders yet.</li>}
                {data.notifications.map((n) => (
                  <li key={n.id} className="flex items-start gap-2">
                    <span aria-hidden>{KIND_ICON[n.kind]}</span>
                    <span>
                      {n.subject}
                      <span className="block text-xs text-[var(--muted)]">
                        {formatDateTime(n.createdAt, circle.timezone)} · {n.delivered ? `emailed to ${n.recipients.length}` : "in-app"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card">
              <h2 className="section-title">Recent activity</h2>
              <ul className="mt-3 flex flex-col gap-2 text-sm">
                {data.activity.map((a) => (
                  <li key={a.id}>
                    <strong>{a.actor}</strong> {a.message}
                    <span className="block text-xs text-[var(--muted)]">{formatDateTime(a.createdAt, circle.timezone)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section id="health" aria-labelledby="health-title" className="grid scroll-mt-28 gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="card">
            <h2 id="health-title" className="section-title mb-4">
              Health profile
            </h2>
            <HealthProfileForm
              profile={{
                bloodGroup: circle.bloodGroup,
                conditions: circle.conditions,
                allergies: circle.allergies,
                emergencyContact: circle.emergencyContact,
                doctorContact: circle.doctorContact,
                language: circle.language,
              }}
            />
          </div>
          <div className="card flex flex-col items-start gap-3 self-start">
            <h2 className="section-title">🆘 Emergency QR card</h2>
            <p className="text-sm text-[var(--muted)]">
              Print this and keep it in a wallet or on the fridge. Paramedics can scan it to see current medicines, allergies and contacts —
              read-only, no login needed.
            </p>
            <div className="rounded-xl border border-[var(--line)] bg-white p-2" role="img" aria-label="QR code for the emergency card" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <Link href={`/card/${circle.cardToken}`} className="btn-ghost" target="_blank">
              Open printable card
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
