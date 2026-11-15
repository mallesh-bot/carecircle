import type { Language } from "./validation";

/** Short phrases for Elder Mode, spoken and shown in the elder's language. */
interface Phrases {
  greeting: (part: "morning" | "afternoon" | "evening", name: string) => string;
  next: string;
  allDone: string;
  tookIt: string;
  notNow: string;
  readAloud: string;
  sayIt: string;
  listening: string;
  saved: (med: string) => string;
  summary: (count: number, items: string) => string;
  noMeds: string;
}

const en: Phrases = {
  greeting: (p, n) => `Good ${p}, ${n}`,
  next: "Your next medicine",
  allDone: "All done for now. Well done!",
  tookIt: "I took it",
  notNow: "Not now",
  readAloud: "Read my medicines",
  sayIt: "Say “I took it”",
  listening: "Listening…",
  saved: (m) => `Great. ${m} is marked as taken. Your family can see it.`,
  summary: (c, items) => `You have ${c} medicine${c === 1 ? "" : "s"} today. ${items}`,
  noMeds: "You have no medicines scheduled today.",
};

const hi: Phrases = {
  greeting: (p, n) => `${{ morning: "सुप्रभात", afternoon: "नमस्ते", evening: "शुभ संध्या" }[p]}, ${n}`,
  next: "आपकी अगली दवा",
  allDone: "अभी के लिए सब हो गया। शाबाश!",
  tookIt: "मैंने ले ली",
  notNow: "अभी नहीं",
  readAloud: "मेरी दवाइयाँ सुनाओ",
  sayIt: "बोलिए “ले ली”",
  listening: "सुन रहे हैं…",
  saved: (m) => `बहुत अच्छा। ${m} ले ली गई है। आपका परिवार यह देख सकता है।`,
  summary: (c, items) => `आज आपकी ${c} दवाइयाँ हैं। ${items}`,
  noMeds: "आज कोई दवा नहीं है।",
};

const te: Phrases = {
  greeting: (p, n) => `${{ morning: "శుభోదయం", afternoon: "నమస్కారం", evening: "శుభ సాయంత్రం" }[p]}, ${n}`,
  next: "మీ తదుపరి మందు",
  allDone: "ప్రస్తుతానికి అన్నీ అయిపోయాయి. చాలా బాగుంది!",
  tookIt: "వేసుకున్నాను",
  notNow: "ఇప్పుడు కాదు",
  readAloud: "నా మందులు చదివి వినిపించు",
  sayIt: "“వేసుకున్నాను” అని చెప్పండి",
  listening: "వింటున్నాను…",
  saved: (m) => `చాలా మంచిది. ${m} వేసుకున్నట్లు నమోదు చేశాం. మీ కుటుంబం చూడగలదు.`,
  summary: (c, items) => `ఈ రోజు మీకు ${c} మందులు ఉన్నాయి. ${items}`,
  noMeds: "ఈ రోజు మందులు లేవు.",
};

export function phrasesFor(language: Language): Phrases {
  return language === "hi" ? hi : language === "te" ? te : en;
}

/** Whether Elder Mode has native phrases for the language (else English UI, native voice for names). */
export function phraseLanguage(language: Language): Language {
  return language === "hi" || language === "te" ? language : "en";
}

export function partOfDay(hour: number): "morning" | "afternoon" | "evening" {
  return hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
}
