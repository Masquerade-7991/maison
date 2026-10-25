// Test-data helper for the e2e scripts (run with `npx tsx scripts/e2e/db.mts <command>`). It talks to the
// same database as the app (the shared Neon `production` branch), so every command either reads or undoes
// what a test did. Only touches accounts whose email starts with `qa.`.
import "dotenv/config";
import { and, desc, eq, inArray, like, sql } from "drizzle-orm";
const { db } = await import("../../src/db");
const { emailLog, orderItems, orders, products, user, verification } = await import("../../src/db/schema");
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
      ? await db.select({ id: orders.id, status: orders.status, session: orders.stripeCheckoutSessionId, currency: orders.currency, market: orders.market, subtotal: orders.subtotalCents, total: orders.amountTotalCents, provider: orders.provider, razorpayOrderId: orders.razorpayOrderId }).from(orders).where(eq(orders.userId, u.id)).orderBy(orders.createdAt)
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
      const list = await db.select({ id: orders.id, status: orders.status, session: orders.stripeCheckoutSessionId, currency: orders.currency, market: orders.market, subtotal: orders.subtotalCents, total: orders.amountTotalCents }).from(orders).where(eq(orders.userId, u.id));
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
      await db.delete(verification).where(eq(verification.value, u.id)); // unused reset tokens
      await db.delete(user).where(eq(user.id, u.id));
      await db.delete(emailLog).where(eq(emailLog.recipient, email)); // its email records
      console.log(`${email}: ${list.length} orders removed, account deleted`);
    }
    break;
  }
  case "product:get": {
    const [p] = await db.select({ id: products.id, name: products.name, priceCents: products.priceCents, stock: products.stockQuantity }).from(products).where(eq(products.slug, args[0]));
    console.log(JSON.stringify(p ?? null));
    break;
  }
  case "product:delete": {
    // Test products only (slug starts with "qa-"); images and bag lines cascade, order items keep their snapshot.
    if (!args[0]?.startsWith("qa-")) throw new Error(`refusing to delete non-test product ${args[0]}`);
    const gone = await db.delete(products).where(eq(products.slug, args[0])).returning({ id: products.id });
    console.log(`${args[0]}: ${gone.length ? "deleted" : "not found"}`);
    break;
  }
  case "products:count": {
    // How many products have a name starting with the given text (e.g. a replayed create must add none).
    const rows = await db.select({ id: products.id }).from(products).where(like(products.name, `${args[0]}%`));
    console.log(rows.length);
    break;
  }
  case "user:get": {
    const [u] = await db.select({ id: user.id, role: user.role }).from(user).where(eq(user.email, args[0]));
    console.log(JSON.stringify(u ?? null));
    break;
  }
  case "order:get": {
    const [o] = await db.select({ status: orders.status, fulfilment: orders.fulfilmentStatus, carrier: orders.carrier }).from(orders).where(eq(orders.id, args[0]));
    console.log(JSON.stringify(o ?? null));
    break;
  }
  case "reset:token": {
    // Stands in for the reset email: the newest reset token Better Auth stored for this test account.
    const u = await testUser(args[0]);
    const rows = u
      ? await db.select({ identifier: verification.identifier }).from(verification)
          .where(and(like(verification.identifier, "reset-password:%"), eq(verification.value, u.id)))
          .orderBy(desc(verification.createdAt)).limit(1)
      : [];
    console.log(rows[0]?.identifier.slice("reset-password:".length) ?? "none");
    break;
  }
  case "emails": {
    // The emails recorded for a test account, oldest first: [{ kind, status }].
    if (!args[0]?.startsWith("qa.")) throw new Error("emails: test accounts only");
    const rows = await db.select({ kind: emailLog.kind, status: emailLog.status }).from(emailLog).where(eq(emailLog.recipient, args[0])).orderBy(emailLog.createdAt);
    console.log(JSON.stringify(rows));
    break;
  }
  case "deletion:get": {
    // The scheduled deletion of a test account: { scheduledFor } or null.
    const u = await testUser(args[0]);
    const { accountDeletions } = await import("../../src/db/schema");
    const [row] = u ? await db.select({ scheduledFor: accountDeletions.scheduledFor }).from(accountDeletions).where(eq(accountDeletions.userId, u.id)) : [];
    console.log(JSON.stringify(row ?? null));
    break;
  }
  case "deletion:complete": {
    // Stands in for 14 days passing: back-dates this test account's deletion and runs the nightly purge for it alone.
    const u = await testUser(args[0]);
    if (!u) throw new Error("no such test account");
    const { accountDeletions } = await import("../../src/db/schema");
    const { purgeDueDeletions } = await import("../../src/lib/account-deletion");
    await db.update(accountDeletions).set({ scheduledFor: new Date(Date.now() - 60_000) }).where(eq(accountDeletions.userId, u.id));
    console.info = () => {}; // the goodbye email is only logged for test addresses: keep stdout to the JSON
    console.log(JSON.stringify(await purgeDueDeletions(new Date(), u.id)));
    break;
  }
  case "order:fake": {
    // A paid test order in a given fulfilment state (no Stripe), for account deletion checks. Prints its id.
    const u = await testUser(args[0]);
    if (!u) throw new Error("no such test account");
    const [p] = await db.select({ id: products.id, slug: products.slug, name: products.name, price: products.priceCents }).from(products).limit(1);
    const id = crypto.randomUUID();
    await db.insert(orders).values({
        id, userId: u.id, status: "paid", subtotalCents: p.price, amountTotalCents: p.price, paidAt: new Date(),
        fulfilmentStatus: (args[1] ?? "delivered") as "unfulfilled" | "delivered", customerEmail: args[0],
        shippingName: "QA Test", shippingAddress: { line1: "1 Market St", city: "San Francisco", country: "US" },
      });
    await db.insert(orderItems).values({ orderId: id, productId: p.id, slug: p.slug, name: p.name, size: "", unitPriceCents: p.price, quantity: 1 });
    console.log(id);
    break;
  }
  case "orders:deliver": {
    // Marks every order of a test account delivered.
    const u = await testUser(args[0]);
    if (u) await db.update(orders).set({ fulfilmentStatus: "delivered", deliveredAt: new Date() }).where(eq(orders.userId, u.id));
    console.log("ok");
    break;
  }
  case "anonymised:get": {
    // What an anonymised test account left behind, by user id: the placeholder user and its orders' personal fields.
    const [u] = await db.select({ name: user.name, email: user.email }).from(user).where(eq(user.id, args[0]));
    const os = await db.select({ email: orders.customerEmail, name: orders.shippingName, address: orders.shippingAddress }).from(orders).where(eq(orders.userId, args[0]));
    console.log(JSON.stringify({ user: u ?? null, orders: os }));
    break;
  }
  case "anonymised:remove": {
    // Cleanup for an anonymised test account (its email is no longer qa.…): only placeholder users.
    const [u] = await db.select({ email: user.email }).from(user).where(eq(user.id, args[0]));
    if (!u?.email.endsWith("@deleted.invalid")) throw new Error("not an anonymised account");
    await db.delete(orders).where(eq(orders.userId, args[0]));
    await db.delete(user).where(eq(user.id, args[0]));
    console.log("removed");
    break;
  }
  case "user:id": {
    const u = await testUser(args[0]);
    console.log(u?.id ?? "none");
    break;
  }
  case "cleanup:stale": {
    // Test accounts left behind by an interrupted run.
    const stale = await db.select({ email: user.email }).from(user).where(and(like(user.email, "qa.%"), like(user.email, "%@example.com")));
    console.log(stale.map((s) => s.email).join(" "));
    break;
  }
  default:
    console.log("commands: stock:get <slug> | stock:set <slug> <n> | product:get <slug> | product:delete <qa-slug> | products:count <name prefix> | user:get <email> | order:get <id> | orders <email> | emails <email> | deletion:get <email> | deletion:complete <email> | cleanup <email…> | cleanup:stale");
}
// A moment for connections to finish closing: exiting mid-close crashes Node on Windows (UV_HANDLE_CLOSING).
setTimeout(() => process.exit(0), 100);
