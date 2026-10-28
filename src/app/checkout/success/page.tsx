import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type Stripe from "stripe";
import { TrackCharged, TrackEvent } from "@/components/analytics";
import { AutoRefresh } from "@/components/auto-refresh";
import { OrderDelivery, OrderTotals } from "@/components/order-details";
import { toMajor } from "@/lib/analytics-events";
import { emailIsOff } from "@/lib/email";
import { formatMoney } from "@/lib/format";
import { applyCheckoutSession, getOrderForUser, syncRazorpayOrder } from "@/lib/orders";
import { intentStatus, orderReference, orderStatusCopy, sessionEvent } from "@/lib/order-rules";
import { requireUser } from "@/lib/session";
import { stripe } from "@/lib/stripe";

export const metadata: Metadata = { title: "Order confirmation | Maison", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Arriving here never marks an order paid by itself. The session_id (Stripe) or order id (UPI, from
// Razorpay's return) in the URL is just a lookup key: the order must belong to the signed-in customer,
// and only the gateway's own records can move it (the webhook's fallback, see below).
export default async function CheckoutSuccessPage({ searchParams }: PageProps<"/checkout/success">) {
  const query = await searchParams;
  const raw = query.session_id;
  const sessionId = typeof raw === "string" && /^cs_[A-Za-z0-9_]{10,200}$/.test(raw) ? raw : null;
  const orderParam = !sessionId && typeof query.order === "string" && UUID.test(query.order) ? query.order : null;
  const { user } = await requireUser(
    sessionId ? `/checkout/success?session_id=${sessionId}` : orderParam ? `/checkout/success?order=${orderParam}` : "/bag",
  );
  if (!sessionId && !orderParam) notFound();

  let session: Stripe.Checkout.Session | null = null;
  if (sessionId) {
    try {
      session = await stripe().checkout.sessions.retrieve(sessionId, { expand: ["payment_intent"] });
    } catch (e) {
      // Only an unknown session is "not found"; a Stripe outage goes to the error boundary's "Try again",
      // so a customer who has just paid is never told their order doesn't exist.
      if ((e as { statusCode?: number }).statusCode === 404) notFound();
      throw e;
    }
  }
  const orderId = session ? session.metadata?.order_id : orderParam;
  if ((session && session.client_reference_id !== user.id) || !orderId) notFound();

  let order = await getOrderForUser(orderId, user.id);
  if (!order) notFound();
  const upi = order.provider === "razorpay";

  // Webhook late or never delivered: apply the session as Stripe's API reports it (fetched above with
  // our secret key, never from the URL or the browser). Same idempotent transition as the webhook, so
  // whichever arrives second changes nothing. A pending UPI order asks Razorpay the same way.
  const event =
    session && (order.status === "pending" || order.status === "processing") ? sessionEvent(session.status, session.payment_status, intentStatus(session)) : null;
  if (session && event) {
    await applyCheckoutSession(session, event);
    order = (await getOrderForUser(orderId, user.id))!;
  } else if (upi && order.status === "pending") {
    await syncRazorpayOrder(order.id);
    order = (await getOrderForUser(orderId, user.id))!;
  }

  const paid = order.status === "paid";
  const processing = order.status === "processing";
  // Stripe has the payment but the webhook hasn't reached us yet: show "confirming" and poll.
  const confirming = order.status === "pending" && session?.status === "complete";
  // UPI: the customer approves in their own app, which can take a minute. Poll until Razorpay has it.
  const approving = upi && order.status === "pending";
  const upiFailed = upi && (order.status === "payment_failed" || order.status === "expired");
  const onItsWay = paid || processing || confirming; // the order will go ahead: show what comes next
  const firstName = user.name.trim().split(/\s+/)[0];
  const email = order.customerEmail ?? user.email;
  const reference = orderReference(order.id);
  const city = (order.shippingAddress as { city?: string | null } | null)?.city;
  const pieces = order.items.reduce((n, i) => n + i.quantity, 0);
  const money = (minor: number) => formatMoney(minor, order.currency);

  // Email is off in development and on the test site (EMAIL_LINKS_ON_PAGE): don't promise a receipt then.
  const receipts = !emailIsOff();
  const [eyebrow, title, body] = paid
    ? ["Order confirmed", null, receipts
        ? `Your order is confirmed and a receipt is on its way to ${email}. Here is what happens now.`
        : "Your order is confirmed. Email is switched off on this site, so no receipt is sent: your order is saved under Account, Orders. Here is what happens now."]
    : confirming
      ? ["Confirming payment", "Confirming your order", "Stripe is confirming your payment with us. This usually takes a few seconds, and your order is safe if you leave this page."]
      : approving
        ? ["Awaiting payment", "Waiting for your approval", "Approve the payment in your UPI app. This page updates by itself."]
        : upiFailed
          ? ["Payment not completed", "Your UPI payment didn't go through", "The UPI request expired or was declined. Nothing was charged, and your bag is saved."]
          : processing
            ? ["Payment processing", "Your payment is processing", "Your bank is confirming the payment. We'll prepare your order as soon as it clears."]
            : order.status === "payment_failed"
              ? ["Payment failed", "Your payment didn't go through", "Your bank declined the payment, so nothing was charged. Your bag is saved: you can try again with another payment method."]
              : order.status === "expired"
                ? ["Checkout expired", "This checkout has expired", "Checkout sessions close after 30 minutes, or when a newer one starts. Nothing was charged and your bag is saved."]
                : [orderStatusCopy[order.status], "This checkout isn't finished", "No payment has been taken. Your bag is saved if you'd like to check out again."];

  const steps = [
    paid
      ? { title: "Confirmed", body: <>{receipts ? <>Your receipt is in {email}. </> : null}Quote <span className="whitespace-nowrap">{reference}</span> whenever you contact us.</> }
      : { title: "Payment", body: receipts ? "We prepare your order as soon as payment is confirmed, and email your receipt." : "We prepare your order as soon as payment is confirmed." },
    { title: "Wrapped and boxed", body: "Every piece is wrapped and boxed in our signature packaging, ready to give." },
    { title: "Express delivery", body: `Complimentary express delivery${city ? ` to ${city}` : ""}, with a signature on arrival.` },
  ];

  return (
    <section className="container-page py-6 md:py-10">
      {paid ? (
        <TrackCharged
          order={{
            order_id: reference,
            gateway: order.provider,
            method: upi ? "upi" : "card",
            total: toMajor(order.amountTotalCents ?? order.subtotalCents, order.currency),
            currency: order.currency,
            market: order.market,
            items_count: pieces,
            transaction: true,
          }}
          items={order.items.map((i) => i.slug)}
        />
      ) : order.status === "payment_failed" ? (
        <TrackEvent name="Payment Failed" properties={{ gateway: order.provider, order_ref: reference }} />
      ) : order.status === "expired" ? (
        <TrackEvent name="Order Expired" properties={{ gateway: order.provider, order_ref: reference }} />
      ) : null}
      <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-12 lg:gap-14">
        {/* Left: the moment. A raised panel in the page's own theme, beside the order on desktop. */}
        <div className="lg:sticky lg:top-[calc(var(--spacing-header)+1.5rem)] lg:col-span-7">
          <div className="flex flex-col bg-surface px-6 py-10 sm:px-10 sm:py-14 lg:px-14 lg:py-16">
            {/* Live region: announces "Confirming" turning into "Thank you" when AutoRefresh re-renders. */}
            <header aria-live="polite">
              <div className="flex items-center gap-4">
                {paid ? (
                  <svg aria-hidden viewBox="0 0 48 48" className="size-11 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.25">
                    <circle cx="24" cy="24" r="23" pathLength={1} strokeDasharray="1" className="motion-safe:animate-draw" />
                    <path d="M15 24.5l6 6 12-13" pathLength={1} strokeDasharray="1" className="motion-safe:animate-draw motion-safe:[animation-delay:600ms]" />
                  </svg>
                ) : confirming || approving || processing ? (
                  <span aria-hidden className="size-5 shrink-0 animate-spin rounded-full border border-current border-t-transparent" />
                ) : null}
                <p className={`label ${order.status === "payment_failed" ? "text-danger" : "text-muted"}`}>
                  {eyebrow} · {reference}
                </p>
              </div>

              {paid ? (
                <h1 className="mt-10 text-display-lg font-medium tracking-tight sm:mt-14">
                  <span className="block motion-safe:animate-rise">Thank you,</span>
                  <span className="block motion-safe:animate-rise motion-safe:[animation-delay:150ms]">{firstName}.</span>
                </h1>
              ) : (
                <h1 className="mt-10 max-w-xl text-display font-medium tracking-tight motion-safe:animate-rise sm:mt-14">{title}</h1>
              )}
              <p className="mt-6 max-w-md text-base leading-relaxed text-muted motion-safe:animate-rise motion-safe:[animation-delay:300ms]">{body}</p>
              {confirming && <AutoRefresh />}
              {/* Approving takes longer than a webhook; stops by itself once the order fails or expires. */}
              {approving && <AutoRefresh everyMs={3000} maxTries={40} />}
            </header>

            {onItsWay && (
              <div className="mt-12 motion-safe:animate-rise motion-safe:[animation-delay:450ms] lg:mt-16">
                <h2 className="label">What happens next</h2>
                <ol className="mt-5 border-t border-line">
                  {steps.map((s, n) => (
                    <li key={s.title} className="grid grid-cols-[2.5rem_1fr] gap-4 border-b border-line py-5">
                      <span className="label pt-0.5 text-muted tabular-nums">0{n + 1}</span>
                      <div>
                        <h3 className="label">{s.title}</h3>
                        <p className="mt-2 text-muted">{s.body}</p>
                      </div>
                    </li>
                  ))}
                </ol>
                <p className="mt-5 text-muted">Changed your mind? Returns are free within 30 days.</p>
              </div>
            )}

            <div className="mt-10 flex flex-col gap-3 sm:flex-row lg:mt-12">
              {onItsWay ? (
                <Link href="/new-arrivals" className="btn btn-primary">Continue shopping</Link>
              ) : (
                <Link href="/bag" className="btn btn-primary">Return to your bag</Link>
              )}
              <Link href={`/account/orders/${order.id}`} className="btn btn-secondary">View in your account</Link>
            </div>
          </div>
        </div>

        {/* Right: what they bought. */}
        <div className="lg:col-span-5 lg:pt-4">
          <div className="flex items-baseline justify-between gap-4 border-b border-line pb-4">
            <h2 className="label">Your order</h2>
            <p className="label text-muted">{pieces} {pieces === 1 ? "piece" : "pieces"}</p>
          </div>
          <ul className={`mt-8 grid gap-x-4 gap-y-10 ${order.items.length === 1 ? "grid-cols-1 sm:max-w-sm" : "grid-cols-2"}`}>
            {order.items.map((i) => (
              <li key={i.id}>
                <Link href={`/products/${i.slug}`} className="group block">
                  <div className="media-product">
                    {i.imageUrl && <Image src={i.imageUrl} alt={i.imageAlt} fill sizes="(min-width: 1024px) 20vw, (min-width: 640px) 40vw, 50vw" />}
                    {i.quantity > 1 && <span className="label absolute top-3 left-3 bg-paper px-2 py-1 tabular-nums">× {i.quantity}</span>}
                  </div>
                  <p className="mt-4 group-hover:underline group-hover:underline-offset-4">{i.name}</p>
                </Link>
                <p className="mt-1 text-muted">{[i.size && `Size ${i.size}`, `Qty ${i.quantity}`].filter(Boolean).join(" · ")}</p>
                <p className="mt-1 tabular-nums">
                  {money(i.unitPriceCents * i.quantity)}
                  {i.quantity > 1 && <span className="text-muted"> · {money(i.unitPriceCents)} each</span>}
                </p>
              </li>
            ))}
          </ul>
          <OrderTotals order={order} className="rule mt-10 pt-6" />
          <OrderDelivery order={order} className="mt-10" />
        </div>
      </div>
    </section>
  );
}
