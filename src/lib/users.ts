// Admin-only reads of the auth tables. Every function checks the role itself rather than trusting its caller.
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { assertAdmin } from "@/lib/session";

// ponytail: unpaginated; add limit/offset once there are more than a few hundred accounts.
export async function listUsers() {
  await assertAdmin();
  return db
    .select({ id: user.id, name: user.name, email: user.email, emailVerified: user.emailVerified, role: user.role, createdAt: user.createdAt })
    .from(user)
    .orderBy(desc(user.createdAt));
}
