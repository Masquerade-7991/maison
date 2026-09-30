"use server";

// Starts Stripe-hosted Checkout. The form posts nothing: items and prices are rebuilt here from a
// fresh read of the signed-in user's bag, and Stripe only ever receives amounts from our database.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Stripe from "stripe";
import { getBag } from "@/lib/cart";
import { applyCheckoutSession, attachSession, createPendingOrder, expireIfPending, unsettledOrdersFor } from "@/lib/orders";
import { sessionEvent } from "@/lib/order-rules";
import { getSession } from "@/lib/session";
import { stripe } from "@/lib/stripe";

export type CheckoutState = { error: string } | null;

const SHIP_TO = ["US"] as const; // countries Checkout collects a shipping address for
const SESSION_MINUTES = 30; // Stripe's minimum; also the oversell window (no stock reservation)
const INTEGRATION_ID = "maison-bag-checkout-qvtmrkzd";

// Used with useActionState; it ignores both the previous state and the (empty) form.
export async function startCheckoutAction(): Promise<CheckoutState> {
  const session = await getSession();
  if (!session) redirect("/sign-in?next=%2Fbag");
  const { user } = session;

  // Stock revalidation: the authoritative check before any money is asked for.
  const bag = await getBag(user.id);
  if (bag.lines.length === 0 || bag.hasIssues) {
    revalidatePath("/bag"); // the page may be stale: re-render it so the marked pieces appear with the error
    return { error: bag.hasIssues ? "Availability has changed for some pieces. Please review the marked pieces first." : "Your bag is empty." };
  }

  const base = process.env.BETTER_AUTH_URL;
  let client;
  try {
    if (!base) throw new Error("BETTER_AUTH_URL is not set");
    client = stripe();
  } catch (e) {
    console.error("[checkout] not configured:", e);
    return { error: "Checkout isn't available right now." };
  }

  // Only the newest checkout may be paid: close this user's older sessions that are still open.
  // One that already completed is applied as Stripe reports it (webhook late or missing), so a paid
  // order is never left pending and its pieces are never charged a second time. A completed but
  // unpaid (processing) order keeps its pieces in the bag, so it blocks checkout until it settles.
  let settled = false;
  let confirming = false;
  let unchecked = false;
  for (const o of await unsettledOrdersFor(user.id)) {
    if (!o.sessionId) {
      await expireIfPending(o.id);
      continue;
    }
    try {
      const old = await client.checkout.sessions.retrieve(o.sessionId);
      if (old.status === "open") await client.checkout.sessions.expire(o.sessionId);
      if (old.status !== "complete") await expireIfPending(o.id);
      else {
        const ev = sessionEvent(old.status, old.payment_status);
        const r = ev ? await applyCheckoutSession(old, ev) : null;
        if (r?.status === "paid") settled = true; // by this call or a concurrent webhook: the bag read above is stale
        else if ((r?.status ?? o.status) === "processing") confirming = true;
      }
    } catch (e) {
      // Fail closed: an older session we couldn't check or close may still be payable (e.g. the customer
      // paid it in another tab between our retrieve and expire, so Stripe refused the expire), and
      // starting a new one would charge the same pieces twice. The next attempt re-checks it. Only a
      // session Stripe says doesn't exist can never be paid, so that order is expired instead.
      if (e instanceof Stripe.errors.StripeInvalidRequestError && e.code === "resource_missing") {
        await expireIfPending(o.id);
        continue;
      }
      console.error("[checkout] could not close older session", o.sessionId, e);
      if (o.status === "processing") confirming = true;
      else unchecked = true;
    }
  }
  if (settled) {
    revalidatePath("/bag");
    return { error: "An earlier payment has just been confirmed, and those pieces have left your bag. Please review it before checking out again." };
  }
  if (confirming) {
    return { error: "An earlier payment is still being confirmed, so its pieces remain in your bag. Please check your orders before checking out again." };
  }
  if (unchecked) {
    return { error: "We couldn't confirm the status of an earlier checkout, so nothing new was started. Please try again in a moment." };
  }

  const { orderId, items } = await createPendingOrder(user.id, bag);
  let url: string | null = null;
  try {
    const checkout = await client.checkout.sessions.create(
      {
        mode: "payment",
        line_items: items.map((i) => ({
          quantity: i.quantity,
          price_data: {
            currency: "usd",
            unit_amount: i.unitPriceCents,
            product_data: {
              name: i.size ? `${i.name} (size ${i.size})` : i.name,
              ...(i.imageUrl ? { images: [i.imageUrl] } : {}),
            },
          },
        })),
        client_reference_id: user.id,
        customer_email: user.email,
        metadata: { order_id: orderId },
        payment_intent_data: { metadata: { order_id: orderId } },
        shipping_address_collection: { allowed_countries: [...SHIP_TO] },
        success_url: `${base}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}/bag?checkout=cancelled`,
        expires_at: Math.floor(Date.now() / 1000) + SESSION_MINUTES * 60,
        integration_identifier: INTEGRATION_ID,
      },
      { idempotencyKey: `checkout-${orderId}` },
    );
    await attachSession(orderId, checkout.id);
    url = checkout.url;
  } catch (e) {
    console.error("[checkout] session create failed:", e);
    await expireIfPending(orderId);
    return { error: "Checkout is unavailable right now. Please try again in a moment." };
  }
  if (!url) return { error: "Checkout is unavailable right now. Please try again in a moment." };
  redirect(url);
}
