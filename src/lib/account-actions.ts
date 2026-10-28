"use server";

// Account deletion from the account page. Public endpoints: the session is checked here, and the request
// only goes ahead when the typed address is the account's own (the modal checks it too, for feedback).
import { revalidatePath } from "next/cache";
import { cancelDeletion, deletionBlocker, requestDeletion } from "@/lib/account-deletion";
import { getSession } from "@/lib/session";

export type DeletionState = { scheduledFor: string } | { error: string } | null;

export async function requestDeletionAction(_prev: DeletionState, fd: FormData): Promise<DeletionState> {
  const session = await getSession();
  if (!session) return { error: "Your session has ended. Sign in again to continue." };
  const { user } = session;
  const typed = String(fd.get("email") ?? "").trim().toLowerCase();
  if (typed !== user.email.toLowerCase()) return { error: "That isn't the email on this account. Type it exactly as shown." };
  const blocked = await deletionBlocker(user);
  if (blocked) return { error: blocked };
  const scheduledFor = await requestDeletion(user); // also signs this account out everywhere
  return { scheduledFor: scheduledFor.toISOString() };
}

/** True when a scheduled deletion was cancelled (false: none was pending, or signed out). */
export async function cancelDeletionAction(): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;
  const cancelled = await cancelDeletion(session.user);
  revalidatePath("/account");
  return cancelled;
}
