// Transactional email through Resend's HTTP API (plain fetch, no SDK).
//
// Development without RESEND_API_KEY / EMAIL_FROM: nothing is sent. The message is printed to the
// server console, and the verification link is also kept in an in-memory outbox that the sign-up
// page shows directly (src/lib/dev-email-actions.ts). Production never takes this path: it throws.

export const emailIsOffInDev = () =>
  process.env.NODE_ENV !== "production" && !(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

type Outbox = Map<string, { url: string; at: number }>;
// On globalThis so the auth route handler and the Server Action share it even if bundled separately.
const g = globalThis as { __maisonDevOutbox?: Outbox };
export const devOutbox: Outbox = (g.__maisonDevOutbox ??= new Map());

export async function sendEmail({ to, subject, text, link }: { to: string; subject: string; text: string; link?: string }) {
  if (emailIsOffInDev()) {
    console.info(`[email] to ${to} | ${subject}\n${text}`);
    if (link) devOutbox.set(to.toLowerCase(), { url: link, at: Date.now() });
    return;
  }
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) throw new Error("RESEND_API_KEY and EMAIL_FROM must be set to send email.");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, text }),
  });
  if (!res.ok) throw new Error(`Resend responded ${res.status}: ${await res.text()}`);
}
