// The only module that reads or writes orders. Orders are created "pending" from the bag (our prices),
// then moved forward only by facts that came from the gateway itself: applyCheckoutSession with a Stripe
// Checkout Session (a signature-verified webhook event, or a server-side sessions.retrieve()), or
// applyRazorpayPayment with a Razorpay payment (its signed webhook, or fetched from its API).
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lt, ne, sql, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type Stripe from "stripe";
import { db } from "@/db";
import { orderItems, orders, productImages, user } from "@/db/schema";
import type { Bag } from "@/lib/cart-rules";
import { sendEmail, siteUrl, type SendResult } from "@/lib/email";
import { renderEmail } from "@/lib/emails/layout";
import { newOrderAdminEmail, orderEmail, type OrderEmailKind } from "@/lib/emails/templates";
import type { IndianAddress } from "@/lib/address-rules";
import { LATE_PURCHASE_DAYS } from "@/lib/analytics-events";
import { formatMoney } from "@/lib/format";
import { nextStatus, nextStatusFromFact, orderReference, type CheckoutEvent, type OrderStatus } from "@/lib/order-rules";
import { fetchOrderPayments, fetchPayment, type RazorpayPayment } from "@/lib/razorpay";

// ponytail: 30 is Stripe's minimum, checked against Stripe's clock; the slack covers a server clock
// running behind (a dev machine 66s slow had every session refused). Oversell window is ~35 minutes.
// A Razorpay order with no captured payment is expired after the same window.
export const SESSION_MINUTES = 30 + 5;

/** UPI checkout: Razorpay's page collects no address, so the order is created with ours. */
export type UpiDelivery = { email: string; name: string; phone: string; address: IndianAddress };

/** Snapshot the bag into a pending order. The caller has already checked the bag has no stock issues. */
export async function createPendingOrder(userId: string, bag: Bag, upi?: UpiDelivery) {
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
    db.insert(orders).values({
      id: orderId,
      userId,
      subtotalCents: bag.subtotalCents,
      currency: bag.currency.toLowerCase(), // Stripe's spelling, so it compares with session.currency
      market: bag.market,
      usdRate: bag.usdRate,
      // The phone rides in the address: readers that expect Stripe's address shape ignore it.
      ...(upi && { provider: "razorpay" as const, customerEmail: upi.email, shippingName: upi.name, shippingAddress: { ...upi.address, phone: upi.phone } }),
    }),
    db.insert(orderItems).values(rows),
  ]);
  // Images go to Stripe's page only; they aren't part of the stored snapshot.
  return { orderId, items: rows.map((r, i) => ({ ...r, imageUrl: bag.lines[i].imageUrl })) };
}

export async function attachSession(orderId: string, sessionId: string) {
  await db.update(orders).set({ stripeCheckoutSessionId: sessionId }).where(eq(orders.id, orderId));
}

export async function attachRazorpayOrder(orderId: string, razorpayOrderId: string) {
  await db.update(orders).set({ razorpayOrderId }).where(eq(orders.id, orderId));
}

/** The Razorpay order we created for this order: the only one its payments are checked against. */
export async function storedRazorpayOrderId(orderId: string) {
  const [row] = await db.select({ id: orders.razorpayOrderId }).from(orders).where(eq(orders.id, orderId)).limit(1);
  return row?.id ?? null;
}

/** Only a still-pending order can be expired; anything Stripe already moved forward is left alone. */
export async function expireIfPending(orderId: string) {
  await db.update(orders).set({ status: "expired" }).where(and(eq(orders.id, orderId), eq(orders.status, "pending")));
}

