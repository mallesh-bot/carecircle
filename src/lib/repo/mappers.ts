/** Row → domain object mappers. Kept separate so SQL modules stay focused on queries. */
import type { Activity, Appointment, Circle, DoseLog, LoggedDoseStatus, Medication, Member, Notification, ReminderKind, Role } from "../types";
import type { Language } from "../validation";

export type Row = Record<string, unknown>;

export const asDate = (v: unknown): Date => (v instanceof Date ? v : new Date(String(v)));
/** DATE columns arrive as "YYYY-MM-DD" (our pg type parser) or as a UTC-midnight Date (some drivers). */
const asIsoDate = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);
const asText = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

export interface CircleDetails extends Circle {
  language: Language;
  bloodGroup: string;
  conditions: string;
  allergies: string;
  emergencyContact: string;
  doctorContact: string;
  cardToken: string;
}

export function toCircle(r: Row): CircleDetails {
  return {
    id: asText(r.id),
    code: asText(r.code),
    name: asText(r.name),
    elderName: asText(r.elder_name),
    timezone: asText(r.timezone),
    language: asText(r.language) as Language,
    bloodGroup: asText(r.blood_group),
    conditions: asText(r.conditions),
    allergies: asText(r.allergies),
    emergencyContact: asText(r.emergency_contact),
    doctorContact: asText(r.doctor_contact),
    cardToken: asText(r.card_token),
    createdAt: asDate(r.created_at),
  };
}

export function toMember(r: Row): Member {
  return {
    id: asText(r.id),
    circleId: asText(r.circle_id),
    name: asText(r.name),
    email: r.email ? asText(r.email) : null,
    role: asText(r.role) as Role,
    notify: Boolean(r.notify),
    createdAt: asDate(r.created_at),
  };
}

export function toMedication(r: Row): Medication {
  return {
    id: asText(r.id),
    circleId: asText(r.circle_id),
    name: asText(r.name),
    dosage: asText(r.dosage),
    instructions: asText(r.instructions),
    times: (r.times as string[] | null) ?? [],
    daysOfWeek: ((r.days_of_week as number[] | null) ?? []).map(Number),
    startDate: asIsoDate(r.start_date),
    endDate: r.end_date ? asIsoDate(r.end_date) : null,
    stock: r.stock === null || r.stock === undefined ? null : Number(r.stock),
    refillThreshold: Number(r.refill_threshold),
    active: Boolean(r.active),
    createdAt: asDate(r.created_at),
  };
}

export function toDoseLog(r: Row): DoseLog {
  return {
    id: asText(r.id),
    medicationId: asText(r.medication_id),
    scheduledAt: asDate(r.scheduled_at),
    status: asText(r.status) as LoggedDoseStatus,
    loggedBy: asText(r.logged_by),
    loggedAt: asDate(r.logged_at),
  };
}

export function toAppointment(r: Row): Appointment {
  return {
    id: asText(r.id),
    circleId: asText(r.circle_id),
    title: asText(r.title),
    doctor: asText(r.doctor),
    location: asText(r.location),
    startsAt: asDate(r.starts_at),
    notes: asText(r.notes),
    createdAt: asDate(r.created_at),
  };
}

export function toActivity(r: Row): Activity {
  return { id: asText(r.id), actor: asText(r.actor), message: asText(r.message), createdAt: asDate(r.created_at) };
}

export function toNotification(r: Row): Notification {
  return {
    id: asText(r.id),
    kind: asText(r.kind) as ReminderKind,
    recipients: (r.recipients as string[] | null) ?? [],
    subject: asText(r.subject),
    delivered: Boolean(r.delivered),
    createdAt: asDate(r.created_at),
  };
}
