import type { Metadata } from "next";
import Link from "next/link";
import { listAdminOrders } from "@/lib/admin-orders";
import { formatCents } from "@/lib/format";
import {
  fulfilmentStatusCopy,
  orderReference,
  orderStatusCopy,
  orderStatusTone,
  refundLabel,
  type FulfilmentStatus,
  type OrderStatus,
} from "@/lib/order-rules";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Orders | Admin | Maison" };

const date = new Intl.DateTimeFormat("en", { dateStyle: "medium" });
const STATUSES: OrderStatus[] = ["paid", "processing", "pending", "payment_failed"]; // expired checkouts are never listed
const FULFILMENTS = Object.keys(fulfilmentStatusCopy) as FulfilmentStatus[];

export default async function AdminOrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  await requireAdmin("/admin/orders");
  const sp = await searchParams;
  const status = STATUSES.find((s) => s === sp.status);
  const fulfilment = FULFILMENTS.find((f) => f === sp.fulfilment);
  const orders = await listAdminOrders({ status, fulfilment });
  const filtered = Boolean(status || fulfilment);

  return (
    <>
      <h2 className="label">Orders ({orders.length})</h2>

      <form role="search" className="mt-6 grid gap-4 sm:grid-cols-[14rem_14rem_auto] sm:items-end">
        <div>
          <label htmlFor="status" className="label text-muted">Payment</label>
          <select id="status" name="status" defaultValue={status ?? ""} className="field">
            <option value="">All payments</option>
            {STATUSES.map((s) => <option key={s} value={s}>{orderStatusCopy[s]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="fulfilment" className="label text-muted">Fulfilment</label>
          <select id="fulfilment" name="fulfilment" defaultValue={fulfilment ?? ""} className="field">
            <option value="">All fulfilment</option>
            {FULFILMENTS.map((f) => <option key={f} value={f}>{fulfilmentStatusCopy[f]}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-5">
          <button type="submit" className="btn btn-secondary w-auto px-8">Filter</button>
          {filtered && <Link href="/admin/orders" className="label link">Clear</Link>}
        </div>
      </form>

      {orders.length === 0 ? (
        <p className="rule mt-8 py-10">{filtered ? "No orders match these filters." : "There are no orders yet."}</p>
      ) : (
        <ul className="mt-8 border-b border-line">
          <li aria-hidden className="label hidden grid-cols-[9rem_1fr_5rem_8rem_10rem_8rem] gap-6 border-t border-line py-3 text-muted lg:grid">
            <span>Order</span><span>Customer</span><span className="text-right">Pieces</span><span className="text-right">Total</span><span>Payment</span><span>Fulfilment</span>
          </li>
          {orders.map((o) => (
            <li key={o.id} className="rule">
              <Link
                href={`/admin/orders/${o.id}`}
                className="group grid grid-cols-[1fr_auto] items-baseline gap-x-5 gap-y-1 py-4 lg:grid-cols-[9rem_1fr_5rem_8rem_10rem_8rem] lg:gap-x-6"
              >
                <span>
                  <span className="block group-hover:underline group-hover:underline-offset-4">{orderReference(o.id)}</span>
                  <span className="block text-muted">{date.format(o.createdAt)}</span>
                </span>
                <span className="min-w-0 truncate text-right text-muted lg:text-left">{o.email}</span>
                <span className="hidden text-right tabular-nums lg:block">{o.pieces}</span>
                <span className="text-right tabular-nums">{formatCents(o.totalCents)}</span>
                <span className={`label ${orderStatusTone[o.status]}`}>{orderStatusCopy[o.status]}</span>
                <span className="label col-span-2 flex flex-wrap gap-x-3 lg:col-span-1">
                  {o.status === "paid" ? fulfilmentStatusCopy[o.fulfilmentStatus] : <span className="text-muted">—</span>}
                  {o.stockShortfall && <span className="text-danger">Oversold</span>}
                  {o.refundedCents > 0 && <span className="text-muted">{refundLabel(o.refundedCents, o.totalCents, formatCents)}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
