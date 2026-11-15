/**
 * Reminder planning is a pure function of (circle data, now) so it is easy to
 * test; delivery is idempotent through notification dedupe keys, so the job
 * can safely run as often as we like (cron, GitHub Actions, page loads).
 */
import { buildDaySchedule, MISSED_AFTER_MS, needsRefill } from "./schedule";
import { addDays, formatDateTime, formatTime, localDate, TIME } from "./time";
import type { Appointment, DoseLog, Medication, Member, ReminderKind } from "./types";

export const UPCOMING_DOSE_LEAD_MS = 30 * TIME.MINUTE;
export const APPOINTMENT_LEAD_MS = 24 * 60 * TIME.MINUTE;
/** Missed-dose alerts are only sent for doses missed within this window. */
export const MISSED_LOOKBACK_MS = 6 * 60 * TIME.MINUTE;

export interface PlannedReminder {
  dedupeKey: string;
  kind: ReminderKind;
  recipients: string[];
  subject: string;
  text: string;
}

export interface ReminderContext {
  circleId: string;
  elderName: string;
  timezone: string;
  members: Member[];
  medications: Medication[];
  logs: DoseLog[];
  appointments: Appointment[];
  appUrl: string;
}

function emails(members: Member[], roles?: Member["role"][]): string[] {
  return members
    .filter((m) => m.notify && m.email && (!roles || roles.includes(m.role)))
    .map((m) => m.email!) as string[];
}

export function planReminders(ctx: ReminderContext, now: Date): PlannedReminder[] {
  const everyone = emails(ctx.members);
  const supporters = emails(ctx.members, ["caretaker", "family"]);
  const out: PlannedReminder[] = [];
  const tz = ctx.timezone;
  const today = localDate(now, tz);

  const slots = [today, addDays(today, -1)].flatMap((d) => buildDaySchedule(ctx.medications, ctx.logs, d, tz, now));

  for (const slot of slots) {
    const delta = slot.scheduledAt.getTime() - now.getTime();
    const when = formatTime(slot.scheduledAt, tz);
    const iso = slot.scheduledAt.toISOString();

    if (slot.status === "due" || (slot.status === "upcoming" && delta <= UPCOMING_DOSE_LEAD_MS)) {
      if (delta > 0 && everyone.length) {
        out.push({
          dedupeKey: `upcoming:${slot.medicationId}:${iso}`,
          kind: "upcoming_dose",
          recipients: everyone,
          subject: `Reminder: ${slot.medicationName} at ${when}`,
          text:
            `${ctx.elderName} has a dose of ${slot.medicationName}${slot.dosage ? ` (${slot.dosage})` : ""} at ${when}.` +
            (slot.instructions ? `\nInstructions: ${slot.instructions}` : "") +
            `\n\nMark it as taken: ${ctx.appUrl}/circle`,
        });
      }
    }

    if (slot.status === "missed" && -delta <= MISSED_AFTER_MS + MISSED_LOOKBACK_MS && supporters.length) {
      out.push({
        dedupeKey: `missed:${slot.medicationId}:${iso}`,
        kind: "missed_dose",
        recipients: supporters,
        subject: `Missed dose: ${ctx.elderName} hasn't taken ${slot.medicationName}`,
        text:
          `The ${when} dose of ${slot.medicationName} hasn't been marked as taken.\n` +
          `Please check in with ${ctx.elderName}.\n\nUpdate it here: ${ctx.appUrl}/circle`,
      });
    }
  }

  for (const appt of ctx.appointments) {
    const delta = appt.startsAt.getTime() - now.getTime();
    if (delta > 0 && delta <= APPOINTMENT_LEAD_MS && everyone.length) {
      out.push({
        dedupeKey: `appt:${appt.id}:${appt.startsAt.toISOString()}`,
        kind: "appointment",
        recipients: everyone,
        subject: `Upcoming appointment: ${appt.title} — ${formatDateTime(appt.startsAt, tz)}`,
        text:
          `${ctx.elderName} has "${appt.title}"${appt.doctor ? ` with ${appt.doctor}` : ""} on ${formatDateTime(appt.startsAt, tz)}.` +
          (appt.location ? `\nWhere: ${appt.location}` : "") +
          (appt.notes ? `\nNotes: ${appt.notes}` : ""),
      });
    }
  }

  for (const med of needsRefill(ctx.medications)) {
    if (!supporters.length) continue;
    out.push({
      dedupeKey: `refill:${med.id}:${today}`,
      kind: "refill",
      recipients: supporters,
      subject: `Refill needed: ${med.name} (${med.stock} left)`,
      text: `Only ${med.stock} dose(s) of ${med.name} are left for ${ctx.elderName}. Please arrange a refill.`,
    });
  }

  return out.filter((r) => r.recipients.length > 0);
}
