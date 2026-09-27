"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { user } from "@/db/schema";
import { roles, type Role } from "@/lib/auth";
import { assertAdmin } from "@/lib/session";

// Server Actions are public endpoints: the role check lives here, not in the page that renders the form.
export async function setRoleAction(formData: FormData) {
  const session = await assertAdmin();
  const userId = String(formData.get("userId"));
  const role = String(formData.get("role"));
  if (!roles.includes(role as Role)) throw new Error("Unknown role.");
  // No self-demotion, so the last admin can't lock everyone out.
  if (userId === session.user.id) throw new Error("You can't change your own role.");
  await db.update(user).set({ role }).where(eq(user.id, userId));
  revalidatePath("/admin");
}
