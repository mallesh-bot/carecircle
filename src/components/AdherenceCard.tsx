import type { Adherence } from "@/lib/schedule";

function ringColor(rate: number | null) {
  if (rate === null) return "#9ca3af";
  if (rate >= 90) return "var(--ok)";
  if (rate >= 70) return "var(--warn)";
  return "var(--danger)";
}

const WEEKDAY = new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: "UTC" });

/** 7-day adherence ring plus a per-day bar strip. Server-rendered, no JS. */
export function AdherenceCard({ adherence }: { adherence: Adherence }) {
  const { rate } = adherence;
  const r = 42;
  const circumference = 2 * Math.PI * r;
  const filled = rate === null ? 0 : (rate / 100) * circumference;
  return (
    <section className="card" aria-labelledby="adherence-title">
      <h2 id="adherence-title" className="section-title">
        7-day adherence
      </h2>
      <div className="mt-4 flex items-center gap-5">
        <svg width="104" height="104" viewBox="0 0 104 104" role="img" aria-label={rate === null ? "No data yet" : `${rate}% of doses taken`}>
          <circle cx="52" cy="52" r={r} fill="none" stroke="#eee8de" strokeWidth="12" />
          <circle
            cx="52"
            cy="52"
            r={r}
            fill="none"
            stroke={ringColor(rate)}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference}`}
            transform="rotate(-90 52 52)"
          />
          <text x="52" y="58" textAnchor="middle" fontSize="20" fontWeight="700" fill="currentColor">
            {rate === null ? "—" : `${rate}%`}
          </text>
        </svg>
        <dl className="grid grid-cols-3 gap-3 text-center text-sm">
          <div>
            <dt className="text-[var(--muted)]">Taken</dt>
            <dd className="text-xl font-bold text-[var(--ok)]">{adherence.taken}</dd>
          </div>
          <div>
            <dt className="text-[var(--muted)]">Missed</dt>
            <dd className="text-xl font-bold text-[var(--danger)]">{adherence.missed}</dd>
          </div>
          <div>
            <dt className="text-[var(--muted)]">Skipped</dt>
            <dd className="text-xl font-bold text-stone-500">{adherence.skipped}</dd>
          </div>
        </dl>
      </div>
      <ol className="mt-5 grid grid-cols-7 gap-1.5" aria-label="Doses taken per day">
        {adherence.days.map((d) => {
          const total = d.taken + d.missed;
          const pct = total === 0 ? 0 : Math.round((d.taken / total) * 100);
          const label = WEEKDAY.format(new Date(`${d.date}T00:00:00Z`));
          return (
            <li key={d.date} className="flex flex-col items-center gap-1 text-xs text-[var(--muted)]">
              <span className="relative h-16 w-full overflow-hidden rounded-md bg-stone-100" aria-hidden>
                <span
                  className="absolute inset-x-0 bottom-0 rounded-md"
                  style={{ height: `${total === 0 ? 0 : Math.max(pct, 6)}%`, background: ringColor(total === 0 ? null : pct) }}
                />
              </span>
              <span>{label}</span>
              <span className="sr-only">
                {total === 0 ? "no doses" : `${d.taken} of ${total} taken`}
              </span>
            </li>
          );
        })}
      </ol>
      {adherence.byMedication.some((m) => m.missed > 0) && (
        <ul className="mt-4 space-y-1 text-sm">
          {adherence.byMedication
            .filter((m) => m.missed > 0)
            .map((m) => (
              <li key={m.medicationId}>
                <span className="font-semibold">{m.name}</span>: {m.missed} missed this week
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
