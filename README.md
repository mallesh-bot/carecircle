# ◎ CareCircle

**Caring together for the ones who cared for us.**

CareCircle is a shared, secure care space where an elderly person, their caretakers and their family manage medicines, doctor appointments and reminders together. The elder stays at the centre of their own healthcare decisions.

> Built for **PromptWars × Catalyst** (MnM · Hack2skill · Google for Developers) for the challenge *Elderly Care & Medication Management Platform*.

**Live demo:** https://carecircle-brown-seven.vercel.app (click **▶ Try the live demo**, no sign-up needed) · **Stack:** Next.js 15 · React 19 · TypeScript · PostgreSQL (Neon) · Google Gemini · Vercel

---

## The problem

In many families the elder lives in one city, a son in another and a daughter abroad, with a part-time caretaker in between. Prescriptions sit on paper. Nobody knows whether the evening BP tablet was taken, and nobody notices that the strip is almost empty. Most reminder apps assume one young, tech-confident user with a smartphone, which describes nobody in this picture.

## What CareCircle does

| Need from the brief | How CareCircle solves it |
| --- | --- |
| Shared ecosystem for elder, caretakers and family | A **care circle** that people join with a circle code and a **passcode**. The passcode is salted and hashed with scrypt, wrong attempts are rate-limited, and sessions use httpOnly cookies |
| View, add, edit and manage medication schedules | Medicines with dose, instructions, several times a day, days of the week, start and end dates, pause/resume and stock tracking |
| Track adherence | Today's schedule shows each dose as *upcoming → due → taken / skipped / missed*. A **7-day adherence ring**, daily bars and a per-medicine breakdown come from the logs |
| Doctor appointments | Add, edit and cancel appointments, with one-tap **Add to Google Calendar** |
| Proactive email reminders | Reminders **before each dose** and **24 h before appointments**. **Missed-dose escalation** goes to family and caretakers, and **refill alerts** fire when stock runs low. Reminders are idempotent and appear in an in-app log |
| More than a reminder app | Everything below 👇 |

### What makes it different

- 📷 **Gemini prescription scan.** Take a photo of a handwritten prescription and Gemini reads it, including Indian shorthand such as `1-0-1`, `BD`, `TDS`, `HS` and `SOS`, then proposes a schedule. A family member **reviews and confirms** before anything is saved, so the AI never changes a schedule on its own.
- 🗣️ **Voice-first Elder Mode.** One huge "✓ I took it" button. The day's medicines are **read aloud** in the elder's language, and the elder can simply **say** "I took it", "मैंने ले ली" or "వేసుకున్నాను". This uses the browser's Web Speech API, so there is nothing to install.
- 💬 **"Explain simply" (Gemini).** Explains each medicine in warm, plain words in the elder's chosen language (English, Hindi, Telugu, Tamil, Kannada, Bengali or Marathi), with a read-aloud button.
- 📝 **AI weekly care digest (Gemini).** A kind, non-medical summary for busy family members. It celebrates the good days, gently points out patterns such as "evening doses are often missed" and suggests practical help.
- 🆘 **Emergency QR card.** A printable, read-only card with current medicines, allergies, blood group and contacts. A paramedic scans it, with no login needed, and it is never indexed by search engines.
- 👪 **Transparent activity feed.** Shows who logged which dose and who changed what. This builds trust inside the family and keeps the elder informed.
- ♿ **Accessible by design.** Large tap targets (44 px or more), a large-text toggle, skip link, semantic landmarks, labelled controls, `aria-live` status messages, visible focus rings, reduced-motion support and high-contrast status colours.

## Architecture

```
src/
  app/
    page.tsx              Landing + create/join circle
    circle/page.tsx       Family dashboard (server component)
    circle/elder/         Voice-first Elder Mode
    card/[token]/         Public emergency card (QR target)
    actions.ts            Server Actions: every mutation, validated with zod
    api/cron/reminders/   Idempotent reminder job (Vercel Cron + GitHub Actions)
  lib/
    schedule.ts           Pure dose-slot, status and adherence logic
    reminders.ts          Pure reminder planner (what to send, to whom)
    reminder-runner.ts    Delivery with dedupe keys (safe to run any number of times)
    gemini.ts             Gemini REST client with structured JSON output and zod validation
    repo.ts               Parameterised SQL; every query is scoped by circle_id
    crypto.ts             scrypt passcodes, random tokens, SHA-256 session hashes
    time.ts               Timezone maths using Intl only (no date library)
    db.ts                 Postgres (Neon) in production, embedded PGlite with zero setup locally
tests/                    Vitest unit + integration tests (embedded Postgres)
```

**Key design decisions**

- **Doses are computed, not stored.** Schedules generate dose slots on the fly in the circle's timezone, and only *outcomes* (taken or skipped) are stored. "Missed" is derived. This keeps the data small and makes adherence maths exact, including across DST changes.
- **Reminder planning is a pure function** of `(circle data, now)`, which makes it fully unit-tested. Delivery claims a unique dedupe key before sending, so cron retries, overlapping runs and page-load triggers never double-email anyone.
- **Zero-config local development.** With no `DATABASE_URL`, the app runs on an embedded Postgres (PGlite) using the same SQL as production.

## Security

- Passcodes are hashed with **scrypt** and a per-circle salt and compared in constant time. Plaintext is never stored.
- Failed joins are **throttled**: 5 wrong attempts per circle code in 15 minutes locks that code. Unknown codes and wrong passcodes return the same error, so codes can't be probed.
- Sessions are 256-bit random tokens in **httpOnly, SameSite=Lax, Secure** cookies, and only their SHA-256 is stored in the database.
- **Tenant isolation:** every read and write is scoped by `circle_id`, and this is covered by tests.
- All input is validated with **zod**, and all SQL is **parameterised**.
- A strict **CSP**, `X-Frame-Options: DENY`, `nosniff`, HSTS, a Referrer-Policy and a Permissions-Policy are set on every response.
- The Gemini key is sent in a header (not the URL) and stays server-side. AI output is schema-validated before use.
- Uploaded images are type- and size-checked and never stored.

## Running locally

```bash
npm install
npm run dev          # http://localhost:3000, uses an embedded database automatically
npm test             # 50 unit and integration tests (embedded Postgres, mocked Gemini)
```

> Node 20–24. On Node 25, run dev with `NODE_OPTIONS=--no-experimental-webstorage`.

### Environment variables (all optional)

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string (Neon on Vercel). Embedded DB if unset |
| `GEMINI_API_KEY` | Turns on prescription scan, "Explain simply" and the weekly digest ([get a key](https://aistudio.google.com/apikey)) |
| `GEMINI_MODEL` | Defaults to `gemini-flash-latest` |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Sends reminder emails through Gmail SMTP |
| `CRON_SECRET` | If set, the reminder endpoint requires `Authorization: Bearer <secret>` |
| `APP_URL` | Public URL used in emails and on the QR card |

## Responsible AI

CareCircle supports caregiving. It does not give medical advice. Gemini only **reads** prescriptions, which a human confirms, and **explains** medicines in general terms. Every AI surface carries a "follow your doctor" note, and the prompts forbid changing doses.

---

Made with care for **PromptWars × Catalyst**. Thanks to **MnM (Makers Need More)**, **Hack2skill** and **Google for Developers**, and to **Google Gemini** for the AI.
