import type { Metadata } from "next";
import { ElderMode } from "@/components/ElderMode";
import { loadDashboard } from "@/lib/dashboard";
import { requireViewer } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Elder Mode", robots: { index: false } };

export default async function ElderPage() {
  const { circle } = await requireViewer();
  const now = new Date();
  const { schedule } = await loadDashboard(circle.id, circle.timezone, now);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: circle.timezone }).format(now));
  return (
    <ElderMode
      elderName={circle.elderName}
      slots={schedule.map((s) => ({ ...s, scheduledAt: s.scheduledAt.toISOString() }))}
      timezone={circle.timezone}
      language={circle.language}
      hour={hour}
    />
  );
}
