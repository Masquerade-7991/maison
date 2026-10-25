"use client";

import Link from "next/link";
import { useActionState } from "react";
import { startCheckoutAction } from "@/lib/checkout-actions";

// Posts an empty form: the server rebuilds items and prices from the bag and redirects to Stripe.
// With `upi` (India, Razorpay configured, within the UPI limit) card becomes one of two choices, and
// "Pay by UPI" leads to the delivery details page; it is held back by the same rules as the card button.
export function CheckoutButton({ blocked, upi = false }: { blocked: boolean; upi?: boolean }) {
  const [state, action, pending] = useActionState(startCheckoutAction, null);
  return (
    <form action={action} className="mt-8">
      <button type="submit" disabled={blocked || pending} aria-describedby="checkout-note" className="btn btn-primary sm:w-full">
        {pending && <span aria-hidden className="size-3.5 animate-spin rounded-full border border-current border-t-transparent" />}
        {pending ? "Opening secure checkout…" : upi ? "Pay by card" : "Checkout"}
      </button>
      {upi &&
        (blocked || pending ? (
          <button type="button" disabled aria-describedby="checkout-note" className="btn btn-secondary mt-3 sm:w-full">Pay by UPI</button>
        ) : (
          <Link href="/checkout/upi" aria-describedby="checkout-note" className="btn btn-secondary mt-3 sm:w-full">Pay by UPI</Link>
        ))}
      {state?.error && <p role="alert" className="mt-3 text-center text-danger">{state.error}</p>}
    </form>
  );
}
