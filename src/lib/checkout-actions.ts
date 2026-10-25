"use server";

// Starts checkout: Stripe-hosted Checkout (cards), or Razorpay (UPI, India only). Neither form posts an
// amount: items and prices are rebuilt here from a fresh read of the signed-in user's bag, and the
// gateway only ever receives amounts from our database.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Stripe from "stripe";
import { ADDRESS_FIELDS, parseAddressForm, upiAllowed, type AddressField } from "@/lib/address-rules";
import { getBag } from "@/lib/cart";
import { siteUrl } from "@/lib/email";
import {
  applyCheckoutSession,
  attachRazorpayOrder,
  attachSession,
  createPendingOrder,
  expireIfPending,
  SESSION_MINUTES,
  syncRazorpayOrder,
  unsettledOrdersFor,
} from "@/lib/orders";
import { intentStatus, sessionEvent } from "@/lib/order-rules";
import { getMarket } from "@/lib/market-server";
import { createRazorpayOrder, razorpayUpiReady } from "@/lib/razorpay";
import { getSession } from "@/lib/session";
import { stripe } from "@/lib/stripe";
import { checkoutAppearance } from "@/lib/stripe-branding";

export type CheckoutState = { error: string } | null;

const INTEGRATION_ID = "maison-bag-checkout-qvtmrkzd";

// Used with useActionState; it ignores both the previous state and the (empty) form.
export async function startCheckoutAction(): Promise<CheckoutState> {
  const session = await getSession();
  if (!session) redirect("/sign-in?next=%2Fbag");
  const { user } = session;

  // Stock revalidation: the authoritative check before any money is asked for.
  // Priced in the visitor's market exactly as the bag page showed it; the delivery address must be in it too.
  const market = await getMarket();
  const bag = await getBag(user.id, market);
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

  const blocked = await settleEarlierCheckouts(user.id);
  if (blocked) return { error: blocked };

  const { orderId, items } = await createPendingOrder(user.id, bag);
  let url: string | null = null;
  try {
    const checkout = await client.checkout.sessions.create(
      {
        mode: "payment",
        ...checkoutAppearance(base),
        line_items: items.map((i) => ({
          quantity: i.quantity,
          price_data: {
            currency: bag.currency.toLowerCase(),
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
        shipping_address_collection: { allowed_countries: market.countries as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[] },
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

/**
 * Only the newest checkout may be paid: close this user's older ones that are still open. Returns why a
 * new checkout can't start, or null. One that was already paid is applied as the gateway reports it
 * (webhook late or missing), so a paid order is never left pending and its pieces are never charged a
 * second time. A completed but unpaid (processing) order keeps its pieces in the bag, so it blocks
 * checkout until it settles.
 */
async function settleEarlierCheckouts(userId: string): Promise<string | null> {
  let settled = false;
  let confirming = false;
  let unchecked = false;
  for (const o of await unsettledOrdersFor(userId)) {
    if (o.provider === "razorpay") {
      // A Razorpay order can't be closed, only checked: one paid since is applied, the rest are expired
      // (a payment captured after that is reported to the shop to refund). Unreachable fails closed.
      const status = await syncRazorpayOrder(o.id);
      if (status === "paid") settled = true;
      else if (status === null) unchecked = true;
      else await expireIfPending(o.id);
      continue;
    }
    if (!o.sessionId) {
      await expireIfPending(o.id);
      continue;
    }
    try {
      const client = stripe();
      const old = await client.checkout.sessions.retrieve(o.sessionId, { expand: ["payment_intent"] });
      if (old.status === "open") await client.checkout.sessions.expire(o.sessionId);
      if (old.status !== "complete") await expireIfPending(o.id);
      else {
        const ev = sessionEvent(old.status, old.payment_status, intentStatus(old));
        const r = ev ? await applyCheckoutSession(old, ev) : null;
        if (r?.status === "paid") settled = true; // by this call or a concurrent webhook: the bag read before is stale
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
    return "An earlier payment has just been confirmed, and those pieces have left your bag. Please review it before checking out again.";
  }
  if (confirming) {
    return "An earlier payment is still being confirmed, so its pieces remain in your bag. Please check your orders before checking out again.";
  }
  if (unchecked) {
    return "We couldn't confirm the status of an earlier checkout, so nothing new was started. Please try again in a moment.";
  }
  return null;
}

export type UpiCheckoutState = {
  errors?: Partial<Record<AddressField, string>>;
  values?: Partial<Record<AddressField, string>>;
  error?: string;
  checkout?: { keyId: string; razorpayOrderId: string; amount: number; currency: "INR"; orderId: string; name: string; email: string; phone: string; callbackUrl: string };
} | null;

/**
 * UPI through Razorpay: validates the delivery details, snapshots the bag into a pending order and creates
 * its Razorpay order. The client then opens Razorpay's window with what this returns; the payment only
 * counts once Razorpay confirms it (return route, webhook, or a server-side fetch).
 */
export async function startUpiCheckoutAction(prev: UpiCheckoutState, fd: FormData): Promise<UpiCheckoutState> {
  const session = await getSession();
  if (!session) redirect("/sign-in?next=%2Fbag");
  const { user } = session;

  const values = Object.fromEntries(ADDRESS_FIELDS.map((f) => [f, String(fd.get(f) ?? "")])) as Record<AddressField, string>;
  const market = await getMarket();
  const bag = await getBag(user.id, market);
  if (bag.lines.length === 0 || bag.hasIssues) {
    revalidatePath("/bag");
    return { values, error: bag.hasIssues ? "Availability has changed for some pieces. Please review the marked pieces in your bag first." : "Your bag is empty." };
  }
  if (!upiAllowed(market.id, bag.currency, bag.subtotalCents)) {
    return { values, error: "UPI is available in India for bags up to ₹1,00,000. Please pay by card instead." };
  }
  const keyId = process.env.RAZORPAY_KEY_ID;
  if (!(await razorpayUpiReady()) || !keyId) {
    console.error("[upi checkout] Razorpay is not configured, or UPI is switched off for the account");
    return { values, error: "UPI isn't available right now. Please pay by card instead." };
  }

  const parsed = parseAddressForm((k) => values[k]);
  if (!parsed.ok) return { values, errors: parsed.errors };

  const blocked = await settleEarlierCheckouts(user.id);
  if (blocked) return { values, error: blocked };

  const { name, phone, address } = parsed.value;
  const { orderId } = await createPendingOrder(user.id, bag, { email: user.email, name, phone, address });
  try {
    const rzp = await createRazorpayOrder(orderId, bag.subtotalCents);
    await attachRazorpayOrder(orderId, rzp.id);
    return {
      checkout: {
        keyId,
        razorpayOrderId: rzp.id,
        amount: bag.subtotalCents,
        currency: "INR",
        orderId,
        name,
        email: user.email,
        phone,
        callbackUrl: `${siteUrl()}/api/razorpay/return?order=${orderId}`,
      },
    };
  } catch (e) {
    console.error("[upi checkout] Razorpay order create failed:", e);
    await expireIfPending(orderId);
    return { values, error: "UPI is unavailable right now. Please try again in a moment, or pay by card." };
  }
}
