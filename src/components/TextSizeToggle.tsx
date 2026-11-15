"use client";

import { useEffect, useState } from "react";

/** Toggles a larger base font size; remembered per device. */
export function TextSizeToggle() {
  const [large, setLarge] = useState(false);
  useEffect(() => setLarge(document.documentElement.dataset.text === "large"), []);
  const toggle = () => {
    const next = !large;
    setLarge(next);
    if (next) document.documentElement.dataset.text = "large";
    else delete document.documentElement.dataset.text;
    try {
      localStorage.setItem("cc-text", next ? "large" : "normal");
    } catch {}
  };
  return (
    <button className="btn-ghost text-sm" aria-pressed={large} onClick={toggle}>
      <span aria-hidden>A</span>
      <span aria-hidden className="text-lg">A</span>
      <span className="sr-only">Larger text</span>
    </button>
  );
}
