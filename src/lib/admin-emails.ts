// Admin views of the shop's email: a preview of every template (built from the latest paid order, so it
// shows real photos, currencies and addresses), the email log for an order, and resending an order email.
// Every exported function checks the role itself (src/app/admin/admin-guard.check.mjs).
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { emailLog, orders } from "@/db/schema";
import { siteUrl } from "@/lib/email";
import {
  backInStockEmail,
  contactAckEmail,
  contactMessageEmail,
  newOrderAdminEmail,
  orderEmail,
  passwordChangedEmail,
  resetPasswordEmail,
  verifyEmail,
  welcomeEmail,
  type OrderEmailKind,
} from "@/lib/emails/templates";
import { formatMoney } from "@/lib/format";
import { getOrder, notifyCustomer } from "@/lib/orders";
import { assertAdmin } from "@/lib/session";

export type Preview = { id: string; group: string; title: string; subject: string; html: string };

export async function emailPreviews(): Promise<Preview[]> {
  await assertAdmin();
  const site = siteUrl();
  const sampleLink = `${site}/verify-email?token=sample`;
  const out: Preview[] = [];
  const add = (group: string, title: string, e: { subject: string; html: string }) =>
    out.push({ id: `${group}-${title}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"), group, title, subject: e.subject, html: e.html });

  add("Account", "Verify your email", verifyEmail(site, "Ana Sousa", sampleLink));
  add("Account", "Welcome", welcomeEmail(site, "Ana Sousa"));
  add("Account", "Reset password", resetPasswordEmail(site, "Ana Sousa", `${site}/reset-password?token=sample`));
  add("Account", "Password changed", passwordChangedEmail(site, "Ana Sousa"));

  const [latest] = await db.select({ id: orders.id }).from(orders).where(eq(orders.status, "paid")).orderBy(desc(orders.paidAt)).limit(1);
  const order = latest ? await getOrder(latest.id) : null;
  if (order) {
    const total = order.amountTotalCents ?? order.subtotalCents;
    const samples: [OrderEmailKind, string, typeof order][] = [
      ["confirmed", "Order confirmed", order],
      ["processing", "Payment processing", order],
      ["payment_failed", "Payment didn't go through", order],
      ["shipped", "Shipped", { ...order, carrier: order.carrier ?? "UPS", trackingNumber: order.trackingNumber ?? "1Z999AA10123456784" }],
      ["delivered", "Delivered", order],
      ["cancelled", "Cancelled", order],
      ["refunded", "Refunded", { ...order, refundedCents: Math.round(total / 2) }],
    ];
    for (const [kind, title, o] of samples) add("Order thread", title, orderEmail(site, o, kind, order.accountName));
    add("Business inbox", "New order", newOrderAdminEmail(site, order));
    const item = order.items[0];
    add(
      "Back in stock",
      "Back in stock",
      backInStockEmail(site, {
        name: item.name,
        slug: item.slug,
        price: formatMoney(item.unitPriceCents, order.currency),
        image: item.imageUrl,
        imageAlt: item.imageAlt,
        stopUrl: `${site}/api/alerts/stop?sample`,
      }),
    );
  }
  add("Contact", "We got your message", contactAckEmail(site, "Ana Sousa", "Returns", "MSN-1A2B3C4D"));
  add(
    "Business inbox",
    "Contact message",
    contactMessageEmail(site, { name: "Ana Sousa", email: "ana@example.com", topic: "Returns", orderRef: "MSN-1A2B3C4D", message: "Hello,\n\nCould I return the coat in a smaller size?\n\nThank you, Ana" }),
  );
  return out;
}

/** The emails recorded for an order (or any ref), newest first. */
export async function emailLogFor(ref: string) {
  await assertAdmin();
  return db.select().from(emailLog).where(eq(emailLog.ref, ref)).orderBy(desc(emailLog.createdAt)).limit(20);
}

/** Sends an order email again, in the same thread. */
export async function resendOrderEmail(orderId: string, kind: OrderEmailKind) {
  await assertAdmin();
  await notifyCustomer(orderId, kind, true);
}