/** Orders a new checkout must settle first: pending ones (maybe paid, webhook late) and processing ones. */
export async function unsettledOrdersFor(userId: string) {
  return db
    .select({ id: orders.id, status: orders.status, provider: orders.provider, sessionId: orders.stripeCheckoutSessionId })
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
export async function applyCheckoutSession(
  session: Stripe.Checkout.Session,
  event: CheckoutEvent,
  retried = false,
): Promise<{ orderId: string; status: OrderStatus; changed: boolean } | null> {
  const orderId = session.metadata?.order_id;
  if (!orderId) return null;
  const [order] = await db
    .select({ id: orders.id, status: orders.status, currency: orders.currency })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.stripeCheckoutSessionId, session.id)))
    .limit(1);
  if (!order) return null;
  // The session was built from this order in its currency; any other currency means it isn't that payment.
  if (session.currency && session.currency !== order.currency) {
    console.error("[orders] session currency does not match the order, not applied", { orderId, session: session.currency, order: order.currency });
    return null;
  }

  const next = nextStatus(order.status, event, session.payment_status);
  if (!next) return refreshStock({ orderId, status: order.status as OrderStatus, changed: false });

  const shipping = session.collected_information?.shipping_details ?? null;
  const changed = await applyPaymentFact(orderId, order.status as OrderStatus, next, {
    amountTotal: session.amount_total,
    stripePaymentIntentId: idOf(session.payment_intent),
    customerEmail: session.customer_details?.email ?? null,
    shippingName: shipping?.name ?? null,
    shippingAddressJson: shipping ? JSON.stringify(shipping.address) : null,
  });
  // Lost the race to a concurrent call. If the winner moved the order to a status this event can still
  // advance (e.g. it went pending → processing while this payment-succeeded event read "pending"), apply
  // it again once from there: a webhook answered 200 here is never redelivered, so it would be lost.
  if (!changed) {
    const [now] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId));
    if (!retried && now.status !== order.status && nextStatus(now.status as OrderStatus, event, session.payment_status)) {
      return applyCheckoutSession(session, event, true);
    }
    return refreshStock({ orderId, status: now.status as OrderStatus, changed: false });
  }
  await announce(orderId, next);
  return refreshStock({ orderId, status: next, changed: true });
}

/** What the gateway reported with the payment. Null leaves the stored value as it is. */
type PaymentDetails = {
  amountTotal: number | null;
  stripePaymentIntentId?: string | null;
  razorpayPaymentId?: string | null;
  customerEmail?: string | null;
  shippingName?: string | null;
  shippingAddressJson?: string | null;
};

/** Move the order from `current` to `next` in ONE guarded statement. Returns whether this call moved it. */
async function applyPaymentFact(orderId: string, current: OrderStatus, next: OrderStatus, d: PaymentDetails) {
  const paid = next === "paid";
  // Everything, including the shortfall flag, is ONE statement, so nothing can fail between the order
  // becoming paid and its side effects (a gateway retry would find it paid and do nothing).
  // `g` locks the order row first: a concurrent call for the same order waits, then re-checks
  // `status = current` against the committed row (READ COMMITTED) and matches nothing, so only one call
  // decrements. Shortfall is read from the decrement itself, not the snapshot: an UPDATE re-checks
  // `stock >= q` against the current row, so of two last-unit payments for different orders the loser
  // falls to `short` (floored at 0; disjoint from dec's rows, so no row is updated twice). Made-to-order
  // stock decrements too but is never short. `t` reads `short`, so it runs after the decrement.
  const result = await db.execute<{ changed: number }>(sql`
    with g as (
      select id from orders where id = ${orderId} and status = ${current}::order_status for update
    ),
    lines as (select product_id, sum(quantity)::int as q from order_items where ${paid} and order_id in (select id from g) group by product_id),
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
    t as (
      update orders set
        status = ${next}::order_status,
        updated_at = now(),
        paid_at = case when ${paid} then now() else paid_at end,
        amount_total_cents = coalesce(${d.amountTotal}, amount_total_cents),
        stripe_payment_intent_id = coalesce(${d.stripePaymentIntentId ?? null}, stripe_payment_intent_id),
        razorpay_payment_id = coalesce(${d.razorpayPaymentId ?? null}, razorpay_payment_id),
        customer_email = coalesce(${d.customerEmail ?? null}, customer_email),
        shipping_name = coalesce(${d.shippingName ?? null}, shipping_name),
        shipping_address = coalesce(${d.shippingAddressJson ?? null}::jsonb, shipping_address),
        stock_shortfall = stock_shortfall or exists (select 1 from short where not made_to_order)
      where id in (select id from g)
      returning id, user_id
    ),
    bag as (
      delete from cart_items c using order_items oi, t
      where ${paid} and oi.order_id = t.id and c.user_id = t.user_id and c.product_id = oi.product_id and c.size = oi.size
      returning 1
    )
    select (select count(*) from t)::int as changed
  `);
  return (result.rows[0]?.changed ?? 0) > 0;
}

