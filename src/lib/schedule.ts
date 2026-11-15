import { addDays, localDate, TIME, zonedTimeToUtc } from "./time";
import type { DoseLog, DoseStatus, Medication } from "./types";

/** A dose becomes "due" this long before its time… */
export const DUE_WINDOW_MS = 30 * TIME.MINUTE;
/** …and counts as missed if nobody logs it within this long after. */
export const MISSED_AFTER_MS = 60 * TIME.MINUTE;

export interface DoseSlot {
  medicationId: string;
  medicationName: string;
  dosage: string;
  instructions: string;
  scheduledAt: Date;
  status: DoseStatus;
  loggedBy: string | null;
}

/** Key used to match a scheduled slot with its log entry. */
export function slotKey(medicationId: string, scheduledAt: Date): string {
  return `${medicationId}@${scheduledAt.toISOString()}`;
}

/** Whether the medication is scheduled on the given local date. */
export function isScheduledOn(med: Medication, date: string): boolean {
  if (!med.active) return false;
  if (date < med.startDate) return false;
  if (med.endDate && date > med.endDate) return false;
  if (med.daysOfWeek.length === 0) return true;
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return med.daysOfWeek.includes(weekday);
}

/** All UTC instants at which `med` should be taken on local `date`. */
export function slotsForDate(med: Medication, date: string, timeZone: string): Date[] {
  if (!isScheduledOn(med, date)) return [];
  return [...med.times].sort().map((t) => zonedTimeToUtc(date, t, timeZone));
}

/** Status of a slot given its (optional) log entry and the current time. */
export function statusFor(scheduledAt: Date, log: DoseLog | undefined, now: Date): DoseStatus {
  if (log) return log.status;
  const diff = now.getTime() - scheduledAt.getTime();
  if (diff > MISSED_AFTER_MS) return "missed";
  if (diff >= -DUE_WINDOW_MS) return "due";
  return "upcoming";
}

export function indexLogs(logs: DoseLog[]): Map<string, DoseLog> {
  return new Map(logs.map((l) => [slotKey(l.medicationId, l.scheduledAt), l]));
}

/** The full, time-ordered dose schedule for one local day. */
export function buildDaySchedule(
  meds: Medication[],
  logs: DoseLog[],
  date: string,
  timeZone: string,
  now: Date,
): DoseSlot[] {
  const byKey = indexLogs(logs);
  const slots: DoseSlot[] = [];
  for (const med of meds) {
    for (const scheduledAt of slotsForDate(med, date, timeZone)) {
      const log = byKey.get(slotKey(med.id, scheduledAt));
      // A dose that was due before the medicine was added can't have been "missed".
      if (!log && scheduledAt.getTime() < med.createdAt.getTime() - MISSED_AFTER_MS) continue;
      slots.push({
        medicationId: med.id,
        medicationName: med.name,
        dosage: med.dosage,
        instructions: med.instructions,
        scheduledAt,
        status: statusFor(scheduledAt, log, now),
        loggedBy: log?.loggedBy ?? null,
      });
    }
  }
  return slots.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}

export interface DayAdherence {
  date: string;
  taken: number;
  missed: number;
  skipped: number;
}

export interface Adherence {
  /** Percentage 0–100, or null when there is nothing to measure yet. */
  rate: number | null;
  taken: number;
  missed: number;
  skipped: number;
  days: DayAdherence[];
  byMedication: { medicationId: string; name: string; rate: number | null; missed: number }[];
}

function rate(taken: number, missed: number): number | null {
  const total = taken + missed;
  return total === 0 ? null : Math.round((taken / total) * 100);
}

/**
 * Adherence over the last `days` local days (including today). Only slots that
 * are settled (logged, or past the missed threshold) are counted, and slots
 * before a medication was added are ignored. Intentionally skipped doses
 * (e.g. on doctor's advice) are reported but don't lower the rate.
 */
export function computeAdherence(
  meds: Medication[],
  logs: DoseLog[],
  timeZone: string,
  now: Date,
  days = 7,
): Adherence {
  const byKey = indexLogs(logs);
  const today = localDate(now, timeZone);
  const perDay: DayAdherence[] = [];
  const perMed = new Map(meds.map((m) => [m.id, { taken: 0, missed: 0 }]));

  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const day: DayAdherence = { date, taken: 0, missed: 0, skipped: 0 };
    for (const med of meds) {
      for (const scheduledAt of slotsForDate(med, date, timeZone)) {
        const log = byKey.get(slotKey(med.id, scheduledAt));
        // Don't count doses that were due before the medicine was added to CareCircle.
        if (!log && scheduledAt.getTime() < med.createdAt.getTime()) continue;
        const status = statusFor(scheduledAt, log, now);
        if (status === "taken" || status === "missed" || status === "skipped") {
          day[status]++;
          const m = perMed.get(med.id)!;
          if (status === "taken") m.taken++;
          if (status === "missed") m.missed++;
        }
      }
    }
    perDay.push(day);
  }

  const taken = perDay.reduce((s, d) => s + d.taken, 0);
  const missed = perDay.reduce((s, d) => s + d.missed, 0);
  const skipped = perDay.reduce((s, d) => s + d.skipped, 0);
  return {
    rate: rate(taken, missed),
    taken,
    missed,
    skipped,
    days: perDay,
    byMedication: meds.map((m) => {
      const s = perMed.get(m.id)!;
      return { medicationId: m.id, name: m.name, rate: rate(s.taken, s.missed), missed: s.missed };
    }),
  };
}

/** Medications whose remaining stock is at or below their refill threshold. */
export function needsRefill(meds: Medication[]): Medication[] {
  return meds.filter((m) => m.active && m.stock !== null && m.stock <= m.refillThreshold);
}
