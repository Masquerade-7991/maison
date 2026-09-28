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

/**
 * The event a Checkout Session fetched from Stripe's API is equivalent to, so the success page can apply
 * the same verified fact when the webhook is late or never arrives. `async_payment_succeeded` covers a
 * paid session from both pending and processing. A failed delayed payment is only known from its
 * webhook (the session just stays "unpaid"), so that case is never inferred here.
 */
export function sessionEvent(sessionStatus: string | null, paymentStatus: PaymentStatus): CheckoutEvent | null {
  if (sessionStatus === "expired") return "checkout.session.expired";
  if (sessionStatus !== "complete") return null;
  return isPaid(paymentStatus) ? "checkout.session.async_payment_succeeded" : "checkout.session.completed";
}

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
