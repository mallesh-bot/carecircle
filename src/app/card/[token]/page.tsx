import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/PrintButton";
import { getDb } from "@/lib/db";
import { getCircleByCardToken, listMedications } from "@/lib/repo";
import { localDate } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Emergency medical card", robots: { index: false, follow: false } };

/** Public, read-only emergency card reached by scanning the QR code. */
export default async function EmergencyCard({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) notFound();
  const db = await getDb();
  const circle = await getCircleByCardToken(db, token);
  if (!circle) notFound();
  const today = localDate(new Date(), circle.timezone);
  const meds = (await listMedications(db, circle.id)).filter((m) => m.active && (!m.endDate || m.endDate >= today));

  const rows: [string, string][] = [
    ["Blood group", circle.bloodGroup || "Not recorded"],
    ["Conditions", circle.conditions || "Not recorded"],
    ["Allergies", circle.allergies || "None recorded"],
    ["Emergency contact", circle.emergencyContact || "Not recorded"],
    ["Doctor", circle.doctorContact || "Not recorded"],
  ];

  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-8">
      <article className="card border-2 border-red-200">
        <header className="mb-4 flex items-start justify-between gap-4 border-b border-red-100 pb-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-[var(--danger)]">🆘 Emergency medical card</p>
            <h1 className="text-3xl font-extrabold">{circle.elderName}</h1>
          </div>
          <PrintButton />
        </header>
        <dl className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-semibold text-[var(--muted)]">{k}</dt>
              <dd className={k === "Allergies" && circle.allergies ? "font-bold text-[var(--danger)]" : "font-medium"}>{v}</dd>
            </div>
          ))}
        </dl>
        <h2 className="mt-6 text-lg font-bold">Current medicines</h2>
        {meds.length === 0 ? (
          <p className="text-[var(--muted)]">No medicines recorded.</p>
        ) : (
          <table className="mt-2 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--line)]">
                <th scope="col" className="py-2">Medicine</th>
                <th scope="col" className="py-2">Dose</th>
                <th scope="col" className="py-2">Times</th>
              </tr>
            </thead>
            <tbody>
              {meds.map((m) => (
                <tr key={m.id} className="border-b border-[var(--line)]">
                  <td className="py-2 font-semibold">{m.name}</td>
                  <td className="py-2">{m.dosage || "—"}</td>
                  <td className="py-2">{m.times.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-6 text-xs text-[var(--muted)]">Kept up to date by the family through CareCircle · Updated live.</p>
      </article>
    </main>
  );
}
