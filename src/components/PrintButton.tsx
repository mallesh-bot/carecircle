"use client";

export function PrintButton() {
  return (
    <button className="btn-ghost no-print text-sm" onClick={() => window.print()}>
      🖨️ Print
    </button>
  );
}
