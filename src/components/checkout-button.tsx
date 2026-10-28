"use client";

import Link from "next/link";
import { useActionState } from "react";
import { flushNow, track } from "@/lib/analytics";
import type { AnalyticsEvents } from "@/lib/analytics-events";
import { startCheckoutAction } from "@/lib/checkout-actions";

// Posts an empty form: the server rebuilds items and prices from the bag and redirects to Stripe.
// With `upi` (India, Razorpay configured, within the UPI limit) card becomes one of two choices, and
// "Pay by UPI" leads to the delivery details page; it is held back by the same rules as the card button.
// `summary` is the bag as analytics records it when either choice is made.
export function CheckoutButton({ blocked, upi = false, summary }: { blocked: boolean; upi?: boolean; summary: Omit<AnalyticsEvents["Checkout Started"], "method" | "gateway"> }) {
  const [state, action, pending] = useActionState(startCheckoutAction, null);
  return (
    <form action={action} onSubmit={() => {
        track("Checkout Started", { method: "card", gateway: "stripe", ...summary });
        flushNow(); // the page is about to leave for Stripe
      }} className="mt-8">
      <button type="submit" disabled={blocked || pending} aria-describedby="checkout-note" className="btn btn-primary sm:w-full">
        {pending && <span aria-hidden className="size-3.5 animate-spin rounded-full border border-current border-t-transparent" />}
        {pending ? "Opening secure checkout…" : upi ? "Pay by card" : "Checkout"}
      </button>
      {upi &&
        (blocked || pending ? (
          <button type="button" disabled aria-describedby="checkout-note" className="btn btn-secondary mt-3 sm:w-full">Pay by UPI</button>
        ) : (
          <Link
            href="/checkout/upi"
            onClick={() => {
              track("Checkout Started", { method: "upi", gateway: "razorpay", ...summary });
              flushNow();
            }}
            aria-describedby="checkout-note"
            className="btn btn-secondary mt-3 sm:w-full"
          >
            Pay by UPI
          </Link>
        ))}
      {state?.error && <p role="alert" className="mt-3 text-center text-danger">{state.error}</p>}
    </form>
  );
}
