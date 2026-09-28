import Image from "next/image";
import Link from "next/link";
import { formatCents } from "@/lib/format";
import type { getOrderForUser } from "@/lib/orders";

export type Order = NonNullable<Awaited<ReturnType<typeof getOrderForUser>>>;
type Address = { line1?: string | null; line2?: string | null; city?: string | null; state?: string | null; postal_code?: string | null; country?: string | null };

// Items, totals and delivery for one order (the account's order page). The checkout confirmation
// shows its items as a catalogue and reuses OrderTotals and OrderDelivery below.
export function OrderDetails({ order }: { order: Order }) {
  return (
    <div className="grid gap-10 xl:grid-cols-12">
      <div className="xl:col-span-7">
        <h2 className="label">Items</h2>
        <ul className="mt-4 border-t border-line">
          {order.items.map((i) => (
            <li key={i.id} className="grid grid-cols-[4.5rem_1fr_auto] items-start gap-5 border-b border-line py-5">
              <div className="media-product">
                {i.imageUrl && <Image src={i.imageUrl} alt={i.imageAlt} fill sizes="4.5rem" />}
              </div>
              <div className="min-w-0">
                <Link href={`/products/${i.slug}`} className="link-nav">{i.name}</Link>
                <p className="mt-1 text-muted">
                  {[i.size && `Size ${i.size}`, `Qty ${i.quantity}`].filter(Boolean).join(" · ")}
                </p>
                {i.quantity > 1 && <p className="mt-1 text-muted tabular-nums">{formatCents(i.unitPriceCents)} each</p>}
              </div>
              <p className="tabular-nums">{formatCents(i.unitPriceCents * i.quantity)}</p>
            </li>
          ))}
        </ul>
        <OrderTotals order={order} className="mt-5" />
      </div>
      <OrderDelivery order={order} className="xl:col-span-5 self-start" />
    </div>
  );
}

export function OrderTotals({ order, className = "" }: { order: Order; className?: string }) {
  return (
    <dl className={`space-y-3 ${className}`}>
      <div className="flex justify-between"><dt>Subtotal</dt><dd className="tabular-nums">{formatCents(order.subtotalCents)}</dd></div>
      <div className="flex justify-between"><dt>Shipping</dt><dd className="text-muted">Complimentary</dd></div>
      <div className="rule flex items-baseline justify-between pt-4">
        <dt className="label">{order.status === "paid" ? "Paid" : "Total"}</dt>
        <dd className="text-display-sm tabular-nums">{formatCents(order.amountTotalCents ?? order.subtotalCents)}</dd>
      </div>
    </dl>
  );
}

export function OrderDelivery({ order, className = "" }: { order: Order; className?: string }) {
  const address = order.shippingAddress as Address | null;
  return (
    <div className={`bg-surface p-6 md:p-8 ${className}`}>
      <h2 className="label">Delivery</h2>
      {address ? (
        <address className="mt-4 not-italic leading-relaxed">
          {order.shippingName && <>{order.shippingName}<br /></>}
          {address.line1}<br />
          {address.line2 && <>{address.line2}<br /></>}
          {[address.city, address.state, address.postal_code].filter(Boolean).join(", ")}<br />
          {address.country}
        </address>
      ) : (
        <p className="mt-4 text-muted">{order.status === "paid" ? "No delivery address was recorded." : "Shown here once payment is confirmed."}</p>
      )}
      <p className="mt-6 text-muted">Complimentary express delivery, with signature on arrival.</p>
    </div>
  );
}