/**
 * Only the call whose guarded UPDATE moved the order gets here, so the confirmation goes at most once
 * (notifyCustomer never throws; a process killed right here would lose it, the order is still correct).
 */
async function announce(orderId: string, next: OrderStatus) {
  if (next === "paid") {
    await notifyCustomer(orderId, "confirmed");
    await notifyShop(orderId);
  } else if (next === "processing" || next === "payment_failed") await notifyCustomer(orderId, next);
}

/**
 * Apply a Razorpay payment to its order: from the signed webhook, or fetched from Razorpay's API (the
 * return route, the success page, the cron). Only a captured payment against the Razorpay order we
 * created, in rupees, for exactly the order's total, pays it; anything else is logged and ignored. A
 * failed attempt changes nothing: the customer can retry in their UPI app until the order expires.
 * Safe to repeat and to race, like applyCheckoutSession.
 */
export async function applyRazorpayPayment(
  payment: RazorpayPayment,
  retried = false,
): Promise<{ orderId: string; status: OrderStatus; changed: boolean } | null> {
  if (!payment.order_id) return null;
  const [order] = await db
    .select({ id: orders.id, status: orders.status, currency: orders.currency, subtotalCents: orders.subtotalCents, paymentId: orders.razorpayPaymentId })
    .from(orders)
    .where(and(eq(orders.provider, "razorpay"), eq(orders.razorpayOrderId, payment.order_id)))
    .limit(1);
  if (!order) return null;
  const status = order.status as OrderStatus;
  if (payment.status !== "captured") return { orderId: order.id, status, changed: false };
  if (payment.currency !== "INR" || order.currency !== "inr" || payment.amount !== order.subtotalCents) {
    console.error("[orders] Razorpay payment does not match the order, not applied", { orderId: order.id, payment: payment.id, amount: payment.amount, currency: payment.currency, subtotal: order.subtotalCents });
    return null;
  }

  const next = nextStatusFromFact(status, "paid");
  if (!next) {
    // Money taken for an order we already closed (expired, or paid by another payment): nothing to apply,
    // so someone has to refund it in the Razorpay Dashboard.
    if (order.paymentId !== payment.id) await alertOrphanPayment(order.id, status, payment);
    return refreshStock({ orderId: order.id, status, changed: false });
  }
  const changed = await applyPaymentFact(order.id, status, next, { amountTotal: payment.amount, razorpayPaymentId: payment.id });
  // Lost a race: read the order again, once, and handle the payment from its new status.
  if (!changed) return retried ? { orderId: order.id, status, changed: false } : applyRazorpayPayment(payment, true);
  await announce(order.id, next);
  return refreshStock({ orderId: order.id, status: next, changed: true });
}

