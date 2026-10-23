// Transactional email over SMTP from the shop's own mailbox (a Gmail account with an app password): no
// email service to sign up for. SMTP_URL holds the connection, e.g.
//   smtps://maison.shop%40gmail.com:APP_PASSWORD@smtp.gmail.com:465
// and EMAIL_FROM the sender, e.g. "Maison <maison.shop@gmail.com>". Replies go to CONTACT_TO when set.
//
// Email is "off" (the message is printed to the server log, nothing is sent) when EMAIL_OFF=true (the e2e
// server), or when SMTP_URL is missing in development or on a deployment with EMAIL_LINKS_ON_PAGE=true
// (the sign-up page then shows the verification link itself, src/lib/dev-email-actions.ts). Test addresses
// (example.com) are never mailed. A temporary refusal (Gmail's "server busy", a dropped connection) is
// retried twice. Every email is recorded in email_log. sendEmail never throws: an email must not fail a
// payment webhook or an admin save that has already happened.
import nodemailer, { type Transporter } from "nodemailer";
import { db } from "@/db";
import { emailLog } from "@/db/schema";
import { isSuppressed, isTransient } from "@/lib/emails/rules";

export const emailIsOff = () =>
  process.env.EMAIL_OFF === "true" ||
  (!process.env.SMTP_URL && (process.env.NODE_ENV !== "production" || process.env.EMAIL_LINKS_ON_PAGE === "true"));

let transport: Transporter | null = null;
const smtp = () => (transport ??= nodemailer.createTransport(process.env.SMTP_URL!));

export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** What it is (order.shipped, account.verify…) and what it's about (an order, product or user id). */
  kind: string;
  ref?: string;
  headers?: Record<string, string>;
  /** Defaults to CONTACT_TO, so customers' replies reach client services. */
  replyTo?: string;
};

export type SendResult = "sent" | "failed" | "logged";

const RETRY_DELAYS = [2_000, 5_000]; // for isTransient errors, e.g. Gmail's "server busy"

export async function sendEmail(mail: OutgoingEmail): Promise<SendResult> {
  let status: SendResult;
  let error: string | null = null;
  if (emailIsOff() || isSuppressed(mail.to)) {
    console.info(`[email] ${mail.kind} to ${mail.to} | ${mail.subject}\n${mail.text}`);
    status = "logged";
  } else {
    status = "failed";
    for (let attempt = 1; attempt <= RETRY_DELAYS.length + 1; attempt++) {
      try {
        if (!process.env.SMTP_URL || !process.env.EMAIL_FROM) throw new Error("SMTP_URL and EMAIL_FROM must be set to send email.");
        await smtp().sendMail({
          from: process.env.EMAIL_FROM,
          replyTo: mail.replyTo ?? (process.env.CONTACT_TO || undefined),
          to: mail.to,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          headers: mail.headers,
        });
        status = "sent";
        error = null;
        break;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        const retry = attempt <= RETRY_DELAYS.length && isTransient(e);
        console.error(`[email] ${mail.kind} to ${mail.to} failed (attempt ${attempt}${retry ? ", retrying" : ""}):`, error);
        if (!retry) break;
        await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt - 1]));
      }
    }
  }
  await db
    .insert(emailLog)
    .values({ kind: mail.kind, recipient: mail.to, ref: mail.ref ?? null, status, error })
    .catch((e) => console.error("[email] could not record the email:", e));
  return status;
}

/** The site's absolute origin, for links in emails. */
export const siteUrl = () => (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
