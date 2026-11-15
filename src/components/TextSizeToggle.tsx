"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "cc-text";
const listeners = new Set<() => void>();

const isLarge = () => document.documentElement.dataset.text === "large";

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setLarge(large: boolean) {
  if (large) document.documentElement.dataset.text = "large";
  else delete document.documentElement.dataset.text;
  try {
    localStorage.setItem(STORAGE_KEY, large ? "large" : "normal");
  } catch {
    /* storage unavailable — the choice still applies to this page */
  }
  listeners.forEach((l) => l());
}

/** Toggles a larger base font size; remembered per device (applied before paint by /text-size.js). */
export function TextSizeToggle() {
  const large = useSyncExternalStore(subscribe, isLarge, () => false);
  return (
    <button type="button" className="btn-ghost text-sm" aria-pressed={large} onClick={() => setLarge(!large)}>
      <span aria-hidden>A</span>
      <span aria-hidden className="text-lg">
        A
      </span>
      <span className="sr-only">Larger text</span>
    </button>
  );
}
