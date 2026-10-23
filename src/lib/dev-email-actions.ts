"use server";

import { and, eq } from "drizzle-orm";
import { createEmailVerificationToken } from "better-auth/api";
import { db } from "@/db";
import { user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { emailIsOff } from "@/lib/email";
import { isSuppressed } from "@/lib/emails/rules";
import { safeNext } from "@/lib/session";

/**
 * The verification link for an existing unverified account, so the sign-up page can show it instead of
 * "check your inbox": only while email is off (development, the e2e server, or the test site with
 * EMAIL_LINKS_ON_PAGE), or for example.com test addresses, which nobody owns and which are never mailed
 * (src/lib/emails/rules.ts). Built the way Better Auth builds it (signed token, no storage), so it works on
 * any serverless instance. For a real address with email on it returns null: showing the link would let
 * anyone verify an address they don't own.
 */
export async function getDevVerificationLink(email: string, next?: string): Promise<string | null> {
  if (typeof email !== "string") return null;
  const address = email.trim().toLowerCase();
  if (!emailIsOff() && !isSuppressed(address)) return null;
  const [found] = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.email, address), eq(user.emailVerified, false)));
  if (!found) return null;
  const ctx = await auth.$context;
  const token = await createEmailVerificationToken(ctx.secret, address, undefined, ctx.options.emailVerification?.expiresIn);
  const callbackURL = encodeURIComponent(`/sign-in?next=${encodeURIComponent(safeNext(next))}`);
  return `${ctx.baseURL}/verify-email?token=${token}&callbackURL=${callbackURL}`;
}