/** Tell the shop inbox to refund a captured payment no order can take. Never throws. */
async function alertOrphanPayment(orderId: string, status: OrderStatus, payment: RazorpayPayment) {
  const amount = formatMoney(payment.amount, "INR");
  const why = status === "expired" ? "had already expired" : "was already paid by another payment";
  console.error(`[orders] Razorpay payment ${payment.id} (${amount}) arrived for ${status} order ${orderId}: refund it`);
  const to = process.env.CONTACT_TO;
  if (!to) return;
  try {
    const ref = orderReference(orderId);
    const mail = renderEmail({
      site: siteUrl(),
      subject: `Refund needed: UPI payment for ${ref}`,
      preheader: `${amount} was captured for an order that ${why}.`,
      blocks: [
        { t: "label", text: "Payment to refund" },
        { t: "title", text: `Refund ${payment.id}` },
        { t: "p", text: `Razorpay captured ${amount} (${payment.id}) for ${ref}, but the order ${why}, so it was not applied. Refund it in the Razorpay Dashboard.` },
        { t: "button", text: "Open in admin", href: `${siteUrl()}/admin/orders/${orderId}` },
      ],
    });
    await sendEmail({ ...mail, to, kind: "admin.payment_orphan", ref: orderId });
  } catch (e) {
    console.error(`[order email] orphan payment alert for ${orderId} failed:`, e);
  }
}

/**
 * Ask Razorpay about a pending Razorpay order, for when the webhook is late or lost: a captured payment
 * pays it, and with none after SESSION_MINUTES it expires. Returns the order's status afterwards, or
 * null when it couldn't be checked (no such Razorpay order, or Razorpay unreachable). Never throws.
 */
export async function syncRazorpayOrder(orderId: string): Promise<OrderStatus | null> {
  try {
    const [order] = await db
      .select({ status: orders.status, razorpayOrderId: orders.razorpayOrderId, createdAt: orders.createdAt })
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.provider, "razorpay")))
      .limit(1);
    if (!order) return null;
    if (order.status !== "pending") return order.status as OrderStatus;
    const payments = order.razorpayOrderId ? await fetchOrderPayments(order.razorpayOrderId) : [];
    const captured = payments.find((p) => p.status === "captured");
    if (captured) {
      const r = await applyRazorpayPayment(captured);
      if (r) return r.status;
    }
    // An authorized payment is about to be auto-captured, so the order isn't abandoned yet.
    const capturing = payments.some((p) => p.status === "authorized");
    if (!capturing && Date.now() - order.createdAt.getTime() > SESSION_MINUTES * 60_000) await expireIfPending(orderId);
    const [now] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId));
    return now.status as OrderStatus;
  } catch (e) {
    console.error(`[orders] could not sync Razorpay order ${orderId}:`, e);
    return null;
  }
}

/** Pending Razorpay orders older than `minutes`, for the payments cron to settle. */
export async function pendingRazorpayOrdersOlderThan(minutes: number) {
  const rows = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.provider, "razorpay"), eq(orders.status, "pending"), lt(orders.createdAt, new Date(Date.now() - minutes * 60_000))));
  return rows.map((r) => r.id);
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
 * Record a refund issued in the Razorpay Dashboard. The webhook's refund only names its payment, so the
 * cumulative amount_refunded is read from Razorpay and stored with the same only-grows guard as above.
 */
export async function applyRazorpayRefund(paymentId: string) {
  const payment = await fetchPayment(paymentId);
  const [order] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.razorpayPaymentId, payment.id), eq(orders.status, "paid")))
    .limit(1);
  if (!order) return null;
  const updated = await db
    .update(orders)
    .set({ refundedCents: payment.amount_refunded })
    .where(and(eq(orders.id, order.id), eq(orders.status, "paid"), lt(orders.refundedCents, payment.amount_refunded)))
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
      currency: orders.currency,
      market: orders.market,
      provider: orders.provider,
      analyticsChargedAt: orders.analyticsChargedAt,
      paidAt: orders.paidAt,
      itemSlugs: sql<string[]>`(select coalesce(array_agg(oi.slug order by oi.name), '{}') from order_items oi where oi.order_id = orders.id)`,
      // Spelled out: inside these subqueries ${orders.id} would render as a bare "id" (order_items.id).
      pieces: sql<number>`(select coalesce(sum(oi.quantity), 0)::int from order_items oi where oi.order_id = orders.id)`,
      firstItem: sql<string | null>`(select oi.name from order_items oi where oi.order_id = orders.id order by oi.name limit 1)`,
    })
    .from(orders)
    .where(and(eq(orders.userId, userId), ne(orders.status, "expired")))
    .orderBy(desc(orders.createdAt));
}

