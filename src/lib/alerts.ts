// "Notify me when it's back": the only module that reads or writes stock_alerts. Signed-in customers only
// (their address is verified). A restock emails everyone waiting once: the rows are claimed (notified_at
// set) by the same statement that reads them, so two admin saves at once can't both send.
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { stockAlerts } from "@/db/schema";
import { sendEmail, siteUrl } from "@/lib/email";
import { backInStockEmail } from "@/lib/emails/templates";
import { formatMoney } from "@/lib/format";
import { getRates } from "@/lib/fx";
import { localPrice, marketById } from "@/lib/markets";

/** Ask (again) to hear when a product is back: a later sell-out can be followed too, so it clears notified_at. */
export async function subscribe(userId: string, productId: string, market: string) {
  await db
    .insert(stockAlerts)
    .values({ userId, productId, market })
    .onConflictDoUpdate({ target: [stockAlerts.userId, stockAlerts.productId], set: { market, notifiedAt: null, createdAt: sql`now()` } });
}

export async function unsubscribe(userId: string, productId: string) {
  await db.delete(stockAlerts).where(and(eq(stockAlerts.userId, userId), eq(stockAlerts.productId, productId)));
}

// The one-click "Stop these emails" link: signed, so it needs no sign-in and can't stop someone else's alert.
const sign = (userId: string, productId: string) =>
  createHmac("sha256", process.env.BETTER_AUTH_SECRET ?? "dev-secret").update(`stock-alert:${userId}:${productId}`).digest("base64url");

export const stopUrl = (userId: string, productId: string) =>
  `${siteUrl()}/api/alerts/stop?u=${encodeURIComponent(userId)}&p=${encodeURIComponent(productId)}&s=${sign(userId, productId)}`;

export function verifyStop(userId: string, productId: string, signature: string) {
  const want = Buffer.from(sign(userId, productId));
  const got = Buffer.from(signature);
  return want.length === got.length && timingSafeEqual(want, got);
}

/**
 * If the product can be bought now (stock above 0, or made to order), claim its waiting alerts and email
 * each person once, priced in the market they asked from. Safe to call after any stock change: when the
 * product is still sold out it matches nothing. Sends one by one (a mailbox allows a few hundred a day);
 * a failed send is in email_log and isn't retried, since the claim already happened.
 */
export async function sendBackInStock(productId: string) {
  const claimed = await db.execute<{
    user_id: string;
    market: string;
    email: string;
    name: string;
    product_name: string;
    slug: string;
    price_cents: number;
    image_url: string | null;
    image_alt: string | null;
  }>(sql`
    with p as (select id, name, slug, price_cents from products where id = ${productId} and (stock_quantity > 0 or made_to_order)),
    c as (
      update stock_alerts a set notified_at = now()
      from p where a.product_id = p.id and a.notified_at is null
      returning a.user_id, a.market
    )
    select c.user_id, c.market, u.email, u.name, p.name as product_name, p.slug, p.price_cents, i.url as image_url, i.alt as image_alt
    from c join "user" u on u.id = c.user_id cross join p
    left join product_images i on i.product_id = p.id and i.position = 0
  `);
  if (claimed.rows.length === 0) return 0;
  const rates = await getRates();
  for (const r of claimed.rows) {
    const market = marketById(r.market);
    const mail = backInStockEmail(siteUrl(), {
      name: r.product_name,
      slug: r.slug,
      price: formatMoney(localPrice(r.price_cents, market, rates), market.currency),
      image: r.image_url,
      imageAlt: r.image_alt ?? r.product_name,
      stopUrl: stopUrl(r.user_id, productId),
    });
    await sendEmail({ ...mail, to: r.email, kind: "stock.back", ref: productId });
  }
  return claimed.rows.length;
}
