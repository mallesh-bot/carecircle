/**
 * Creates a realistic, fully populated demo circle so judges and first-time
 * visitors can explore every feature in one click. Each visitor gets their own
 * isolated circle, so demos never collide.
 */
import { hashPasscode, randomToken } from "./crypto";
import type { Db } from "./db";
import * as repo from "./repo";
import { slotsForDate } from "./schedule";
import { addDays, localDate, TIME, zonedTimeToUtc } from "./time";
import { medicationSchema } from "./validation";

const TZ = "Asia/Kolkata";

const MEDS = [
  { name: "Metformin 500mg", dosage: "1 tablet", instructions: "After breakfast and dinner", times: ["08:00", "20:00"], stock: 24 },
  { name: "Amlodipine 5mg", dosage: "1 tablet", instructions: "For blood pressure, morning", times: ["09:00"], stock: 4 },
  { name: "Atorvastatin 10mg", dosage: "1 tablet", instructions: "At bedtime", times: ["21:30"], stock: 30 },
  { name: "Vitamin D3 60K", dosage: "1 sachet in milk", instructions: "Once a week, Sundays", times: ["10:00"], stock: 3, daysOfWeek: [0] },
];

/** Which past doses the demo elder "missed": evening doses slip more often — a pattern the AI digest can spot. */
function demoOutcome(dayOffset: number, medIndex: number, time: string): "taken" | "skipped" | null {
  if (medIndex === 0 && time === "20:00" && [-6, -4, -1].includes(dayOffset)) return null;
  if (medIndex === 2 && dayOffset === -3) return null;
  if (medIndex === 1 && dayOffset === -5) return "skipped";
  return "taken";
}

export async function seedDemoCircle(db: Db, visitorName: string, now = new Date()) {
  const today = localDate(now, TZ);
  const circle = await repo.createCircle(db, {
    elderName: "Lakshmi Amma",
    timezone: TZ,
    language: "en",
    passcodeHash: await hashPasscode(randomToken(12)),
  });
  await repo.updateEmergencyInfo(db, circle.id, {
    bloodGroup: "B+",
    conditions: "Type 2 diabetes, hypertension, high cholesterol",
    allergies: "Penicillin, sulfa drugs",
    emergencyContact: "Ravi (son) +91 98765 43210",
    doctorContact: "Dr. Anjali Sharma, Apollo Clinic +91 40 2345 6789",
    language: "en",
  });

  await repo.addMember(db, circle.id, { name: "Lakshmi Amma", email: null, role: "elder" });
  await repo.addMember(db, circle.id, { name: "Ravi (son, Bengaluru)", email: null, role: "family" });
  await repo.addMember(db, circle.id, { name: "Meena (caretaker)", email: null, role: "caretaker" });
  const visitor = await repo.addMember(db, circle.id, { name: visitorName, email: null, role: "family" });

  const startDate = addDays(today, -8);
  const meds = [];
  for (const m of MEDS) {
    const input = medicationSchema.parse({
      name: m.name,
      dosage: m.dosage,
      instructions: m.instructions,
      times: m.times,
      daysOfWeek: m.daysOfWeek ?? [],
      startDate,
      endDate: null,
      stock: m.stock,
      refillThreshold: 5,
    });
    meds.push(await repo.createMedication(db, circle.id, input));
  }
  await db.query(`UPDATE medications SET created_at = $2 WHERE circle_id = $1`, [circle.id, zonedTimeToUtc(startDate, "00:00", TZ)]);

  // Seven days of history, plus today's doses that are already well past — inserted in one statement.
  const loggers = ["Meena (caretaker)", "Lakshmi Amma", "Ravi (son, Bengaluru)"];
  const history = { medIds: [] as string[], times: [] as Date[], statuses: [] as string[], by: [] as string[], at: [] as Date[] };
  for (let offset = -7; offset <= 0; offset++) {
    const date = addDays(today, offset);
    meds.forEach((med, i) => {
      for (const time of med.times) {
        if (!slotsForDate({ ...med, createdAt: new Date(0) }, date, TZ).length) continue;
        const at = zonedTimeToUtc(date, time, TZ);
        if (at.getTime() > now.getTime() - 90 * TIME.MINUTE) continue; // leave recent/upcoming doses for the visitor
        const outcome = demoOutcome(offset, i, time);
        if (!outcome) continue;
        history.medIds.push(med.id);
        history.times.push(at);
        history.statuses.push(outcome);
        history.by.push(loggers[(offset + i + 7) % loggers.length]);
        history.at.push(new Date(at.getTime() + 12 * TIME.MINUTE));
      }
    });
  }
  await db.query(
    `INSERT INTO dose_logs (medication_id, scheduled_at, status, logged_by, logged_at)
     SELECT * FROM unnest($1::uuid[], $2::timestamptz[], $3::text[], $4::text[], $5::timestamptz[])`,
    [history.medIds, history.times, history.statuses, history.by, history.at],
  );

  const tomorrow = addDays(today, 1);
  await repo.createAppointment(
    db,
    circle.id,
    { title: "Diabetes review + HbA1c", doctor: "Dr. Anjali Sharma", location: "Apollo Clinic, Jubilee Hills", startsAt: "", notes: "Fasting blood test — no breakfast before the visit" },
    zonedTimeToUtc(tomorrow, "10:30", TZ),
  );
  await repo.createAppointment(
    db,
    circle.id,
    { title: "Eye check-up", doctor: "Dr. K. Rao", location: "LV Prasad Eye Institute", startsAt: "", notes: "Bring current spectacles" },
    zonedTimeToUtc(addDays(today, 6), "16:00", TZ),
  );

  const feed = [
    ["Ravi (son, Bengaluru)", "created Lakshmi Amma's Care Circle"],
    ["Ravi (son, Bengaluru)", "added 4 medicine(s) from a scanned prescription"],
    ["Meena (caretaker)", "joined the circle as caretaker"],
    ["Meena (caretaker)", "updated the health profile"],
    [visitorName, "joined the circle as family"],
  ];
  // Spread over the past week so the feed reads like a real history.
  await db.query(
    `INSERT INTO activity (circle_id, actor, message, created_at)
     SELECT $1, actor, message, now() - make_interval(hours => ($4::int - ord::int) * 30)
     FROM unnest($2::text[], $3::text[]) WITH ORDINALITY AS f(actor, message, ord)`,
    [circle.id, feed.map((f) => f[0]), feed.map((f) => f[1]), feed.length],
  );

  return { circle, visitor };
}
