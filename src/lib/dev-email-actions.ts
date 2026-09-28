"use server";

import { and, eq } from "drizzle-orm";
import { createEmailVerificationToken } from "better-auth/api";
import { db } from "@/db";
import { user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { emailIsOff } from "@/lib/email";
import { safeNext } from "@/lib/session";

/**
 * Only while email is off (development, or the test site with EMAIL_LINKS_ON_PAGE): the verification
 * link for an existing unverified account, so the sign-up page can show it instead of "check your
 * inbox". Built the way Better Auth builds it (signed token, no storage), so it works on any serverless
 * instance. Returns null whenever real email is configured: showing the link then would let anyone
 * verify an address they don't own.
 */
export async function getDevVerificationLink(email: string, next?: string): Promise<string | null> {
  if (!emailIsOff() || typeof email !== "string") return null;
  const address = email.trim().toLowerCase();
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
