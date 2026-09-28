import type { Metadata } from "next";
import Link from "next/link";
import { formatCents } from "@/lib/format";
import { listOrdersForUser } from "@/lib/orders";
import { orderReference, orderStatusCopy } from "@/lib/order-rules";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Orders | Maison" };

const date = new Intl.DateTimeFormat("en", { dateStyle: "long" });

export default async function OrdersPage() {
  const { user } = await requireUser("/account/orders");
  const orders = await listOrdersForUser(user.id); // scoped to the session's user, never a URL value

  return (
    <>
      <h2 className="label">Orders</h2>
      {orders.length === 0 ? (
        <div className="rule mt-4 py-10">
          <p>You haven&apos;t placed an order yet.</p>
          <p className="mt-2 text-muted">Orders you place will appear here, with their status and details.</p>
          <Link href="/new-arrivals" className="btn btn-primary mt-8">Shop new arrivals</Link>
        </div>
      ) : (
        <ul className="mt-4 border-b border-line">
          {orders.map((o) => (
            <li key={o.id} className="rule">
              <Link
                href={`/account/orders/${o.id}`}
                className="group grid grid-cols-[1fr_auto] items-baseline gap-x-6 gap-y-2 py-5 sm:grid-cols-[9rem_1fr_auto_auto]"
              >
                <span className="label col-start-1 row-start-1 text-muted">{date.format(o.createdAt)}</span>
                <span className="col-start-1 row-start-2 min-w-0 sm:col-start-2 sm:row-start-1">
                  <span className="link-nav group-hover:underline group-hover:underline-offset-4">{orderReference(o.id)}</span>
                  <span className="mt-1 block truncate text-muted">
                    {o.firstItem}
                    {o.pieces > 1 && ` and ${o.pieces - 1} more`}
                  </span>
                </span>
                <span className={`label col-start-2 row-start-1 text-right sm:col-start-3 ${o.status === "payment_failed" ? "text-danger" : o.status === "paid" ? "" : "text-muted"}`}>
                  {orderStatusCopy[o.status]}
                </span>
                <span className="col-start-2 row-start-2 text-right tabular-nums sm:col-start-4 sm:row-start-1">{formatCents(o.totalCents)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
