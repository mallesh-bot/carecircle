import "server-only";

export interface EmailMessage {
  to: string[];
  subject: string;
  text: string;
}

export function emailEnabled(): boolean {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

/**
 * Sends an email through Gmail SMTP when configured. Returns false (and the
 * reminder still shows in the in-app notification log) when email is off.
 */
export async function sendEmail(msg: EmailMessage): Promise<boolean> {
  if (!emailEnabled() || msg.to.length === 0) return false;
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
  await transport.sendMail({
    from: `CareCircle <${process.env.GMAIL_USER}>`,
    bcc: msg.to, // members don't see each other's addresses
    subject: msg.subject,
    text: `${msg.text}\n\n— CareCircle · caring together`,
  });
  return true;
}
