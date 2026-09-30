// Stripe webhook. Payment status reaches the database only through here or the success page's
// server-side sessions.retrieve() fallback, never from the browser. Keep /api/** out of any auth proxy:
// Stripe sends no cookie.
import type Stripe from "stripe";
import { applyChargeRefund, applyCheckoutSession } from "@/lib/orders";
import { CHECKOUT_EVENTS, type CheckoutEvent } from "@/lib/order-rules";
import { stripe, webhookSecret } from "@/lib/stripe";

export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing Stripe signature", { status: 400 });

  let secret: string;
  let client: Stripe;
  try {
    secret = webhookSecret();
    client = stripe(); // a missing STRIPE_SECRET_KEY is misconfiguration too, not a bad signature
  } catch (e) {
    // Our misconfiguration, not a bad request: 500 so Stripe keeps retrying once the secret is set.
    console.error("[stripe webhook]", e instanceof Error ? e.message : e);
    return new Response("Webhook not configured", { status: 500 });
  }

  let event: Stripe.Event;
  try {
    // Raw body: the signature is over the exact bytes Stripe sent.
    event = client.webhooks.constructEvent(await req.text(), signature, secret);
  } catch (e) {
    console.error("[stripe webhook] rejected:", e instanceof Error ? e.message : e);
    return new Response("Invalid signature", { status: 400 });
  }

  const refund = event.type === "charge.refunded";
  if (!refund && !(CHECKOUT_EVENTS as readonly string[]).includes(event.type)) return Response.json({ received: true });

  try {
    // Refunds are issued in the Stripe Dashboard; charge.refunded carries the cumulative amount_refunded.
    const result = refund
      ? await applyChargeRefund(event.data.object as Stripe.Charge)
      : await applyCheckoutSession(event.data.object as Stripe.Checkout.Session, event.type as CheckoutEvent);
    if (!result) console.warn(`[stripe webhook] ${event.type} ${event.id}: no matching order`);
  } catch (e) {
    // 500 makes Stripe retry; both apply functions are idempotent, so a retry is always safe.
    console.error(`[stripe webhook] ${event.type} ${event.id} failed:`, e);
    return new Response("Processing failed", { status: 500 });
  }
  return Response.json({ received: true });
}
