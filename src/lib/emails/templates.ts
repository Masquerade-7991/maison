// Every email the shop sends, built from the one frame in layout.ts so they all look like the site.
// Builders take plain data and return { subject, html, text } (+ headers for the order thread); they
// never send. src/app/admin/emails renders each with sample data.
import { formatMoney } from "@/lib/format";
import { orderReference } from "@/lib/order-rules";
import type { getOrder } from "@/lib/orders";
import { emailImage, renderEmail, type Block, type Email } from "./layout.ts";
import { orderSubject, orderThreadHeaders, trackingUrl } from "./rules.ts";

export type OrderForEmail = NonNullable<Awaited<ReturnType<typeof getOrder>>>;
export type OrderEmailKind = "confirmed" | "processing" | "payment_failed" | "shipped" | "delivered" | "cancelled" | "refunded";

const host = (site: string) => new URL(site).host;
const firstName = (name: string | null | undefined) => name?.trim().split(/\s+/)[0] || "there";

// ── Account ────────────────────────────────────────────────────────────────────────────────────────────

export function verifyEmail(site: string, name: string, url: string): Email {
  return renderEmail({
    site,
    subject: "Confirm your email for Maison",
    preheader: "One click to confirm your email and sign in.",
    blocks: [
      { t: "label", text: "Your account" },
      { t: "title", text: "Confirm your email" },
      { t: "p", text: `Welcome, ${firstName(name)}. Confirm this is your email address and you'll be signed straight in.` },
      { t: "button", text: "Confirm email", href: url },
      { t: "p", muted: true, text: "The link works once and expires in an hour. If you didn't create a Maison account, ignore this email." },
    ],
    reason: "You're receiving this because this address was used to create a Maison account.",
  });
}

export function resetPasswordEmail(site: string, name: string, url: string): Email {
  return renderEmail({
    site,
    subject: "Reset your Maison password",
    preheader: "Choose a new password. The link expires in an hour.",
    blocks: [
      { t: "label", text: "Your account" },
      { t: "title", text: "Choose a new password" },
      { t: "p", text: `Hello ${firstName(name)}, use the button below to choose a new password for your Maison account.` },
      { t: "button", text: "Choose a new password", href: url },
      { t: "p", muted: true, text: "The link works once and expires in an hour. Saving a new password signs you out on every device. If you didn't ask for this, ignore this email: your password stays the same." },
    ],
    reason: "You're receiving this because a password reset was requested for this address.",
  });
}

export function welcomeEmail(site: string, name: string): Email {
  return renderEmail({
    site,
    subject: "Welcome to Maison",
    preheader: "Your account is ready. A note on how we work.",
    blocks: [
      { t: "label", text: "Welcome" },
      { t: "title", text: `Welcome to the house, ${firstName(name)}` },
      { t: "p", text: "Your account is confirmed. Since 1987 we have made fewer things, slowly, and made them to be kept: every piece is signed by the hands that made it, and can come home to be repaired for as long as it is loved." },
      { t: "button", text: "Discover new arrivals", href: `${site}/new-arrivals` },
      { t: "rule" },
      { t: "box", heading: "With every order", lines: ["Complimentary express delivery", "Returns within 30 days", "Signature packaging, ready to give"] },
      { t: "link", text: "Read the stories behind our pieces", href: `${site}/stories` },
    ],
    reason: "You're receiving this because you created a Maison account.",
  });
}

export function passwordChangedEmail(site: string, name: string): Email {
  return renderEmail({
    site,
    subject: "Your Maison password was changed",
    preheader: "If this was you, there's nothing to do.",
    blocks: [
      { t: "label", text: "Security" },
      { t: "title", text: "Your password was changed" },
      { t: "p", text: `Hello ${firstName(name)}, the password for your Maison account was just changed, and you were signed out on every device. If this was you, there's nothing more to do.` },
      { t: "note", tone: "danger", text: "If you didn't change it, reset your password now and write to us so we can secure your account." },
      { t: "button", text: "Reset password", href: `${site}/forgot-password` },
      { t: "link", text: "Write to us", href: `${site}/contact` },
    ],
    reason: "You're receiving this because the password on this account changed. We send it every time, for your security.",
  });
}

// ── Orders (one thread per order) ──────────────────────────────────────────────────────────────────────

