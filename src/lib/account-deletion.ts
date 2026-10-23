// Account deletion: requested by the customer, completed automatically DELETION_DAYS later (not at once, so
// they can change their mind: signing in and choosing "Keep my account" cancels it). The only module that
// reads or writes account_deletions.
//
// Completing a deletion (purgeDueDeletions, run daily by /api/cron/account-deletions):
// - an account with no orders is deleted outright (sessions, logins, bag and alerts cascade);
// - an account with orders is anonymised instead: orders are financial records (orders.user_id is
//   `restrict`) and stay, but lose the name, email and address, and the user row keeps only a placeholder.
// An account with an order still in progress is skipped until it settles, and an admin can't request it.
import { and, eq, inArray, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { account, accountDeletions, cartItems, emailLog, orders, session, stockAlerts, user, verification } from "@/db/schema";
import { sendEmail, siteUrl } from "@/lib/email";
import { accountDeletedEmail, deletionCancelledEmail, deletionScheduledEmail } from "@/lib/emails/templates";

export const DELETION_DAYS = 14;

/** When a deletion requested now completes. */
export const deletionDate = (from = new Date()) => new Date(from.getTime() + DELETION_DAYS * 24 * 60 * 60 * 1000);

export async function getDeletion(userId: string) {
  const [row] = await db.select().from(accountDeletions).where(eq(accountDeletions.userId, userId)).limit(1);
  return row ?? null;
}

/** Orders that still need the account: an open or processing payment, or paid and not yet delivered or cancelled. */
async function hasOrderInProgress(userId: string) {
  const [row] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.userId, userId),
        or(inArray(orders.status, ["pending", "processing"]), and(eq(orders.status, "paid"), inArray(orders.fulfilmentStatus, ["unfulfilled", "shipped"]))),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** Why this account can't be scheduled for deletion right now, or null. */
export async function deletionBlocker(u: { id: string; role?: string | null }) {
  if (u.role === "admin") return "Administrator accounts can't be deleted here. Ask another administrator to change your role to customer first.";
  if (await hasOrderInProgress(u.id))
    return "You have an order in progress. You can delete your account once it has been delivered, or write to us and we'll help.";
  return null;
}

/** Schedules deletion, signs the account out everywhere and emails the date. Returns the date. */
export async function requestDeletion(u: { id: string; name: string; email: string }) {
  const scheduledFor = deletionDate();
  const [row] = await db
    .insert(accountDeletions)
    .values({ userId: u.id, scheduledFor })
    .onConflictDoUpdate({ target: accountDeletions.userId, set: { scheduledFor: accountDeletions.scheduledFor } }) // a repeat keeps the first date
    .returning({ scheduledFor: accountDeletions.scheduledFor });
  await db.delete(session).where(eq(session.userId, u.id));
  await sendEmail({ ...deletionScheduledEmail(siteUrl(), u.name, row.scheduledFor), to: u.email, kind: "account.deletion_scheduled", ref: u.id });
  return row.scheduledFor;
}

/** "Keep my account": cancels a scheduled deletion. Returns whether there was one. */
export async function cancelDeletion(u: { id: string; name: string; email: string }) {
  const removed = await db.delete(accountDeletions).where(eq(accountDeletions.userId, u.id)).returning({ userId: accountDeletions.userId });
  if (removed.length === 0) return false;
  await sendEmail({ ...deletionCancelledEmail(siteUrl(), u.name), to: u.email, kind: "account.deletion_cancelled", ref: u.id });
  return true;
}

/**
 * Completes every deletion whose date has passed. Each account is handled in one batch (all or nothing).
 * The goodbye email goes first, while the address still exists. Returns what happened, for the cron log.
 * `onlyUserId` limits it to one account (the e2e test, on the shared database).
 */
export async function purgeDueDeletions(now = new Date(), onlyUserId?: string) {
  const due = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(accountDeletions)
    .innerJoin(user, eq(user.id, accountDeletions.userId))
    .where(and(lte(accountDeletions.scheduledFor, now), onlyUserId ? eq(accountDeletions.userId, onlyUserId) : undefined));

  const result = { deleted: 0, anonymised: 0, skipped: 0 };
  for (const u of due) {
    if (await hasOrderInProgress(u.id)) {
      result.skipped++; // tried again tomorrow
      continue;
    }
    await sendEmail({ ...accountDeletedEmail(siteUrl(), u.name), to: u.email, kind: "account.deleted" });
    const [hasOrders] = await db.select({ id: orders.id }).from(orders).where(eq(orders.userId, u.id)).limit(1);
    // Personal data outside the user row: email records to the address, and reset tokens.
    const common = [db.delete(emailLog).where(eq(emailLog.recipient, u.email)), db.delete(verification).where(eq(verification.value, u.id))] as const;
    if (!hasOrders) {
      await db.batch([...common, db.delete(user).where(eq(user.id, u.id))]);
      result.deleted++;
    } else {
      await db.batch([
        ...common,
        db.delete(session).where(eq(session.userId, u.id)),
        db.delete(account).where(eq(account.userId, u.id)), // the password: nobody can sign in to it again
        db.delete(cartItems).where(eq(cartItems.userId, u.id)),
        db.delete(stockAlerts).where(eq(stockAlerts.userId, u.id)),
        db.delete(accountDeletions).where(eq(accountDeletions.userId, u.id)),
        db.update(orders).set({ customerEmail: null, shippingName: null, shippingAddress: null }).where(eq(orders.userId, u.id)),
        db
          .update(user)
          .set({ name: "Deleted customer", email: sql`'deleted-' || ${user.id} || '@deleted.invalid'`, emailVerified: false, image: null, role: "customer" })
          .where(eq(user.id, u.id)),
      ]);
      result.anonymised++;
    }
  }
  return result;
}
