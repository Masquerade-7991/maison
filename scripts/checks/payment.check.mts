// Payment settlement against the real database: applyCheckoutSession with simulated Stripe Checkout
// Sessions (no Stripe calls), including the concurrent cases the single-statement design exists for.
// Run: npx tsx scripts/checks/payment.check.mts. It uses the app's DATABASE_URL (the shared Neon
// `production` branch), creates a throwaway account and orders, and restores stock and deletes them all.
import "dotenv/config";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
const { db } = await import("../../src/db");
const { cartItems, orderItems, orders, products, user } = await import("../../src/db/schema");
const { applyCheckoutSession } = await import("../../src/lib/orders");

const A = "woven-leather-shoulder-bag"; // a seeded product that is not made to order
const M = "wool-two-piece-suit"; // a seeded made-to-order product
const ts = Date.now();
const userId = `qa-payment-${ts}`;
const prod = async (slug: string) => (await db.select().from(products).where(eq(products.slug, slug)))[0];
const setStock = (slug: string, n: number) => db.update(products).set({ stockQuantity: n }).where(eq(products.slug, slug));
const stock = async (slug: string) => (await prod(slug)).stockQuantity;
const order = async (id: string) => (await db.select().from(orders).where(eq(orders.id, id)))[0];
const pass = (m: string) => console.log(`PASS ${m}`);

const a = await prod(A);
const m = await prod(M);
assert.ok(a && !a.madeToOrder, `${A} must exist and not be made to order`);
assert.ok(m && m.madeToOrder, `${M} must exist and be made to order`);
const original = { [A]: a.stockQuantity, [M]: m.stockQuantity };
const orderIds: string[] = [];

// Count confirmation emails (email is off here, so sendEmail logs "[email] …" instead of sending).
let emails = 0;
const log = console.info;
console.info = (...args: unknown[]) => void (String(args[0]).startsWith("[email]") && emails++);

async function newOrder(p: typeof a, quantity: number) {
  const id = crypto.randomUUID();
  const sessionId = `cs_test_check_${id}`;
  await db.batch([
    db.insert(orders).values({ id, userId, subtotalCents: p.priceCents * quantity, stripeCheckoutSessionId: sessionId }),
    db.insert(orderItems).values({ orderId: id, productId: p.id, slug: p.slug, name: p.name, size: "", unitPriceCents: p.priceCents, quantity }),
  ]);
  orderIds.push(id);
  const session = (paymentStatus = "paid") =>
    ({ id: sessionId, metadata: { order_id: id }, payment_status: paymentStatus, amount_total: p.priceCents * quantity, payment_intent: null, customer_details: null, collected_information: null }) as never;
  return { id, session };
}

try {
  await db.insert(user).values({ id: userId, name: "QA Payment", email: `qa.payment+${ts}@example.com`, emailVerified: true });

  // The same order delivered twice at once (webhook + success page): one change, one decrement, bag cleared.
  await setStock(A, 5);
  await db.insert(cartItems).values({ userId, productId: a.id, size: "", quantity: 1 });
  const o1 = await newOrder(a, 1);
  const r1 = await Promise.all([applyCheckoutSession(o1.session(), "checkout.session.completed"), applyCheckoutSession(o1.session(), "checkout.session.completed")]);
  assert.equal(r1.filter((r) => r?.changed).length, 1, "exactly one call moved the order");
  assert.equal(await stock(A), 4);
  assert.equal((await order(o1.id)).stockShortfall, false);
  assert.equal((await db.select().from(cartItems).where(eq(cartItems.userId, userId))).length, 0, "the paid line left the bag");
  pass("duplicate concurrent delivery → one change, stock 5→4, no shortfall, bag cleared");

  // Two orders race for the last unit: both paid, stock 0, exactly one flagged short.
  await setStock(A, 1);
  const [o2, o3] = [await newOrder(a, 1), await newOrder(a, 1)];
  await Promise.all([applyCheckoutSession(o2.session(), "checkout.session.completed"), applyCheckoutSession(o3.session(), "checkout.session.completed")]);
  assert.deepEqual([(await order(o2.id)).status, (await order(o3.id)).status], ["paid", "paid"]);
  assert.equal(await stock(A), 0);
  assert.equal([(await order(o2.id)).stockShortfall, (await order(o3.id)).stockShortfall].filter(Boolean).length, 1);
  pass("last-unit race → both paid, stock 0, exactly one order flagged short");

  const o4 = await newOrder(a, 1);
  await applyCheckoutSession(o4.session(), "checkout.session.completed");
  assert.equal((await order(o4.id)).stockShortfall, true);
  assert.equal(await stock(A), 0, "floored at 0");
  pass("paying at stock 0 → flagged short, stock stays 0");

  await setStock(M, 1);
  const o5 = await newOrder(m, 2);
  await applyCheckoutSession(o5.session(), "checkout.session.completed");
  assert.equal(await stock(M), 0);
  assert.equal((await order(o5.id)).stockShortfall, false);
  pass("made to order, 2 bought with 1 on hand → stock 0, never short");

  // Completed but unpaid → processing without touching stock; success later → paid, decremented once.
  await setStock(A, 3);
  const o6 = await newOrder(a, 1);
  await applyCheckoutSession(o6.session("unpaid"), "checkout.session.completed");
  assert.equal((await order(o6.id)).status, "processing");
  assert.equal(await stock(A), 3, "processing does not decrement");
  await applyCheckoutSession(o6.session(), "checkout.session.async_payment_succeeded");
  await applyCheckoutSession(o6.session(), "checkout.session.async_payment_succeeded");
  assert.equal((await order(o6.id)).status, "paid");
  assert.equal(await stock(A), 2, "decremented exactly once");
  pass("processing → no decrement; payment succeeded twice → paid, decremented once");

  // "Completed, unpaid" racing "payment succeeded" on the same order: the loser re-applies from the
  // winner's status, so every order ends paid, with one decrement and one confirmation email each.
  await setStock(A, 50);
  const before = emails;
  const rounds = 10;
  for (let i = 0; i < rounds; i++) {
    const o = await newOrder(a, 1);
    await Promise.all([
      applyCheckoutSession(o.session("unpaid"), "checkout.session.completed"),
      applyCheckoutSession(o.session("paid"), "checkout.session.async_payment_succeeded"),
    ]);
    assert.equal((await order(o.id)).status, "paid", `round ${i + 1}: order left ${(await order(o.id)).status}`);
  }
  assert.equal(await stock(A), 50 - rounds, "one decrement per order");
  assert.equal(emails - before, rounds, "one confirmation per order");
  pass(`${rounds}× completed(unpaid) racing payment succeeded → all paid, one decrement and one email each`);
} catch (e) {
  log(`FAILED: ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  if (orderIds.length) await db.delete(orders).where(inArray(orders.id, orderIds));
  await db.delete(user).where(eq(user.id, userId));
  await setStock(A, original[A]);
  await setStock(M, original[M]);
  log(`cleanup: ${orderIds.length} orders and the account deleted; ${A}=${await stock(A)}, ${M}=${await stock(M)}`);
  process.exit();
}
