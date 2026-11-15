export function SiteFooter() {
  return (
    <footer className="no-print mt-16 border-t border-[var(--line)] bg-white/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between">
        <p>
          <strong className="text-[var(--ink)]">CareCircle</strong> — caring together for the ones who cared for us.
        </p>
        <p>
          AI by <span className="font-semibold text-[var(--ink)]">Google Gemini</span> · Built for{" "}
          <span className="font-semibold text-[var(--ink)]">PromptWars × Catalyst</span> by MnM, Hack2skill &amp; Google for
          Developers
        </p>
      </div>
      <p className="mx-auto max-w-6xl px-4 pb-6 text-xs text-[var(--muted)]">
        CareCircle supports caregiving and is not a substitute for professional medical advice. Always follow your doctor&apos;s
        instructions.
      </p>
    </footer>
  );
}