/**
 * Claim a paid order's analytics purchase event for one browser: one guarded UPDATE, so of any number of
 * tabs, devices or reloads only the first call returns true. Only the order's own customer can claim it.
 */
export async function claimAnalyticsCharged(orderId: string, userId: string) {
  const rows = await db
    .update(orders)
    .set({ analyticsChargedAt: new Date() })
    .where(
      and(
        eq(orders.id, orderId),
        eq(orders.userId, userId),
        eq(orders.status, "paid"),
        ne(orders.fulfilmentStatus, "cancelled"),
        isNull(orders.analyticsChargedAt),
        gt(orders.paidAt, new Date(Date.now() - LATE_PURCHASE_DAYS * 86_400_000)),
      ),
    )
    .returning({ id: orders.id });
  return rows.length > 0;
}

/** A stored delivery address: Stripe's shape, plus `phone` on Razorpay orders. */
export type ShippingAddress = {
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  phone?: string;
};

/** The delivery details of this user's latest order that has some, to prefill the UPI form. */
export async function lastShippingFor(userId: string): Promise<{ name: string | null; phone: string | null; address: ShippingAddress | null } | null> {
  const [row] = await db
    .select({ name: orders.shippingName, address: orders.shippingAddress })
    .from(orders)
    .where(and(eq(orders.userId, userId), isNotNull(orders.shippingAddress)))
    .orderBy(desc(orders.createdAt))
    .limit(1);
  if (!row) return null;
  const address = row.address as ShippingAddress | null;
  return { name: row.name, phone: address?.phone ?? null, address };
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
  const [row] = await db.select({ order: orders, accountEmail: user.email, accountName: user.name }).from(orders).innerJoin(user, eq(user.id, orders.userId)).where(where).limit(1);
  if (!row) return null;
  const { order, accountEmail, accountName } = row;
  const orderId = order.id;
  // The packshot is looked up live (not part of the snapshot); a product deleted since just shows no image.
  const rows = await db
    .select({ item: orderItems, imageUrl: productImages.url, imageAlt: productImages.alt })
    .from(orderItems)
    .leftJoin(productImages, and(eq(productImages.productId, orderItems.productId), eq(productImages.position, 0)))
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItems.name));
  return { ...order, accountEmail, accountName, items: rows.map((r) => ({ ...r.item, imageUrl: r.imageUrl, imageAlt: r.imageAlt ?? r.item.name })) };
}

/**
 * Email the customer about a change to their order. Callers send only after their guarded UPDATE
 * returned a row, so each email goes once. Never throws: a mail failure must not fail the webhook
 * (Stripe would retry) or an admin action that has already been saved.
 */
export async function notifyCustomer(orderId: string, kind: OrderEmailKind, resend = false): Promise<SendResult | null> {
  try {
    const order = await getOrder(orderId);
    if (!order) return null;
    const mail = orderEmail(siteUrl(), order, kind, order.accountName, resend);
    return await sendEmail({ ...mail, to: order.customerEmail ?? order.accountEmail, kind: `order.${kind}${resend ? ".resend" : ""}`, ref: order.id });
  } catch (e) {
    console.error(`[order email] ${kind} for ${orderId} failed:`, e);
    return "failed";
  }
}

/** The business inbox hears about every paid order (flagged when it oversold). Skipped without CONTACT_TO. */
async function notifyShop(orderId: string) {
  const to = process.env.CONTACT_TO;
  if (!to) return;
  try {
    const order = await getOrder(orderId);
    if (order) await sendEmail({ ...newOrderAdminEmail(siteUrl(), order), to, kind: "admin.new_order", ref: order.id });
  } catch (e) {
    console.error(`[order email] admin alert for ${orderId} failed:`, e);
  }
}
