"use server";

import { devOutbox, emailIsOffInDev } from "@/lib/email";

const LINK_TTL_MS = 60 * 60 * 1000; // matches emailVerification.expiresIn in src/lib/auth.ts

/**
 * Development only: the verification link that would have been emailed to this address, so the
 * sign-up page can show it instead of "check your inbox". Returns null whenever real email is
 * configured or the app runs in production. Showing the link there would let anyone verify an
 * address they don't own.
 */
export async function getDevVerificationLink(email: string): Promise<string | null> {
  if (!emailIsOffInDev() || typeof email !== "string") return null;
  const entry = devOutbox.get(email.trim().toLowerCase());
  return entry && Date.now() - entry.at < LINK_TTL_MS ? entry.url : null;
}