const ORDER_COPY: Record<OrderEmailKind, { label: string; title: (n: string) => string; preheader: string }> = {
  confirmed: { label: "Order confirmed", title: (n) => `Thank you, ${n}`, preheader: "Your order is confirmed and we're preparing your pieces." },
  processing: { label: "Payment processing", title: () => "Your payment is processing", preheader: "Your bank is confirming the payment. We'll prepare your order once it clears." },
  payment_failed: { label: "Payment unsuccessful", title: () => "Your payment didn't go through", preheader: "Nothing was charged and your bag is saved." },
  shipped: { label: "Shipped", title: () => "Your order is on its way", preheader: "Your pieces have left our workshop." },
  delivered: { label: "Delivered", title: () => "Your order has arrived", preheader: "Your pieces have been delivered. We hope you love them." },
  cancelled: { label: "Cancelled", title: () => "Your order has been cancelled", preheader: "Your order won't be sent and your payment will be refunded." },
  refunded: { label: "Refund issued", title: () => "We've issued your refund", preheader: "Your refund is on its way to your original payment method." },
};

function addressLines(order: OrderForEmail): string[] {
  const a = order.shippingAddress as { line1?: string; line2?: string; city?: string; state?: string; postal_code?: string; country?: string } | null;
  if (!a) return [];
  const country = a.country ? (new Intl.DisplayNames(["en"], { type: "region" }).of(a.country) ?? a.country) : "";
  return [order.shippingName ?? "", a.line1 ?? "", a.line2 ?? "", [a.city, a.state, a.postal_code].filter(Boolean).join(" "), country].filter(Boolean);
}

/** An order email in the order's thread (same subject, replying to the confirmation). */
export function orderEmail(site: string, order: OrderForEmail, kind: OrderEmailKind, name: string, resend = false): Email & { headers: Record<string, string> } {
  const ref = orderReference(order.id);
  const money = (minor: number) => formatMoney(minor, order.currency);
  const total = order.amountTotalCents ?? order.subtotalCents;
  const copy = ORDER_COPY[kind];
  const orderUrl = `${site}/account/orders/${order.id}`;
  const items: Block = {
    t: "items",
    items: order.items.map((i) => ({
      name: i.name,
      meta: [i.size && `Size ${i.size}`, `Qty ${i.quantity}`].filter(Boolean).join(" · "),
      price: money(i.unitPriceCents * i.quantity),
      image: emailImage(i.imageUrl, 72),
      imageAlt: i.imageAlt,
    })),
  };
  const totals: Block = { t: "rows", rows: [["Subtotal", money(order.subtotalCents)], ["Shipping", "Complimentary"]], total: ["Total", money(total)] };
  const address = addressLines(order);

  const body: Block[] = (() => {
    switch (kind) {
      case "confirmed":
        return [
          { t: "p", text: `Your payment is confirmed and we're preparing your pieces. Order ${ref}.` },
          items,
          totals,
          ...(address.length ? [{ t: "box", heading: "Delivering to", lines: address } as Block] : []),
          { t: "button", text: "View your order", href: orderUrl },
          { t: "p", muted: true, text: "We'll write again, in this same thread, when your order ships." },
        ];
      case "processing":
        return [
          { t: "p", text: `Your bank is still confirming the payment for order ${ref}. This can take a few days for some payment methods. We'll prepare your order as soon as it clears, and email you either way.` },
          items,
          totals,
          { t: "button", text: "View your order", href: orderUrl },
        ];
      case "payment_failed":
        return [
          { t: "p", text: `Your bank declined the payment for order ${ref}, so nothing was charged. Your pieces are still in your bag if you'd like to try again with another payment method.` },
          { t: "button", text: "Return to your bag", href: `${site}/bag` },
        ];
      case "shipped": {
        const track = trackingUrl(order.carrier, order.trackingNumber);
        return [
          { t: "p", text: `Order ${ref} is on its way by complimentary express delivery, with a signature on arrival.` },
          { t: "box", heading: "Tracking", lines: [order.carrier ?? "", order.trackingNumber ? `Tracking number ${order.trackingNumber}` : ""].filter(Boolean) },
          ...(track ? [{ t: "button", text: "Track your parcel", href: track } as Block] : []),
          items,
          ...(address.length ? [{ t: "box", heading: "Delivering to", lines: address } as Block] : []),
          { t: "link", text: "View your order", href: orderUrl },
        ];
      }
      case "delivered":
        return [
          { t: "p", text: `Order ${ref} has been delivered. We hope your pieces feel as good as they did leaving the workshop.` },
          items,
          { t: "box", heading: "Keep them for life", lines: ["Leather, wool and gold all age well with a little care.", "Returns are free within 30 days, and repairs for as long as you own them."] },
          { t: "button", text: "How to care for your pieces", href: `${site}/stories/the-care-of-leather` },
          { t: "link", text: "View your order", href: orderUrl },
        ];
      case "cancelled":
        return [
          { t: "p", text: `Order ${ref} has been cancelled and won't be sent. Your payment of ${money(total)} will be refunded to your original payment method.` },
          { t: "link", text: "View your order", href: orderUrl },
        ];
      case "refunded": {
        const amount = order.refundedCents >= total ? `your payment of ${money(total)}` : `${money(order.refundedCents)} of your payment`;
        return [
          { t: "p", text: `We've refunded ${amount} for order ${ref} to your original payment method. It can take 5 to 10 business days to appear on your statement.` },
          { t: "link", text: "View your order", href: orderUrl },
        ];
      }
    }
  })();

  const email = renderEmail({
    site,
    subject: orderSubject(ref),
    preheader: copy.preheader,
    blocks: [{ t: "label", text: copy.label }, { t: "title", text: copy.title(firstName(name)) }, ...body, { t: "p", muted: true, text: `Questions? Reply to this email or quote ${ref} when you write to us.` }],
    reason: `You're receiving this about your Maison order ${ref}.`,
  });
  return { ...email, headers: orderThreadHeaders(order.id, kind, host(site), resend) };
}

