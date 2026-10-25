import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderDetails } from "@/components/order-details";
import { emailIsOff } from "@/lib/email";
import { formatMoney } from "@/lib/format";
import { applyCheckoutSession, getOrderForUser, syncRazorpayOrder } from "@/lib/orders";
import { fulfilmentStatusCopy, intentStatus, orderReference, orderStatusCopy, orderStatusTone, refundLabel, sessionEvent } from "@/lib/order-rules";
import { requireUser } from "@/lib/session";
import { stripe } from "@/lib/stripe";

export const metadata: Metadata = { title: "Order details | Maison", robots: { index: false } };

const date = new Intl.DateTimeFormat("en", { dateStyle: "long" });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const statusNote: Record<string, string> = {
  pending: "This checkout hasn't been paid, so nothing has been charged.",
  processing: "Your bank is confirming the payment. We'll prepare your order as soon as it clears.",
  payment_failed: "The payment was declined, so nothing was charged.",
  expired: "This checkout expired before payment. Nothing was charged.",
};

// UPI is approved in the customer's own app; a declined request can be retried until the order expires.
const upiNote: Record<string, string> = {
  pending: "Waiting for the payment to be approved in your UPI app. Nothing is charged until it is.",
  payment_failed: "The UPI request expired or was declined. Nothing was charged.",
  expired: "The UPI request expired or was declined. Nothing was charged.",
};

export default async function OrderPage({ params }: PageProps<"/account/orders/[id]">) {
  const { id } = await params;
  const { user } = await requireUser(`/account/orders/${encodeURIComponent(id)}`);
  // Someone else's order and a made-up id look the same: not found.
  let order = UUID.test(id) ? await getOrderForUser(id, user.id) : null;
  if (!order) notFound();

  // Still open on our side: ask Stripe (server-side, our key) in case a webhook was missed, and apply
  // what it reports through the same idempotent transition. Stripe unreachable = show what we have.
  if ((order.status === "pending" || order.status === "processing") && order.stripeCheckoutSessionId) {
    try {
      const session = await stripe().checkout.sessions.retrieve(order.stripeCheckoutSessionId, { expand: ["payment_intent"] });
      const event = sessionEvent(session.status, session.payment_status, intentStatus(session));
      if (event && (await applyCheckoutSession(session, event))?.changed) order = (await getOrderForUser(id, user.id))!;
    } catch (e) {
      console.error("[order page] could not check Stripe for", order.id, e);
    }
  } else if (order.status === "pending" && order.provider === "razorpay") {
    // The same for UPI: Razorpay's own records, read server-side. Never throws.
    await syncRazorpayOrder(order.id);
    order = (await getOrderForUser(id, user.id))!;
  }

  const paid = order.status === "paid";
  const cancelled = paid && order.fulfilmentStatus === "cancelled";
  const refund = refundLabel(order.refundedCents, order.amountTotalCents ?? order.subtotalCents, (c) => formatMoney(c, order.currency));
  const upi = order.provider === "razorpay";
  const note = !paid
    ? (upi ? upiNote : statusNote)[order.status] ?? statusNote[order.status]
    : order.fulfilmentStatus === "shipped"
      ? `Shipped ${order.shippedAt ? date.format(order.shippedAt) : ""} with ${order.carrier}. Tracking number: ${order.trackingNumber}.`
      : order.fulfilmentStatus === "delivered"
        ? `Delivered ${order.deliveredAt ? date.format(order.deliveredAt) : ""} by ${order.carrier} (tracking number ${order.trackingNumber}).`
        : cancelled
          ? "This order was cancelled and will not be sent. Your payment will be refunded to your original payment method."
          : `Your payment is confirmed and we are preparing your pieces.${emailIsOff() ? "" : " We'll email you when they ship."}`;

  return (
    <>
      <Link href="/account/orders" className="label link-nav text-muted hover:text-ink">← All orders</Link>
      <header className="mt-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-line pb-6">
        <div>
          <h2 className="text-display-sm">Order {orderReference(order.id)}</h2>
          <p className="mt-2 text-muted">
            Placed {date.format(order.createdAt)}
            {order.paidAt && ` · Paid ${upi ? "by UPI (Razorpay)" : "by card (Stripe)"}, ${date.format(order.paidAt)}`}
          </p>
        </div>
        <p className={`label ${cancelled ? "text-muted" : orderStatusTone[order.status]}`}>
          {paid ? fulfilmentStatusCopy[order.fulfilmentStatus] : orderStatusCopy[order.status]}
          {refund && <span className="text-muted"> · {refund}</span>}
        </p>
      </header>
      {note && <p className="mt-6 border-l-2 border-line pl-4 text-muted">{note}</p>}
      <div className="mt-8">
        <OrderDetails order={order} />
      </div>
    </>
  );
}
