// Test-data helper for the e2e scripts (run with `npx tsx scripts/e2e/db.mts <command>`). It talks to the
// same database as the app (the shared Neon `production` branch), so every command either reads or undoes
// what a test did. Only touches accounts whose email starts with `qa.`.
import "dotenv/config";
import { and, eq, inArray, like, sql } from "drizzle-orm";
const { db } = await import("../../src/db");
const { orderItems, orders, products, user } = await import("../../src/db/schema");
const { stripe } = await import("../../src/lib/stripe");

const [cmd, ...args] = process.argv.slice(2);
const testUser = async (email: string) => {
  if (!email.startsWith("qa.")) throw new Error(`refusing to touch non-test account ${email}`);
  const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  return u ?? null;
};

switch (cmd) {
  case "stock:get": {
    const [p] = await db.select({ stock: products.stockQuantity }).from(products).where(eq(products.slug, args[0]));
    console.log(p?.stock ?? "missing");
    break;
  }
  case "stock:set": {
    await db.update(products).set({ stockQuantity: Number(args[1]) }).where(eq(products.slug, args[0]));
    console.log("ok");
    break;
  }
  case "orders": {
    // Compact JSON of a test user's orders, oldest first.
    const u = await testUser(args[0]);
    const rows = u
      ? await db.select({ id: orders.id, status: orders.status, session: orders.stripeCheckoutSessionId }).from(orders).where(eq(orders.userId, u.id)).orderBy(orders.createdAt)
      : [];
    console.log(JSON.stringify(rows));
    break;
  }
  case "cleanup": {
    // For each test account: put back the stock its paid orders took, close any Stripe session still open,
    // then delete its orders (items cascade) and the account (sessions, bag cascade).
    for (const email of args) {
      const u = await testUser(email);
      if (!u) continue;
      const list = await db.select({ id: orders.id, status: orders.status, session: orders.stripeCheckoutSessionId }).from(orders).where(eq(orders.userId, u.id));
      for (const o of list) {
        if (o.status === "paid") {
          const items = await db.select({ productId: orderItems.productId, q: orderItems.quantity }).from(orderItems).where(eq(orderItems.orderId, o.id));
          for (const i of items) if (i.productId) await db.update(products).set({ stockQuantity: sql`${products.stockQuantity} + ${i.q}` }).where(eq(products.id, i.productId));
        }
        if (o.session?.startsWith("cs_test_a")) {
          try {
            const s = await stripe().checkout.sessions.retrieve(o.session);
            if (s.status === "open") await stripe().checkout.sessions.expire(o.session);
          } catch {
            // already gone
          }
        }
      }
      if (list.length) await db.delete(orders).where(inArray(orders.id, list.map((o) => o.id)));
      await db.delete(user).where(eq(user.id, u.id));
      console.log(`${email}: ${list.length} orders removed, account deleted`);
    }
    break;
  }
  case "cleanup:stale": {
    // Test accounts left behind by an interrupted run.
    const stale = await db.select({ email: user.email }).from(user).where(and(like(user.email, "qa.%"), like(user.email, "%@example.com")));
    console.log(stale.map((s) => s.email).join(" "));
    break;
  }
  default:
    console.log("commands: stock:get <slug> | stock:set <slug> <n> | orders <email> | cleanup <email…> | cleanup:stale");
}
process.exit(0);