// ── Back in stock ──────────────────────────────────────────────────────────────────────────────────────

export function backInStockEmail(site: string, p: { name: string; slug: string; price: string; image: string | null; imageAlt: string; stopUrl: string }): Email {
  return renderEmail({
    site,
    subject: `${p.name} is back`,
    preheader: "The piece you asked about is available again, in limited numbers.",
    blocks: [
      { t: "label", text: "Back in stock" },
      { t: "title", text: `${p.name} is back` },
      { t: "p", text: "You asked us to tell you when this piece returned. It's available again now, in limited numbers, and pieces aren't held: they go to whoever checks out first." },
      { t: "items", items: [{ name: p.name, price: p.price, image: emailImage(p.image, 72), imageAlt: p.imageAlt }] },
      { t: "button", text: "Shop now", href: `${site}/products/${p.slug}` },
      { t: "link", text: "Stop these emails", href: p.stopUrl },
    ],
    reason: "You're receiving this because you asked to hear when this piece was back. We email once per request.",
  });
}

// ── Contact ────────────────────────────────────────────────────────────────────────────────────────────

/** To the visitor. It repeats the topic, never their message, so the form can't relay text to strangers. */
export function contactAckEmail(site: string, name: string, topic: string, orderRef: string | null): Email {
  return renderEmail({
    site,
    subject: "We've received your message",
    preheader: "Client services will reply within one working day.",
    blocks: [
      { t: "label", text: "Client services" },
      { t: "title", text: `Thank you, ${firstName(name)}` },
      { t: "p", text: "We've received your message and a member of client services will reply within one working day." },
      { t: "box", heading: "Your message", lines: [`Topic: ${topic}`, ...(orderRef ? [`Order: ${orderRef}`] : [])] },
      { t: "link", text: "Browse the stories while you wait", href: `${site}/stories` },
    ],
    reason: "You're receiving this because this address was used on the Maison contact form.",
  });
}

/** To the business inbox: the visitor's message, with Reply-To set to the visitor by the caller. */
export function contactMessageEmail(site: string, m: { name: string; email: string; topic: string; orderRef: string | null; message: string }): Email {
  return renderEmail({
    site,
    subject: `Contact: ${m.topic}${m.orderRef ? ` (${m.orderRef})` : ""} from ${m.name}`,
    preheader: m.message.slice(0, 120),
    blocks: [
      { t: "label", text: `Contact form · ${m.topic}` },
      { t: "title", text: m.name },
      { t: "box", heading: "From", lines: [m.email, ...(m.orderRef ? [`Order ${m.orderRef}`] : [])] },
      ...m.message.split(/\n{2,}/).map((para): Block => ({ t: "p", text: para })),
      { t: "p", muted: true, text: `Reply to this email to answer ${m.email}.` },
    ],
  });
}

