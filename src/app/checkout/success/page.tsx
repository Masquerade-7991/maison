import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type Stripe from "stripe";
import { AutoRefresh } from "@/components/auto-refresh";
import { OrderDetails } from "@/components/order-details";
import { applyCheckoutSession, getOrderForUser } from "@/lib/orders";
import { orderReference, orderStatusCopy, sessionEvent } from "@/lib/order-rules";
import { requireUser } from "@/lib/session";
import { stripe } from "@/lib/stripe";

export const metadata: Metadata = { title: "Order confirmation | Maison", robots: { index: false } };

// Arriving here never marks an order paid by itself. The session_id in the URL is just a lookup key:
// the session is fetched from Stripe server-side, must belong to the signed-in customer, and only
// Stripe's own status for it can move the order (the webhook's fallback, see below).
export default async function CheckoutSuccessPage({ searchParams }: PageProps<"/checkout/success">) {
  const raw = (await searchParams).session_id;
  const sessionId = typeof raw === "string" && /^cs_[A-Za-z0-9_]{10,200}$/.test(raw) ? raw : null;
  const { user } = await requireUser(sessionId ? `/checkout/success?session_id=${sessionId}` : "/bag");
  if (!sessionId) notFound();

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe().checkout.sessions.retrieve(sessionId);
  } catch (e) {
    // Only an unknown session is "not found"; a Stripe outage goes to the error boundary's "Try again",
    // so a customer who has just paid is never told their order doesn't exist.
    if ((e as { statusCode?: number }).statusCode === 404) notFound();
    throw e;
  }
  const orderId = session.metadata?.order_id;
  if (session.client_reference_id !== user.id || !orderId) notFound();

  let order = await getOrderForUser(orderId, user.id);
  if (!order) notFound();

  // Webhook late or never delivered: apply the session as Stripe's API reports it (fetched above with
  // our secret key, never from the URL or the browser). Same idempotent transition as the webhook, so
  // whichever arrives second changes nothing.
  const event = order.status === "pending" || order.status === "processing" ? sessionEvent(session.status, session.payment_status) : null;
  if (event) {
    await applyCheckoutSession(session, event);
    order = (await getOrderForUser(orderId, user.id))!;
  }

  const paid = order.status === "paid";
  const processing = order.status === "processing";
  // Stripe has the payment but the webhook hasn't reached us yet: show "confirming" and poll.
  const confirming = order.status === "pending" && session.status === "complete";
  const firstName = user.name.trim().split(/\s+/)[0];
  const email = order.customerEmail ?? user.email;
  const [title, body] = paid
    ? [`Thank you, ${firstName}`, `Your order is confirmed. A receipt is on its way to ${email}.`]
    : confirming
      ? ["Confirming your order", "Stripe is confirming your payment with us. This usually takes a few seconds, and your order is safe if you leave this page."]
      : processing
        ? ["Your payment is processing", "Your bank is confirming the payment. We'll prepare your order as soon as it clears."]
        : order.status === "payment_failed"
          ? ["Your payment didn't go through", "Your bank declined the payment, so nothing was charged. Your bag is saved: you can try again with another payment method."]
          : order.status === "expired"
            ? ["This checkout has expired", "Checkout sessions close after 30 minutes, or when a newer one starts. Nothing was charged and your bag is saved."]
            : ["This checkout isn't finished", "No payment has been taken. Your bag is saved if you'd like to check out again."];

  return (
    <section className="container-page py-12 md:py-20">
      {/* Live region: announces "Confirming" turning into "Thank you" when AutoRefresh re-renders. */}
      <header aria-live="polite" className="mx-auto max-w-2xl text-center">
        <p className={`label ${order.status === "payment_failed" ? "text-danger" : "text-muted"}`}>{confirming ? "Confirming payment" : orderStatusCopy[order.status]}</p>
        <h1 className="mt-4 text-display-sm">{title}</h1>
        <p className="mt-4 text-muted">{body}</p>
        {confirming && (
          <>
            <span aria-hidden className="mx-auto mt-6 block size-4 animate-spin rounded-full border border-current border-t-transparent" />
            <AutoRefresh />
          </>
        )}
        <p className="label mt-6">Order {orderReference(order.id)}</p>
      </header>

      <div className="mx-auto mt-12 max-w-4xl md:mt-16">
        <OrderDetails
          order={order}
          actions={
            <>
              {paid || processing || confirming ? (
                <Link href="/new-arrivals" className="btn btn-primary sm:w-full">Continue shopping</Link>
              ) : (
                <Link href="/bag" className="btn btn-primary sm:w-full">Return to your bag</Link>
              )}
              <Link href={`/account/orders/${order.id}`} className="btn btn-secondary sm:w-full">View in your account</Link>
            </>
          }
        />
      </div>
    </section>
  );
}
