// The customer emails about an order, as plain text. Sent by notifyCustomer in src/lib/orders.ts.
import { formatCents } from "@/lib/format";
import { orderReference } from "@/lib/order-rules";
import type { getOrder } from "@/lib/orders";

type Order = NonNullable<Awaited<ReturnType<typeof getOrder>>>;
export type OrderEmail = "confirmed" | "shipped" | "cancelled" | "refunded";

export function orderEmail(order: Order, kind: OrderEmail) {
  const to = order.customerEmail ?? order.accountEmail;
  const ref = orderReference(order.id);
  const link = `${process.env.BETTER_AUTH_URL ?? ""}/account/orders/${order.id}`;
  const footer = `View your order: ${link}\n\nMaison client services. Quote ${ref} whenever you contact us.`;

  if (kind === "shipped") {
    return {
      to,
      subject: `Your Maison order ${ref} has shipped`,
      text: `Your order ${ref} is on its way, by complimentary express delivery with a signature on arrival.\n\nCarrier: ${order.carrier}\nTracking number: ${order.trackingNumber}\n\n${footer}`,
    };
  }
  if (kind === "cancelled") {
    return {
      to,
      subject: `Your Maison order ${ref} has been cancelled`,
      text: `Your order ${ref} has been cancelled and will not be sent. Your payment of ${formatCents(order.amountTotalCents ?? order.subtotalCents)} will be refunded to your original payment method.\n\n${footer}`,
    };
  }
  if (kind === "refunded") {
    const total = order.amountTotalCents ?? order.subtotalCents;
    const amount = order.refundedCents >= total ? `your payment of ${formatCents(total)}` : `${formatCents(order.refundedCents)} of your payment`;
    return {
      to,
      subject: `A refund for your Maison order ${ref}`,
      text: `We have refunded ${amount} for order ${ref} to your original payment method. It may take 5 to 10 business days to appear on your statement.

${footer}`,
    };
  }
  const lines = order.items.map((i) => `${i.quantity} × ${i.name}${i.size ? ` (size ${i.size})` : ""}  ${formatCents(i.unitPriceCents * i.quantity)}`);
  return {
    to,
    subject: `Your Maison order ${ref} is confirmed`,
    text: `Thank you for your order. Your payment is confirmed and we are preparing your pieces.\n\nOrder ${ref}\n${lines.join("\n")}\nShipping: Complimentary\nTotal paid: ${formatCents(order.amountTotalCents ?? order.subtotalCents)}\n\nWe will email you again when your order ships.\n\n${footer}`,
  };
}
