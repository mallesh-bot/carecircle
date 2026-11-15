/** Browser speech helpers (Web Speech API). Safe to import from client components only. */
import type { Language } from "./validation";

export const SPEECH_LANG: Record<Language, string> = {
  en: "en-IN",
  hi: "hi-IN",
  te: "te-IN",
  ta: "ta-IN",
  kn: "kn-IN",
  bn: "bn-IN",
  mr: "mr-IN",
};

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Reads text aloud, preferring a voice for the requested language. */
export function speak(text: string, language: Language, rate = 0.9): void {
  if (!canSpeak()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const tag = SPEECH_LANG[language];
  utterance.lang = tag;
  utterance.rate = rate;
  const voice = synth.getVoices().find((v) => v.lang === tag) ?? synth.getVoices().find((v) => v.lang.startsWith(tag.slice(0, 2)));
  if (voice) utterance.voice = voice;
  synth.speak(utterance);
}

export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}

/** Phrases (in several Indian languages) that mean "I took my medicine". */
const TAKEN_PATTERNS = [
  /\b(taken|took|take it|done|finished|had it|yes)\b/i,
  /(ले ली|ले लिया|खा ली|खा लिया|हाँ|हां)/,
  /(తీసుకున్నా|వేసుకున్నా|అవును)/,
  /(எடுத்துக்கொண்டேன்|சாப்பிட்டேன்|ஆம்)/,
  /(ತೆಗೆದುಕೊಂಡೆ|ಹೌದು)/,
  /(খেয়েছি|হ্যাঁ)/,
  /(घेतली|घेतले|हो)/,
];

export function meansTaken(transcript: string): boolean {
  return TAKEN_PATTERNS.some((p) => p.test(transcript));
}

type RecognitionCtor = new () => {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

export function getRecognition(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
