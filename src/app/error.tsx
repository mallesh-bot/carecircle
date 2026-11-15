"use client";

import { useEffect } from "react";

/** Friendly fallback for unexpected server or rendering errors. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("CareCircle error", error.digest ?? error.message);
  }, [error]);

  return (
    <main id="main" className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-3xl font-bold">Something went wrong</h1>
      <p className="text-[var(--muted)]">Nothing you entered was lost. Please try again — if it keeps happening, reload the page.</p>
      <button type="button" className="btn-primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
