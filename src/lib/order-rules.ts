// Order state machine. Pure, so check files and client code can import it.
// Statuses only move forward: a repeated, late or out-of-order Stripe event maps to null (no change),
// which is what makes duplicate webhook deliveries harmless.

export type OrderStatus = "pending" | "processing" | "paid" | "payment_failed" | "expired";

export type CheckoutEvent =
  | "checkout.session.completed"
  | "checkout.session.async_payment_succeeded"
  | "checkout.session.async_payment_failed"
  | "checkout.session.expired";

export const CHECKOUT_EVENTS: readonly CheckoutEvent[] = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
];

/** Stripe's Checkout Session payment_status: "paid" | "unpaid" | "no_payment_required", or a future value. */
export type PaymentStatus = string;

const isPaid = (p: PaymentStatus) => p === "paid" || p === "no_payment_required";

export function nextStatus(current: OrderStatus, event: CheckoutEvent, paymentStatus: PaymentStatus): OrderStatus | null {
  switch (event) {
    case "checkout.session.completed":
      if (current !== "pending") return null;
      if (isPaid(paymentStatus)) return "paid";
      return paymentStatus === "unpaid" ? "processing" : null; // an unknown status never counts as paid
    case "checkout.session.async_payment_succeeded":
      return (current === "processing" || current === "pending") && isPaid(paymentStatus) ? "paid" : null;
    case "checkout.session.async_payment_failed":
      return current === "processing" || current === "pending" ? "payment_failed" : null;
    case "checkout.session.expired":
      return current === "pending" ? "expired" : null;
  }
}

// A delayed payment that failed sends its PaymentIntent back to requires_payment_method (or canceled);
// the Checkout Session itself just stays complete + unpaid, so this is the only fetched sign of it.
const FAILED_INTENT = ["requires_payment_method", "canceled"];

/**
 * The event a Checkout Session fetched from Stripe's API is equivalent to, so the success page can apply
 * the same verified fact when the webhook is late or never arrives. `async_payment_succeeded` covers a
 * paid session from both pending and processing. A completed, unpaid session whose PaymentIntent has
 * failed (fetch the session with `expand: ["payment_intent"]`) maps to `async_payment_failed`, so a
 * missed failure webhook can't leave the order "processing" and block checkout forever.
 */
export function sessionEvent(sessionStatus: string | null, paymentStatus: PaymentStatus, intentStatus?: string | null): CheckoutEvent | null {
  if (sessionStatus === "expired") return "checkout.session.expired";
  if (sessionStatus !== "complete") return null;
  if (isPaid(paymentStatus)) return "checkout.session.async_payment_succeeded";
  return intentStatus && FAILED_INTENT.includes(intentStatus) ? "checkout.session.async_payment_failed" : "checkout.session.completed";
}

/** The PaymentIntent status of a session fetched with `expand: ["payment_intent"]` (null if not expanded). */
export const intentStatus = (session: { payment_intent: string | { status: string } | null }) =>
  typeof session.payment_intent === "object" && session.payment_intent ? session.payment_intent.status : null;

/** The short reference customers see (and quote to client services). */
export const orderReference = (id: string) => `MSN-${id.slice(0, 8).toUpperCase()}`;

/** Customer-facing wording for each status. */
export const orderStatusCopy: Record<OrderStatus, string> = {
  pending: "Awaiting payment",
  processing: "Payment processing",
  paid: "Confirmed",
  payment_failed: "Payment failed",
  expired: "Checkout expired",
};

/** Text colour for each status, shared by the order list and the order page. */
export const orderStatusTone: Record<OrderStatus, string> = {
  pending: "text-muted",
  processing: "text-muted",
  paid: "",
  payment_failed: "text-danger",
  expired: "text-muted",
};

/**
 * Refund wording, derived from Stripe's cumulative refunded amount (refunds are issued in the Stripe
 * Dashboard and recorded by the charge.refunded webhook). Kept beside `status`, which stays "paid".
 * The formatter is passed in so this file stays import-free for the check script; pass formatCents.
 */
export function refundLabel(refundedCents: number, totalCents: number, format: (cents: number) => string): string | null {
  if (refundedCents <= 0) return null;
  return refundedCents >= totalCents ? "Refunded" : `Partially refunded (${format(refundedCents)})`;
}

// Fulfilment: what happened to a paid order after payment. Set by an admin, never by Stripe, and kept
// apart from `status` so the payment state machine above stays Stripe-driven.
export type FulfilmentStatus = "unfulfilled" | "shipped" | "delivered" | "cancelled";
export type FulfilmentAction = "ship" | "deliver" | "cancel";

/**
 * The fulfilment status an admin action leads to, or null when it isn't allowed. Only paid orders are
 * fulfilled, and only forward: unfulfilled → shipped (needs a carrier and tracking number) → delivered,
 * or unfulfilled → cancelled. A shipped order can't be cancelled.
 */
export function nextFulfilment(
  payment: OrderStatus,
  current: FulfilmentStatus,
  action: FulfilmentAction,
  tracking?: { carrier?: string | null; trackingNumber?: string | null },
): FulfilmentStatus | null {
  if (payment !== "paid") return null;
  switch (action) {
    case "ship":
      return current === "unfulfilled" && tracking?.carrier?.trim() && tracking.trackingNumber?.trim() ? "shipped" : null;
    case "deliver":
      return current === "shipped" ? "delivered" : null;
    case "cancel":
      return current === "unfulfilled" ? "cancelled" : null;
  }
}

/** Wording for each fulfilment status (customer and admin). */
export const fulfilmentStatusCopy: Record<FulfilmentStatus, string> = {
  unfulfilled: "Preparing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};
