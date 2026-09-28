// The only module that reads or writes orders. Orders are created "pending" from the bag (our prices),
// then moved forward only by applyCheckoutSession with a Checkout Session that came from Stripe
// itself: a signature-verified webhook event, or a server-side sessions.retrieve().
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/db";
import { orderItems, orders, productImages } from "@/db/schema";
import type { Bag } from "@/lib/cart-rules";
import { nextStatus, type CheckoutEvent, type OrderStatus } from "@/lib/order-rules";

/** Snapshot the bag into a pending order. The caller has already checked the bag has no stock issues. */
export async function createPendingOrder(userId: string, bag: Bag) {
  const orderId = crypto.randomUUID();
  const rows = bag.lines.map((l) => ({
    orderId,
    productId: l.productId,
    slug: l.slug,
    name: l.name,
    size: l.size,
    unitPriceCents: l.priceCents,
    quantity: l.quantity,
  }));
  await db.batch([
    db.insert(orders).values({ id: orderId, userId, subtotalCents: bag.subtotalCents }),
    db.insert(orderItems).values(rows),
  ]);
  // Images go to Stripe's page only; they aren't part of the stored snapshot.
  return { orderId, items: rows.map((r, i) => ({ ...r, imageUrl: bag.lines[i].imageUrl })) };
}

export async function attachSession(orderId: string, sessionId: string) {
  await db.update(orders).set({ stripeCheckoutSessionId: sessionId }).where(eq(orders.id, orderId));
}

/** Only a still-pending order can be expired; anything Stripe already moved forward is left alone. */
export async function expireIfPending(orderId: string) {
  await db.update(orders).set({ status: "expired" }).where(and(eq(orders.id, orderId), eq(orders.status, "pending")));
}

export async function pendingOrdersFor(userId: string) {
  return db
    .select({ id: orders.id, sessionId: orders.stripeCheckoutSessionId })
    .from(orders)
    .where(and(eq(orders.userId, userId), eq(orders.status, "pending")));
}

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : (v?.id ?? null));

/**
 * Apply a Stripe Checkout Session to its order. Safe to call any number of times, concurrently, from
 * the webhook and the success page: the status only moves forward (nextStatus), and the whole
 * transition runs as ONE SQL statement (neon-http has no transactions) guarded by
 * `status = <current>`, so only the call that actually moves the order decrements stock and
 * clears the bag. Returns the order's status afterwards.
 */
export async function applyCheckoutSession(session: Stripe.Checkout.Session, event: CheckoutEvent) {
  const orderId = session.metadata?.order_id;
  if (!orderId) return null;
  const [order] = await db
    .select({ id: orders.id, status: orders.status })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.stripeCheckoutSessionId, session.id)))
    .limit(1);
  if (!order) return null;

  const next = nextStatus(order.status, event, session.payment_status);
  if (!next) return { orderId, status: order.status as OrderStatus, changed: false };

  const paid = next === "paid";
  const shipping = session.collected_information?.shipping_details ?? null;
  const result = await db.execute<{ changed: number }>(sql`
    with t as (
      update orders set
        status = ${next}::order_status,
        updated_at = now(),
        paid_at = case when ${paid} then now() else paid_at end,
        amount_total_cents = coalesce(${session.amount_total}, amount_total_cents),
        stripe_payment_intent_id = coalesce(${idOf(session.payment_intent)}, stripe_payment_intent_id),
        customer_email = coalesce(${session.customer_details?.email ?? null}, customer_email),
        shipping_name = coalesce(${shipping?.name ?? null}, shipping_name),
        shipping_address = coalesce(${shipping ? JSON.stringify(shipping.address) : null}::jsonb, shipping_address),
        stock_shortfall = stock_shortfall or (${paid} and exists (
          select 1
          from (select product_id, sum(quantity) as q from order_items where order_id = ${orderId} group by product_id) oi
          join products p on p.id = oi.product_id
          where not p.made_to_order and p.stock_quantity < oi.q))
      where id = ${orderId} and status = ${order.status}::order_status
      returning id, user_id
    ),
    dec as (
      update products p set stock_quantity = greatest(p.stock_quantity - oi.q, 0), updated_at = now()
      from (select product_id, sum(quantity)::int as q from order_items where order_id in (select id from t) group by product_id) oi
      where ${paid} and p.id = oi.product_id and not p.made_to_order
      returning p.id
    ),
    bag as (
      delete from cart_items c using order_items oi, t
      where ${paid} and oi.order_id = t.id and c.user_id = t.user_id and c.product_id = oi.product_id and c.size = oi.size
      returning 1
    )
    select (select count(*) from t)::int as changed
  `);
  const changed = (result.rows[0]?.changed ?? 0) > 0;
  // Lost the race to a concurrent call: report whatever the winner wrote.
  if (!changed) {
    const [now] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId));
    return { orderId, status: now.status as OrderStatus, changed: false };
  }
  return { orderId, status: next, changed: true };
}

/**
 * This user's order history, newest first. Expired checkouts are left out: nothing was charged and
 * they were never orders from the customer's point of view. Everything else shows with its status.
 */
export async function listOrdersForUser(userId: string) {
  return db
    .select({
      id: orders.id,
      status: orders.status,
      createdAt: orders.createdAt,
      totalCents: sql<number>`coalesce(${orders.amountTotalCents}, ${orders.subtotalCents})`,
      // Spelled out: inside these subqueries ${orders.id} would render as a bare "id" (order_items.id).
      pieces: sql<number>`(select coalesce(sum(oi.quantity), 0)::int from order_items oi where oi.order_id = orders.id)`,
      firstItem: sql<string | null>`(select oi.name from order_items oi where oi.order_id = orders.id order by oi.name limit 1)`,
    })
    .from(orders)
    .where(and(eq(orders.userId, userId), ne(orders.status, "expired")))
    .orderBy(desc(orders.createdAt));
}

/** An order with its items, only if it belongs to this user. */
export async function getOrderForUser(orderId: string, userId: string) {
  const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.userId, userId))).limit(1);
  if (!order) return null;
  // The packshot is looked up live (not part of the snapshot); a product deleted since just shows no image.
  const rows = await db
    .select({ item: orderItems, imageUrl: productImages.url, imageAlt: productImages.alt })
    .from(orderItems)
    .leftJoin(productImages, and(eq(productImages.productId, orderItems.productId), eq(productImages.position, 0)))
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItems.name));
  return { ...order, items: rows.map((r) => ({ ...r.item, imageUrl: r.imageUrl, imageAlt: r.imageAlt ?? r.item.name })) };
}
