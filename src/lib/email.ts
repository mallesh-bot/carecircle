import "server-only";
import type { Transporter } from "nodemailer";
import { env } from "./env";

export interface EmailMessage {
  to: string[];
  subject: string;
  text: string;
}

export function emailEnabled(): boolean {
  const e = env();
  return Boolean(e.GMAIL_USER && e.GMAIL_APP_PASSWORD);
}

let transport: Promise<Transporter> | undefined;

/** One pooled SMTP connection per server instance instead of one per email. */
function getTransport(): Promise<Transporter> {
  transport ??= import("nodemailer").then((nodemailer) => {
    const e = env();
    return nodemailer.createTransport({ service: "gmail", pool: true, auth: { user: e.GMAIL_USER, pass: e.GMAIL_APP_PASSWORD } });
  });
  return transport;
}

/** Strips CR/LF so user-provided text (e.g. a medicine name) can't inject email headers. */
const headerSafe = (value: string) => value.replace(/[\r\n]+/g, " ").slice(0, 200);

/**
 * Sends an email through Gmail SMTP when configured. Returns false (and the
 * reminder still shows in the in-app notification log) when email is off.
 */
export async function sendEmail(msg: EmailMessage): Promise<boolean> {
  if (!emailEnabled() || msg.to.length === 0) return false;
  await (await getTransport()).sendMail({
    from: `CareCircle <${env().GMAIL_USER}>`,
    bcc: msg.to, // members don't see each other's addresses
    subject: headerSafe(msg.subject),
    text: `${msg.text}\n\n— CareCircle · caring together`,
  });
  return true;
}
