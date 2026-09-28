// Admin reads of orders and the fulfilment writes. Payment status stays Stripe's (src/lib/orders.ts);
// this module only moves fulfilment_status, and only on paid orders. Every exported function checks
// the role itself (enforced by src/app/admin/admin-guard.check.mjs).
import { and, desc, eq, ne, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { orders, user } from "@/db/schema";
import { getOrder, notifyCustomer } from "@/lib/orders";
import { nextFulfilment, type FulfilmentAction, type FulfilmentStatus, type OrderStatus } from "@/lib/order-rules";
import { assertAdmin } from "@/lib/session";

// ponytail: unpaginated, like listAdminProducts; add limit/offset once orders pass a few hundred.
/** Every order except expired checkouts (never charged), newest first. */
export async function listAdminOrders({ status, fulfilment }: { status?: OrderStatus; fulfilment?: FulfilmentStatus } = {}) {
  await assertAdmin();
  const where: SQL[] = [ne(orders.status, "expired")];
  if (status) where.push(eq(orders.status, status));
  if (fulfilment) where.push(eq(orders.fulfilmentStatus, fulfilment));
  return db
    .select({
      id: orders.id,
      createdAt: orders.createdAt,
      email: sql<string>`coalesce(${orders.customerEmail}, ${user.email})`,
      status: orders.status,
      fulfilmentStatus: orders.fulfilmentStatus,
      stockShortfall: orders.stockShortfall,
      refundedCents: orders.refundedCents,
      totalCents: sql<number>`coalesce(${orders.amountTotalCents}, ${orders.subtotalCents})`,
      // Spelled out: inside this subquery ${orders.id} would render as a bare "id" (order_items.id).
      pieces: sql<number>`(select coalesce(sum(oi.quantity), 0)::int from order_items oi where oi.order_id = orders.id)`,
    })
    .from(orders)
    .innerJoin(user, eq(user.id, orders.userId))
    .where(and(...where))
    .orderBy(desc(orders.createdAt));
}

export async function getAdminOrder(id: string) {
  await assertAdmin();
  return getOrder(id);
}

/** The fulfilment status each action starts from; the UPDATE is guarded on it. */
const FROM: Record<FulfilmentAction, FulfilmentStatus> = { ship: "unfulfilled", deliver: "shipped", cancel: "unfulfilled" };

export type FulfilmentResult =
  | { ok: true }
  | { ok: false; current: { status: OrderStatus; fulfilmentStatus: FulfilmentStatus } | null };

/**
 * One guarded UPDATE: it applies only while the order is paid and still in the status the action
 * starts from, so a second admin (or a double submit) changes nothing and gets the current state back.
 * The customer is emailed only when this call's UPDATE returned the row.
 */
export async function updateFulfilment(id: string, action: FulfilmentAction, tracking?: { carrier: string; trackingNumber: string }) {
  await assertAdmin();
  const next = nextFulfilment("paid", FROM[action], action, tracking);
  if (!next) return current(id);
  const now = new Date();
  const [row] = await db
    .update(orders)
    .set({
      fulfilmentStatus: next,
      ...(next === "shipped" && { carrier: tracking!.carrier, trackingNumber: tracking!.trackingNumber, shippedAt: now }),
      ...(next === "delivered" && { deliveredAt: now }),
      ...(next === "cancelled" && { cancelledAt: now }),
    })
    .where(and(eq(orders.id, id), eq(orders.status, "paid"), eq(orders.fulfilmentStatus, FROM[action])))
    .returning({ id: orders.id });
  if (!row) return current(id);
  if (next === "shipped" || next === "cancelled") await notifyCustomer(id, next);
  return { ok: true } as FulfilmentResult;
}

async function current(id: string): Promise<FulfilmentResult> {
  const [row] = await db.select({ status: orders.status, fulfilmentStatus: orders.fulfilmentStatus }).from(orders).where(eq(orders.id, id)).limit(1);
  return { ok: false, current: row ?? null };
}
