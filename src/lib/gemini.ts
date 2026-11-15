import "server-only";
import { z } from "zod";
import { env } from "./env";
import { LANGUAGES, type Language } from "./validation";

/**
 * Thin client for the Google Gemini API (generativelanguage.googleapis.com).
 * Uses structured JSON output so responses are validated before use.
 */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export function geminiEnabled(): boolean {
  return Boolean(env().GEMINI_API_KEY);
}

export class GeminiError extends Error {}

type Part = { text: string } | { inline_data: { mime_type: string; data: string } };

const SYSTEM_INSTRUCTION =
  "You support family caregivers of elderly people. You never diagnose, never recommend or change doses, " +
  "and always defer to the prescribing doctor. Answer only with JSON matching the schema.";

const TIMEOUT_MS = 25_000;

async function generateJson<S extends z.ZodType>(parts: Part[], responseSchema: object, validator: S): Promise<z.output<S>> {
  const { GEMINI_API_KEY: key, GEMINI_MODEL } = env();
  if (!key) throw new GeminiError("Gemini is not configured. Add GEMINI_API_KEY to enable AI features.");
  const model = GEMINI_MODEL ?? "gemini-flash-latest";

  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      // The key travels in a header, never in the URL (URLs end up in logs).
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json", responseSchema },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new GeminiError("Couldn't reach Gemini. Please check the connection and try again.");
  }
  if (!res.ok) {
    throw new GeminiError(res.status === 429 ? "Gemini is busy right now. Please try again in a minute." : `Gemini request failed (${res.status}).`);
  }
  const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new GeminiError("Gemini returned an unreadable answer. Please try again.");
  }
  const parsed = validator.safeParse(json);
  if (!parsed.success) throw new GeminiError("Gemini returned an unexpected answer. Please try again.");
  return parsed.data;
}

// ---------------------------------------------------------------- prescription scan

const extractedMedication = z.object({
  name: z.string().min(1).max(80),
  dosage: z.string().max(60).default(""),
  instructions: z.string().max(240).default(""),
  times: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).max(8).default([]),
  durationDays: z.number().int().min(0).max(3650).nullable().default(null),
});
export type ExtractedMedication = z.infer<typeof extractedMedication>;
const extractionResult = z.object({ medications: z.array(extractedMedication).max(20), notes: z.string().max(500).default("") });

const extractionSchema = {
  type: "OBJECT",
  properties: {
    medications: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING", description: "Medicine name with strength, e.g. 'Metformin 500mg'" },
          dosage: { type: "STRING", description: "Amount per dose, e.g. '1 tablet'" },
          instructions: { type: "STRING", description: "e.g. 'After food'" },
          times: { type: "ARRAY", items: { type: "STRING" }, description: "24h HH:MM times of day" },
          durationDays: { type: "INTEGER", nullable: true, description: "Course length in days, null if ongoing" },
        },
        required: ["name", "times"],
      },
    },
    notes: { type: "STRING", description: "Anything unclear that a caregiver should double-check" },
  },
  required: ["medications"],
};

export async function extractPrescription(imageBase64: string, mimeType: string) {
  return generateJson(
    [
      {
        text:
          "You are helping a family digitise an elderly person's prescription. Read the image and list every medicine. " +
          "Convert Indian dosing shorthand to times of day: 1-0-1 means morning and night; use 08:00 for morning, " +
          "14:00 for afternoon and 21:00 for night unless a time is written. OD = once daily (08:00), BD = twice daily, " +
          "TDS = three times daily, HS = at bedtime (21:30), SOS = only when needed (empty times). " +
          "Never invent medicines; if handwriting is unclear say so in notes.",
      },
      { inline_data: { mime_type: mimeType, data: imageBase64 } },
    ],
    extractionSchema,
    extractionResult,
  );
}

// ---------------------------------------------------------------- plain-language explainer

const explanation = z.object({
  whatItIsFor: z.string().max(400),
  howToTake: z.string().max(400),
  commonSideEffects: z.array(z.string().max(120)).max(6),
  callDoctorIf: z.array(z.string().max(160)).max(5),
});
export type MedicineExplanation = z.infer<typeof explanation>;

const explanationSchema = {
  type: "OBJECT",
  properties: {
    whatItIsFor: { type: "STRING" },
    howToTake: { type: "STRING" },
    commonSideEffects: { type: "ARRAY", items: { type: "STRING" } },
    callDoctorIf: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["whatItIsFor", "howToTake", "commonSideEffects", "callDoctorIf"],
};

export async function explainMedicine(med: { name: string; dosage: string; instructions: string }, language: Language) {
  return generateJson(
    [
      {
        text:
          `Explain this medicine to an elderly person in very simple, warm, reassuring words, in ${LANGUAGES[language]}. ` +
          "Short sentences, no jargon, no brand promotion. Do not change the prescribed dose; general information only.\n" +
          `Medicine: ${med.name}\nDose: ${med.dosage || "as prescribed"}\nInstructions: ${med.instructions || "none"}`,
      },
    ],
    explanationSchema,
    explanation,
  );
}

// ---------------------------------------------------------------- weekly care digest

const digest = z.object({ headline: z.string().max(160), summary: z.string().max(700), suggestions: z.array(z.string().max(200)).max(4) });
export type CareDigest = z.infer<typeof digest>;

export async function careDigest(facts: string, language: Language) {
  return generateJson(
    [
      {
        text:
          `Write a short, kind weekly care update for the family of an elderly person, in ${LANGUAGES[language]}. ` +
          "Celebrate what went well, gently flag patterns (e.g. evening doses often missed) and suggest practical, " +
          "non-medical ideas (alarms, pill boxes, a call at that time). Never give medical advice or change doses.\n\n" +
          facts,
      },
    ],
    {
      type: "OBJECT",
      properties: {
        headline: { type: "STRING" },
        summary: { type: "STRING" },
        suggestions: { type: "ARRAY", items: { type: "STRING" } },
      },
      required: ["headline", "summary", "suggestions"],
    },
    digest,
  );
}
