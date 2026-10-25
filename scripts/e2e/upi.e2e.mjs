// UPI through Razorpay, end to end on our side. An India visitor on an Android phone (Razorpay offers UPI
// there by default; computers need the QR code, which Razorpay's support switches on) chooses "Pay by UPI",
// fills the delivery form and gets a real Razorpay test order. Razorpay's window can't finish a UPI payment
// in an automated browser, so the payment arrives as Razorpay would send it: a payment.captured webhook,
// signed with our webhook secret. Then: paid once, stock down, bag cleared, confirmation logged; a resend,
// a bad signature and a wrong amount change nothing. Run: node scripts/e2e/upi.e2e.mjs
import "dotenv/config";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { BASE, cleanup, db, launch, pass, signUp, testEmail } from "./lib.mjs";

const SLUG = "merino-knit-scarf";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";
const email = testEmail("upi");
const json = (s) => JSON.parse(s);
const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
assert.ok(secret, "RAZORPAY_WEBHOOK_SECRET must be set in .env");

const webhook = (body, signature = createHmac("sha256", secret).update(body).digest("hex")) =>
  fetch(`${BASE}/api/razorpay/webhook`, { method: "POST", headers: { "content-type": "application/json", "x-razorpay-signature": signature }, body });
const captured = (payment) => JSON.stringify({ entity: "event", event: "payment.captured", payload: { payment: { entity: payment } } });

const browser = await launch();
try {
  // Sign up on a computer, then continue as an Android phone in India with the same session.
  const desk = await signUp(browser, email);
  const state = await desk.context().storageState();
  await desk.context().close();
  const ctx = await browser.newContext({ storageState: state, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: ANDROID });
  await ctx.route(`${BASE}/**`, (route) => route.continue({ headers: { ...route.request().headers(), "x-vercel-ip-country": "IN" } }));
  const page = await ctx.newPage();
  pass("signed up; continuing as an Android phone in India");

  const stockBefore = Number(db("stock:get", SLUG));
  await page.goto(`${BASE}/products/${SLUG}`);
  await page.getByRole("button", { name: "Add to bag" }).click();
  await page.getByText(/added|in your bag/i).first().waitFor();
  await page.goto(`${BASE}/bag`);
  await page.getByRole("button", { name: "Pay by card" }).waitFor();
  await page.getByRole("link", { name: "Pay by UPI" }).click();
  await page.waitForURL(/\/checkout\/upi/);
  pass("bag offers 'Pay by card' and 'Pay by UPI'; UPI opens the delivery form");

  // The server refuses a bad form before creating anything.
  await page.getByLabel("PIN code").fill("12");
  await page.getByRole("button", { name: /continue to upi/i }).click();
  await page.getByText(/PIN code/i).nth(1).waitFor();
  assert.equal(json(db("orders", email)).length, 0, "no order from an invalid form");
  await page.getByLabel("Mobile number").fill("9812345670");
  await page.getByLabel("Address", { exact: true }).fill("12 MG Road");
  await page.getByLabel("City").fill("Bengaluru");
  await page.getByLabel("State").selectOption("Karnataka");
  await page.getByLabel("PIN code").fill("560001");
  await page.getByRole("button", { name: /continue to upi/i }).click();
  let order;
  for (let i = 0; i < 40 && !order?.razorpayOrderId; i++) {
    await page.waitForTimeout(500);
    order = json(db("orders", email))[0];
  }
  assert.ok(order?.razorpayOrderId?.startsWith("order_"), `a Razorpay order was created: ${JSON.stringify(order)}`);
  assert.deepEqual([order.provider, order.status, order.currency, order.market], ["razorpay", "pending", "inr", "in"]);
  pass(`invalid form refused; valid form → pending order in INR with Razorpay ${order.razorpayOrderId}`);

  const payment = { id: `pay_qa${Date.now()}`, entity: "payment", amount: order.subtotal, currency: "INR", status: "captured", order_id: order.razorpayOrderId, method: "upi", amount_refunded: 0 };

  assert.equal((await webhook(captured(payment), "0".repeat(64))).status, 400, "bad signature → 400");
  assert.equal((await webhook(captured({ ...payment, amount: payment.amount - 100 }))).status, 200);
  assert.equal(json(db("orders", email))[0].status, "pending", "a payment for the wrong amount is not applied");
  pass("bad signature → 400; wrong amount → ignored, order still pending");

  assert.equal((await webhook(captured(payment))).status, 200);
  const paid = json(db("orders", email))[0];
  assert.equal(paid.status, "paid", "the signed payment.captured webhook pays the order");
  assert.equal(paid.total, order.subtotal);
  assert.equal(Number(db("stock:get", SLUG)), stockBefore - 1, "stock down by one");
  assert.equal((await webhook(captured(payment))).status, 200);
  assert.equal(Number(db("stock:get", SLUG)), stockBefore - 1, "a resent webhook takes no more stock");
  const mails = json(db("emails", email)).filter((m) => m.kind === "order.confirmed");
  assert.equal(mails.length, 1, `one confirmation: ${JSON.stringify(mails)}`);
  pass(`webhook → paid (total ${paid.total} paise), stock ${stockBefore} → ${stockBefore - 1}, one confirmation; a resend changes nothing`);

  await page.goto(`${BASE}/checkout/success?order=${order.id}`);
  await page.getByText(/thank you/i).first().waitFor();
  assert.equal((await (await page.request.get(`${BASE}/api/bag/count`)).json()).count, 0, "bag cleared");
  await page.goto(`${BASE}/account/orders/${order.id}`);
  assert.match(await page.locator("main").innerText(), /UPI \(Razorpay\)/i, "order page names the gateway");
  pass("confirmation page says thank you, the bag is empty, the order page says 'UPI (Razorpay)'");
} catch (e) {
  console.error("FAILED:", e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
  cleanup("account", () => db("cleanup", email), [email]);
}
