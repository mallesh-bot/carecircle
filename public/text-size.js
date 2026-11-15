// Applies the saved "large text" preference before first paint (avoids a flash of small text).
try {
  if (localStorage.getItem("cc-text") === "large") document.documentElement.dataset.text = "large";
} catch {
  /* storage unavailable (private mode) — keep the default size */
}
