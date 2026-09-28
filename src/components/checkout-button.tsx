"use client";

import { useActionState } from "react";
import { startCheckoutAction } from "@/lib/checkout-actions";

// Posts an empty form: the server rebuilds items and prices from the bag and redirects to Stripe.
export function CheckoutButton({ blocked }: { blocked: boolean }) {
  const [state, action, pending] = useActionState(startCheckoutAction, null);
  return (
    <form action={action} className="mt-8">
      <button type="submit" disabled={blocked || pending} aria-describedby="checkout-note" className="btn btn-primary sm:w-full">
        {pending && <span aria-hidden className="size-3.5 animate-spin rounded-full border border-current border-t-transparent" />}
        {pending ? "Opening secure checkout…" : "Checkout"}
      </button>
      {state?.error && <p role="alert" className="mt-3 text-center text-danger">{state.error}</p>}
    </form>
  );
}
