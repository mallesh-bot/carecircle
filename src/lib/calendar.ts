import type { Appointment } from "./types";

const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** "Add to Google Calendar" link for an appointment (assumes one hour). */
export function googleCalendarUrl(appt: Pick<Appointment, "title" | "doctor" | "location" | "notes" | "startsAt">, elderName: string): string {
  const end = new Date(appt.startsAt.getTime() + 60 * 60 * 1000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${appt.title} — ${elderName}`,
    dates: `${fmt(appt.startsAt)}/${fmt(end)}`,
    details: [appt.doctor && `Doctor: ${appt.doctor}`, appt.notes, "Added from CareCircle"].filter(Boolean).join("\n"),
    location: appt.location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
