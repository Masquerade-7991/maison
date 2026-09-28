import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { sendEmail } from "@/lib/email";

const VERIFY_LINK_TTL = 60 * 60; // seconds

export const roles = ["customer", "admin"] as const;
export type Role = (typeof roles)[number];

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  user: {
    additionalFields: {
      // input: false: sign-up and update-user requests can't set it. Only scripts/set-role.ts and the admin page can.
      role: { type: "string", defaultValue: "customer", input: false },
    },
  },
  emailAndPassword: {
    enabled: true,
    // No session until the address is verified; a duplicate sign-up gets the same generic reply as a new one.
    requireEmailVerification: true,
    minPasswordLength: 8,
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true, // an unverified sign-in attempt re-sends the link
    autoSignInAfterVerification: true,
    expiresIn: VERIFY_LINK_TTL,
    sendVerificationEmail: ({ user, url }) =>
      sendEmail({
        to: user.email,
        subject: "Verify your email for Maison",
        text: `Confirm your Maison account by opening this link within an hour:\n\n${url}`,
        link: url, // shown on the page instead, when email is off in development
      }),
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // An unverified account whose link has expired can never be verified, so it stops reserving the
      // address: a new sign-up for the same email removes it first (sessions and accounts cascade).
      if (ctx.path !== "/sign-up/email" || typeof ctx.body?.email !== "string") return;
      await db
        .delete(user)
        .where(
          and(
            eq(user.email, ctx.body.email.toLowerCase()),
            eq(user.emailVerified, false),
            lt(user.createdAt, new Date(Date.now() - VERIFY_LINK_TTL * 1000)),
          ),
        );
    }),
  },
});

export type Session = typeof auth.$Infer.Session;
