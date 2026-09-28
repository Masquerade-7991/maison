"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { session as sessions, user } from "@/db/schema";
import { roles, type Role } from "@/lib/auth";
import { assertAdmin } from "@/lib/session";

export type RoleFormState = { error?: string; saved?: boolean } | null;

// Server Actions are public endpoints: the role check lives here, not in the page that renders the form.
export async function setRoleAction(_prev: RoleFormState, formData: FormData): Promise<RoleFormState> {
  const session = await assertAdmin();
  const userId = formData.get("userId");
  const role = formData.get("role");
  if (typeof userId !== "string" || !userId) return { error: "This form is out of date. Reload the page and try again." };
  if (typeof role !== "string" || !roles.includes(role as Role)) return { error: "Choose a role from the list." };
  // No self-demotion, so the last admin can't lock everyone out.
  if (userId === session.user.id) return { error: "You can't change your own role." };
  // One batch (a single transaction): a changed role signs the account out everywhere, so a removed admin
  // loses access at once instead of keeping a live session. Saving the same role leaves sessions alone.
  const [, updated] = await db.batch([
    db.delete(sessions).where(
      inArray(sessions.userId, db.select({ id: user.id }).from(user).where(and(eq(user.id, userId), ne(user.role, role)))),
    ),
    db.update(user).set({ role }).where(eq(user.id, userId)).returning({ id: user.id }),
  ]);
  if (updated.length === 0) return { error: "That account no longer exists. Reload the page." };
  revalidatePath("/admin/accounts");
  return { saved: true };
}
