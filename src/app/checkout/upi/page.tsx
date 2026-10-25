import type { Metadata } from "next";
import Link from "next/link";
import { UpiCheckoutForm } from "@/components/upi-checkout-form";
import { INDIAN_STATES, UPI_MAX_PAISE, upiAllowed } from "@/lib/address-rules";
import { getBag } from "@/lib/cart";
import { formatMoney } from "@/lib/format";
import { getMarket } from "@/lib/market-server";
import { lastShippingFor } from "@/lib/orders";
import { razorpayUpiReady } from "@/lib/razorpay";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Pay by UPI | Maison", robots: { index: false } };

const pieces = (n: number) => `${n} ${n === 1 ? "piece" : "pieces"}`;

// Razorpay's window doesn't collect an address the way Stripe's page does, so UPI orders take it here
// first. The bag is read again on submit; this page only shows it and decides whether UPI is open.
export default async function UpiCheckoutPage() {
  const { user } = await requireUser("/checkout/upi");
  const market = await getMarket();
  const bag = await getBag(user.id, market);

  const reason =
    bag.lines.length === 0
      ? "Your bag is empty, so there is nothing to pay for yet."
      : bag.hasIssues
        ? "Availability has changed for some pieces in your bag. Please review them before paying."
        : !(await razorpayUpiReady()) || !upiAllowed(market.id, bag.currency, UPI_MAX_PAISE)
          ? "Payment by UPI isn't available for this bag. You can pay by card from your bag."
          : !upiAllowed(market.id, bag.currency, bag.subtotalCents)
            ? `UPI is available for orders up to ${formatMoney(UPI_MAX_PAISE, "INR")}. You can pay by card from your bag.`
            : null;

  // Filled in from the last order's delivery details where there are some (Indian addresses only).
  const last = reason ? null : await lastShippingFor(user.id);
  const address = last?.address?.country === "IN" ? last.address : null;
  const defaults = {
    name: last?.name ?? user.name,
    phone: last?.phone?.replace(/^\+?91(?=\d{10}$)/, "") ?? "",
    line1: address?.line1 ?? "",
    line2: address?.line2 ?? "",
    city: address?.city ?? "",
    state: address?.state && INDIAN_STATES.includes(address.state) ? address.state : "", // a value off the list would silently select its first state
    postalCode: address?.postal_code ?? "",
  };

  return (
    <section className="container-page py-12 md:py-20">
      <header className="flex items-end justify-between gap-6 border-b border-line pb-8 md:pb-10">
        <div>
          <p className="label text-muted">Checkout</p>
          <h1 className="mt-3 text-display-sm">Pay by UPI</h1>
        </div>
        <Link href="/bag" className="label link hidden sm:inline">Back to bag</Link>
      </header>

      {reason ? (
        <div className="mx-auto max-w-md py-16 text-center md:py-24">
          <p className="text-muted">{reason}</p>
          <Link href="/bag" className="btn btn-primary mt-10">Return to your bag</Link>
        </div>
      ) : (
        <div className="grid gap-12 pt-8 lg:grid-cols-12 lg:gap-16 md:pt-10">
          <div className="lg:col-span-7">
            <UpiCheckoutForm defaults={defaults} />
          </div>
          <aside className="self-start bg-surface p-6 md:p-8 lg:col-span-5 lg:max-w-md lg:justify-self-end lg:w-full">
            <h2 className="label">Order summary</h2>
            <dl className="mt-6 space-y-3">
              <div className="flex justify-between gap-4">
                <dt>Subtotal <span className="text-muted">({pieces(bag.payableCount)})</span></dt>
                <dd className="tabular-nums">{formatMoney(bag.subtotalCents, bag.currency)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Shipping</dt>
                <dd className="text-muted">Complimentary</dd>
              </div>
              <div className="rule mt-5 flex items-baseline justify-between gap-4 pt-5">
                <dt className="label">Total</dt>
                <dd className="text-display-sm tabular-nums">{formatMoney(bag.subtotalCents, bag.currency)}</dd>
              </div>
            </dl>
            <p className="mt-4 text-muted">Paid in {bag.currency} by UPI, through Razorpay.</p>
            <Link href="/bag" className="label link mt-6 inline-block">Edit bag</Link>
          </aside>
        </div>
      )}
    </section>
  );
}
