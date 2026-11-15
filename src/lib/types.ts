export const ROLES = ["elder", "caretaker", "family"] as const;
export type Role = (typeof ROLES)[number];

export const DOSE_STATUSES = ["taken", "skipped"] as const;
export type LoggedDoseStatus = (typeof DOSE_STATUSES)[number];
export type DoseStatus = LoggedDoseStatus | "missed" | "due" | "upcoming";

export interface Circle {
  id: string;
  code: string;
  name: string;
  elderName: string;
  timezone: string;
  createdAt: Date;
}

export interface Member {
  id: string;
  circleId: string;
  name: string;
  email: string | null;
  role: Role;
  notify: boolean;
  createdAt: Date;
}

export interface Medication {
  id: string;
  circleId: string;
  name: string;
  dosage: string;
  instructions: string;
  /** Local "HH:MM" times in the circle's timezone. */
  times: string[];
  /** 0 = Sunday … 6 = Saturday. Empty means every day. */
  daysOfWeek: number[];
  startDate: string;
  endDate: string | null;
  stock: number | null;
  refillThreshold: number;
  active: boolean;
  createdAt: Date;
}

export interface DoseLog {
  id: string;
  medicationId: string;
  scheduledAt: Date;
  status: LoggedDoseStatus;
  loggedBy: string;
  loggedAt: Date;
}

export interface Appointment {
  id: string;
  circleId: string;
  title: string;
  doctor: string;
  location: string;
  startsAt: Date;
  notes: string;
  createdAt: Date;
}

export interface Activity {
  id: string;
  actor: string;
  message: string;
  createdAt: Date;
}

export interface Notification {
  id: string;
  kind: ReminderKind;
  recipients: string[];
  subject: string;
  delivered: boolean;
  createdAt: Date;
}

export type ReminderKind = "upcoming_dose" | "missed_dose" | "appointment" | "refill";
