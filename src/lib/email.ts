// Transactional email through Resend's HTTP API (plain fetch, no SDK).
//
// Email is "off" when RESEND_API_KEY / EMAIL_FROM are missing, in development or on a deployment with
// EMAIL_LINKS_ON_PAGE=true (the internal test site). Nothing is sent: the message is printed to the
// server log, and the sign-up page shows the verification link itself (src/lib/dev-email-actions.ts).
// Anywhere else a missing key throws. Never set EMAIL_LINKS_ON_PAGE on a real launch: it lets anyone
// verify an address they don't own.

export const emailIsOff = () =>
  (process.env.NODE_ENV !== "production" || process.env.EMAIL_LINKS_ON_PAGE === "true") &&
  !(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

export async function sendEmail({ to, subject, text }: { to: string; subject: string; text: string }) {
  if (emailIsOff()) {
    console.info(`[email] to ${to} | ${subject}\n${text}`);
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