// ── Admin ──────────────────────────────────────────────────────────────────────────────────────────────

export function newOrderAdminEmail(site: string, order: OrderForEmail): Email {
  const ref = orderReference(order.id);
  const money = (minor: number) => formatMoney(minor, order.currency);
  const pieces = order.items.reduce((n, i) => n + i.quantity, 0);
  return renderEmail({
    site,
    subject: `${order.stockShortfall ? "Oversold: " : ""}New order ${ref}: ${money(order.amountTotalCents ?? order.subtotalCents)}`,
    preheader: `${pieces} ${pieces === 1 ? "piece" : "pieces"} for ${order.customerEmail ?? order.accountEmail}`,
    blocks: [
      { t: "label", text: "New order" },
      { t: "title", text: `${ref} is paid` },
      ...(order.stockShortfall ? [{ t: "note", tone: "danger", text: "Oversold: stock ran short when this order was paid. Check the pieces before shipping." } as Block] : []),
      { t: "p", text: `${order.customerEmail ?? order.accountEmail} paid ${money(order.amountTotalCents ?? order.subtotalCents)} (${order.currency.toUpperCase()}).` },
      { t: "items", items: order.items.map((i) => ({ name: i.name, meta: [i.size && `Size ${i.size}`, `Qty ${i.quantity}`].filter(Boolean).join(" · "), price: money(i.unitPriceCents * i.quantity), image: emailImage(i.imageUrl, 72), imageAlt: i.imageAlt })) },
      { t: "button", text: "Open in admin", href: `${site}/admin/orders/${order.id}` },
    ],
  });
}

// ── Account deletion ───────────────────────────────────────────────────────────────────────────────────

const longDate = (d: Date) => new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" }).format(d);

export function deletionScheduledEmail(site: string, name: string, scheduledFor: Date): Email {
  return renderEmail({
    site,
    subject: "Your Maison account will be deleted",
    preheader: `Your account will be deleted on ${longDate(scheduledFor)}. Sign in before then to keep it.`,
    blocks: [
      { t: "label", text: "Account deletion" },
      { t: "title", text: "We're sorry to see you go" },
      { t: "p", text: `Hello ${firstName(name)}, we've received your request. Your Maison account will be deleted automatically on ${longDate(scheduledFor)}, and you've been signed out on every device.` },
      { t: "box", heading: "Changed your mind?", lines: [`Sign in before ${longDate(scheduledFor)} and choose "Keep my account". Everything stays as it was.`] },
      { t: "button", text: "Keep my account", href: `${site}/account` },
      { t: "p", muted: true, text: "When the account is deleted, your details, bag and alerts are removed. Records of past orders are kept, without your name or email, because we're required to keep them for accounting." },
      { t: "note", tone: "danger", text: "If you didn't ask for this, sign in now and keep your account, then change your password." },
    ],
    reason: "You're receiving this because deletion was requested for this Maison account.",
  });
}

export function deletionCancelledEmail(site: string, name: string): Email {
  return renderEmail({
    site,
    subject: "Your Maison account is staying",
    preheader: "Account deletion cancelled. Everything is as it was.",
    blocks: [
      { t: "label", text: "Account deletion" },
      { t: "title", text: `Welcome back, ${firstName(name)}` },
      { t: "p", text: "You've cancelled the deletion of your Maison account. Your details, orders and bag are just as you left them." },
      { t: "button", text: "Go to your account", href: `${site}/account` },
    ],
    reason: "You're receiving this because account deletion was cancelled for this address.",
  });
}

export function accountDeletedEmail(site: string, name: string): Email {
  return renderEmail({
    site,
    subject: "Your Maison account has been deleted",
    preheader: "Your account and personal details have been removed.",
    blocks: [
      { t: "label", text: "Account deletion" },
      { t: "title", text: "Your account has been deleted" },
      { t: "p", text: `Goodbye for now, ${firstName(name)}. As you asked, your Maison account, details, bag and alerts have been removed. Records of past orders are kept without your name or email, as accounting rules require.` },
      { t: "p", muted: true, text: "This is the last email we'll send to this address. You're always welcome to create a new account." },
      { t: "link", text: "Visit Maison", href: site },
    ],
    reason: "You're receiving this because this Maison account was deleted at your request.",
  });
}
