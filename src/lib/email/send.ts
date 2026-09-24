import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

/**
 * Sends email through Gmail (GMAIL_USER + GMAIL_APP_PASSWORD — an App
 * password from Google Account > Security > 2-Step Verification > App
 * passwords, not the normal password). Without them, emails are printed in
 * the server terminal instead, so everything still works in development.
 */

export function isEmailConfigured(): boolean {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

let transporter: Transporter | undefined;

export interface Email {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendEmail(email: Email): Promise<"sent" | "logged"> {
  if (!isEmailConfigured()) {
    console.log(`\n[email — not sent, GMAIL_USER/GMAIL_APP_PASSWORD not set]\nTo: ${email.to}\nSubject: ${email.subject}\n${email.text}\n`);
    return "logged";
  }
  transporter ??= nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD!.replace(/\s+/g, "") },
  });
  await transporter.sendMail({ from: `"CloseBy" <${process.env.GMAIL_USER}>`, ...email });
  return "sent";
}
