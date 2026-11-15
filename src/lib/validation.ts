import { z } from "zod";
import { isValidTimezone } from "./time";
import { ROLES } from "./types";

const trimmed = (max: number) => z.string().trim().max(max);
const required = (label: string, max = 80) => trimmed(max).min(1, `${label} is required`);

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM time");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD date");
const optionalEmail = z
  .string()
  .trim()
  .max(254)
  .transform((v) => (v === "" ? null : v.toLowerCase()))
  .pipe(z.email("Enter a valid email").nullable());

export const passcodeSchema = z
  .string()
  .min(6, "Passcode must be at least 6 characters")
  .max(64, "Passcode is too long");

export const LANGUAGES = {
  en: "English",
  hi: "हिन्दी (Hindi)",
  te: "తెలుగు (Telugu)",
  ta: "தமிழ் (Tamil)",
  kn: "ಕನ್ನಡ (Kannada)",
  bn: "বাংলা (Bengali)",
  mr: "मराठी (Marathi)",
} as const;
export type Language = keyof typeof LANGUAGES;
const language = z.enum(Object.keys(LANGUAGES) as [Language, ...Language[]]);

export const createCircleSchema = z.object({
  elderName: required("Elder's name", 60),
  yourName: required("Your name", 60),
  yourEmail: optionalEmail,
  yourRole: z.enum(ROLES),
  passcode: passcodeSchema,
  timezone: z.string().max(64).refine(isValidTimezone, "Unknown timezone"),
  language,
});

export const joinCircleSchema = z.object({
  code: required("Circle code", 12),
  passcode: z.string().min(1, "Passcode is required").max(64),
  name: required("Your name", 60),
  email: optionalEmail,
  role: z.enum(ROLES),
});

export const medicationSchema = z
  .object({
    name: required("Medicine name"),
    dosage: trimmed(60),
    instructions: trimmed(240),
    times: z.array(timeOfDay).min(1, "Add at least one time").max(8),
    daysOfWeek: z.array(z.coerce.number().int().min(0).max(6)).max(7),
    startDate: isoDate,
    endDate: isoDate.nullable(),
    stock: z.coerce.number().int().min(0).max(10000).nullable(),
    refillThreshold: z.coerce.number().int().min(0).max(1000),
  })
  .refine((m) => !m.endDate || m.endDate >= m.startDate, {
    message: "End date must be after start date",
    path: ["endDate"],
  })
  .transform((m) => ({ ...m, times: [...new Set(m.times)].sort(), daysOfWeek: [...new Set(m.daysOfWeek)].sort() }));
export type MedicationInput = z.infer<typeof medicationSchema>;

export const appointmentSchema = z.object({
  title: required("Title"),
  doctor: trimmed(80),
  location: trimmed(160),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "Pick a date and time"),
  notes: trimmed(500),
});
export type AppointmentInput = z.infer<typeof appointmentSchema>;

export const BLOOD_GROUPS = ["", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

export const emergencySchema = z.object({
  bloodGroup: z.enum(BLOOD_GROUPS, "Choose a blood group"),
  conditions: trimmed(300),
  allergies: trimmed(300),
  emergencyContact: trimmed(160),
  doctorContact: trimmed(160),
  language,
});
export type EmergencyInput = z.infer<typeof emergencySchema>;

export const memberUpdateSchema = z.object({
  email: optionalEmail,
  notify: z.boolean(),
});

export const uuid = z.uuid();

export const doseActionSchema = z.object({
  medicationId: uuid,
  scheduledAt: z.iso.datetime().transform((v) => new Date(v)),
  status: z.enum(["taken", "skipped", "undo"]),
});

/** Medicines proposed by the prescription scanner, re-validated when the family confirms them. */
export const scannedMedicationsSchema = z
  .array(
    z.object({
      name: required("Medicine name"),
      dosage: trimmed(60).default(""),
      instructions: trimmed(240).default(""),
      times: z.array(timeOfDay).max(8).default([]),
      durationDays: z.number().int().min(0).max(3650).nullable().default(null),
    }),
  )
  .min(1)
  .max(20);
