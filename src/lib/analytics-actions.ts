"use server";

// Server Actions are public endpoints: the signed-in customer is checked here, and only their own order counts.
import { isUuid } from "@/lib/admin-rules";
import { claimAnalyticsCharged } from "@/lib/orders";
import { getSession } from "@/lib/session";

/**
 * Mark the customer's paid order as counted in analytics. True only for the first call per order, so only
 * that browser sends Charged (src/lib/analytics.ts trackCharged).
 */
export async function claimChargedEvent(orderId: string): Promise<boolean> {
  if (typeof orderId !== "string" || !isUuid(orderId)) return false;
  const session = await getSession();
  if (!session) return false;
  return claimAnalyticsCharged(orderId, session.user.id);
}
