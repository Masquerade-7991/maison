// The only module that reads or writes orders. Orders are created "pending" from the bag (our prices),
// then moved forward only by applyCheckoutSession with a Checkout Session that came from Stripe
// itself: a signature-verified webhook event, or a server-side sessions.retrieve().
import { and, asc, desc, eq, inArray, lt, ne, sql, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type Stripe from "stripe";
import { db } from "@/db";
import { orderItems, orders, productImages, user } from "@/db/schema";
import type { Bag } from "@/lib/cart-rules";
import { sendEmail } from "@/lib/email";
import { orderEmail, type OrderEmail } from "@/lib/order-emails";
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

/** Orders a new checkout must settle first: pending ones (maybe paid, webhook late) and processing ones. */
export async function unsettledOrdersFor(userId: string) {
  return db
    .select({ id: orders.id, status: orders.status, sessionId: orders.stripeCheckoutSessionId })
    .from(orders)
    .where(and(eq(orders.userId, userId), inArray(orders.status, ["pending", "processing"])));
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
  if (!next) return refreshStock({ orderId, status: order.status as OrderStatus, changed: false });

  const paid = next === "paid";
  const shipping = session.collected_information?.shipping_details ?? null;
  // Shortfall is read from the decrement itself, not the statement snapshot: in READ COMMITTED an UPDATE
  // re-checks its WHERE against the locked, current row, so two concurrent last-unit payments can't
  // both pass `stock >= q` in `dec`. The loser falls to `short` (floored at 0; its rows are disjoint
  // from dec's, so no row is updated twice). Made-to-order stock decrements too but is never short.
  const result = await db.execute<{ changed: number; short: number }>(sql`
    with t as (
      update orders set
        status = ${next}::order_status,
        updated_at = now(),
        paid_at = case when ${paid} then now() else paid_at end,
        amount_total_cents = coalesce(${session.amount_total}, amount_total_cents),
        stripe_payment_intent_id = coalesce(${idOf(session.payment_intent)}, stripe_payment_intent_id),
        customer_email = coalesce(${session.customer_details?.email ?? null}, customer_email),
        shipping_name = coalesce(${shipping?.name ?? null}, shipping_name),
        shipping_address = coalesce(${shipping ? JSON.stringify(shipping.address) : null}::jsonb, shipping_address)
      where id = ${orderId} and status = ${order.status}::order_status
      returning id, user_id
    ),
    lines as (select product_id, sum(quantity)::int as q from order_items where ${paid} and order_id in (select id from t) group by product_id),
    dec as (
      update products p set stock_quantity = p.stock_quantity - l.q, updated_at = now()
      from lines l where p.id = l.product_id and p.stock_quantity >= l.q
      returning p.id
    ),
    short as (
      update products p set stock_quantity = greatest(p.stock_quantity - l.q, 0), updated_at = now()
      from lines l where p.id = l.product_id and p.id not in (select id from dec)
      returning p.made_to_order
    ),
    bag as (
      delete from cart_items c using order_items oi, t
      where ${paid} and oi.order_id = t.id and c.user_id = t.user_id and c.product_id = oi.product_id and c.size = oi.size
      returning 1
    )
    select (select count(*) from t)::int as changed, (select count(*) from short where not made_to_order)::int as short
  `);
  const changed = (result.rows[0]?.changed ?? 0) > 0;
  // Lost the race to a concurrent call: report whatever the winner wrote.
  if (!changed) {
    const [now] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId));
    return refreshStock({ orderId, status: now.status as OrderStatus, changed: false });
  }
  // A second statement because `t` already wrote this order row, and a statement can't update a row
  // twice. Only this call moved the order, and the flag only ever goes to true, so it is safe to repeat.
  if ((result.rows[0]?.short ?? 0) > 0) await db.update(orders).set({ stockShortfall: true }).where(eq(orders.id, orderId));
  // Only the call whose guarded UPDATE moved the order gets here, so the confirmation goes exactly once.
  if (paid) await notifyCustomer(orderId, "confirmed");
  return refreshStock({ orderId, status: next, changed: true });
}

/**
 * Record a refund issued in the Stripe Dashboard, from a signature-verified `charge.refunded` event.
 * `amount_refunded` is cumulative, and the guard only lets it grow, so duplicate and out-of-order
 * deliveries are harmless and only the call that raised it emails the customer. Stock is not restocked:
 * a refund doesn't say whether the pieces came back, so admins adjust it in /admin/stock.
 * Returns null when no paid order has this PaymentIntent, else whether this call changed it.
 */
export async function applyChargeRefund(charge: Stripe.Charge) {
  const paymentIntentId = idOf(charge.payment_intent);
  if (!paymentIntentId) return null;
  const [order] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.stripePaymentIntentId, paymentIntentId), eq(orders.status, "paid")))
    .limit(1);
  if (!order) return null;
  const updated = await db
    .update(orders)
    .set({ refundedCents: charge.amount_refunded })
    .where(and(eq(orders.id, order.id), eq(orders.status, "paid"), lt(orders.refundedCents, charge.amount_refunded)))
    .returning({ id: orders.id });
  if (updated.length > 0) await notifyCustomer(order.id, "refunded");
  return { orderId: order.id, changed: updated.length > 0 };
}

/**
 * The storefront is ISR and shows stock, so refresh it whenever the order is paid, not only when this
 * call paid it: Next throws on revalidatePath during a page render, so when the success page settles an
 * order first, the webhook arriving after it (changed: false) is the call that refreshes.
 */
function refreshStock<T extends { status: OrderStatus }>(result: T) {
  if (result.status === "paid") {
    try {
      revalidatePath("/", "layout");
    } catch {
      // rendering a page: the webhook covers it
    }
  }
  return result;
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
      fulfilmentStatus: orders.fulfilmentStatus,
      createdAt: orders.createdAt,
      totalCents: sql<number>`coalesce(${orders.amountTotalCents}, ${orders.subtotalCents})`,
      refundedCents: orders.refundedCents,
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
  return loadOrder(and(eq(orders.id, orderId), eq(orders.userId, userId))!);
}

/** Any order by id, with no ownership check: for order emails and the admin pages (which check the role first). */
export async function getOrder(orderId: string) {
  return loadOrder(eq(orders.id, orderId));
}

async function loadOrder(where: SQL) {
  const [row] = await db.select({ order: orders, accountEmail: user.email }).from(orders).innerJoin(user, eq(user.id, orders.userId)).where(where).limit(1);
  if (!row) return null;
  const { order, accountEmail } = row;
  const orderId = order.id;
  // The packshot is looked up live (not part of the snapshot); a product deleted since just shows no image.
  const rows = await db
    .select({ item: orderItems, imageUrl: productImages.url, imageAlt: productImages.alt })
    .from(orderItems)
    .leftJoin(productImages, and(eq(productImages.productId, orderItems.productId), eq(productImages.position, 0)))
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItems.name));
  return { ...order, accountEmail, items: rows.map((r) => ({ ...r.item, imageUrl: r.imageUrl, imageAlt: r.imageAlt ?? r.item.name })) };
}

/**
 * Email the customer about a change to their order. Callers send only after their guarded UPDATE
 * returned a row, so each email goes once. Never throws: a mail failure must not fail the webhook
 * (Stripe would retry) or an admin action that has already been saved.
 */
export async function notifyCustomer(orderId: string, kind: OrderEmail) {
  try {
    const order = await getOrder(orderId);
    if (order) await sendEmail(orderEmail(order, kind));
  } catch (e) {
    console.error(`[order email] ${kind} for ${orderId} failed:`, e);
  }
}
