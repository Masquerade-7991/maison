import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FulfilmentForm } from "@/components/admin/fulfilment-form";
import { OrderDetails } from "@/components/order-details";
import { getAdminOrder } from "@/lib/admin-orders";
import { isUuid } from "@/lib/admin-rules";
import { formatCents } from "@/lib/format";
import { fulfilmentStatusCopy, orderReference, orderStatusCopy, orderStatusTone, refundLabel } from "@/lib/order-rules";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Order | Admin | Maison" };

const date = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

export default async function AdminOrderPage({ params }: PageProps<"/admin/orders/[id]">) {
  const { id } = await params;
  await requireAdmin(`/admin/orders/${encodeURIComponent(id)}`);
  const order = isUuid(id) ? await getAdminOrder(id) : null;
  if (!order) notFound();
  const paid = order.status === "paid";
  const refund = refundLabel(order.refundedCents, order.amountTotalCents ?? order.subtotalCents, formatCents);

  return (
    <>
      <Link href="/admin/orders" className="label link-nav text-muted hover:text-ink">← All orders</Link>
      <header className="mt-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-line pb-6">
        <div>
          <h2 className="text-display-sm">Order {orderReference(order.id)}</h2>
          <p className="mt-2 text-muted">
            {order.customerEmail ?? order.accountEmail} · Placed {date.format(order.createdAt)}
            {order.paidAt && ` · Paid ${date.format(order.paidAt)}`}
          </p>
        </div>
        <p className="label">
          <span className={orderStatusTone[order.status]}>{orderStatusCopy[order.status]}</span>
          {paid && <> · {fulfilmentStatusCopy[order.fulfilmentStatus]}</>}
          {refund && <span className="text-muted"> · {refund}</span>}
        </p>
      </header>

      {order.stockShortfall && (
        <p role="status" className="mt-6 border-l-2 border-danger pl-4 text-danger">
          Oversold: stock ran short when this order was paid. Check the pieces are available before shipping, or cancel and refund.
        </p>
      )}

      <div className="mt-8">
        {!paid ? (
          <p className="border-l-2 border-line pl-4 text-muted">Fulfilment opens once Stripe confirms the payment.</p>
        ) : order.fulfilmentStatus === "unfulfilled" || order.fulfilmentStatus === "shipped" ? (
          <>
            {order.fulfilmentStatus === "shipped" && (
              <p className="mb-6 text-muted">
                Shipped {order.shippedAt && date.format(order.shippedAt)} with {order.carrier}, tracking {order.trackingNumber}.
              </p>
            )}
            <FulfilmentForm orderId={order.id} fulfilment={order.fulfilmentStatus} />
          </>
        ) : order.fulfilmentStatus === "delivered" ? (
          <p className="border-l-2 border-line pl-4 text-muted">
            Delivered {order.deliveredAt && date.format(order.deliveredAt)} ({order.carrier}, tracking {order.trackingNumber}).
          </p>
        ) : (
          <p className="border-l-2 border-line pl-4 text-muted">
            Cancelled {order.cancelledAt && date.format(order.cancelledAt)}. Make sure the refund has been issued in the Stripe Dashboard.
          </p>
        )}
      </div>

      <div className="mt-12">
        <OrderDetails order={order} />
      </div>
    </>
  );
}
