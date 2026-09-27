import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  // Sign-up stays off until email verification is wired up: without it anyone can register
  // (and permanently reserve) an address they don't own. Re-enable with requireEmailVerification
  // + sendVerificationEmail, plus cleanup of unverified users.
  emailAndPassword: { enabled: true, disableSignUp: true },
});
