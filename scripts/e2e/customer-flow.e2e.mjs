// The customer flow end to end: sign up, sign out, sign in → browse → view a product → add to bag →
// change the quantity → invalid quantities and a missing size are refused by the server → checkout →
// Stripe test payment → order confirmed → the order in Account, Orders.
// Run: node scripts/e2e/customer-flow.e2e.mjs (see lib.mjs for the server). Uses a seeded product that
// has 3 in stock (the stock limit is part of the test); cleanup puts the stock back and deletes the account.
import assert from "node:assert/strict";
import { BASE, cleanup, db, launch, pass, payWithTestCard, signUp, testEmail } from "./lib.mjs";

const SLUG = "chain-shoulder-bag"; // one size
const SIZED = "satin-bomber-jacket"; // ready-to-wear: needs a size
const email = testEmail("customer.flow");
const OTHER = testEmail("customer.other");
const json = (s) => JSON.parse(s);
const money = (cents) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);

const product = json(db("product:get", SLUG));
assert.ok(product, `${SLUG} exists`);
assert.ok(product.stock >= 2 && product.stock < 10, `${SLUG} needs 2–9 in stock for this test (has ${product.stock})`);
const STOCK = product.stock;
const browser = await launch();

/** The page's main text on one line. */
const bagText = async (page) => (await page.locator("main").innerText()).replace(/\s+/g, " ");

try {
  // ── Account ──────────────────────────────────────────────────────────────────────────────────────
  let page = await signUp(browser, email);
  pass("signed up and verified with the on-page link");
  await page.goto(`${BASE}/account`);
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/account"));
  await page.goto(`${BASE}/account`);
  assert.match(page.url(), /\/sign-in\?next=%2Faccount/, "signed out: /account asks to sign in");
  await page.fill("#email", email);
  await page.fill("#password", "maison-test-1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/account/);
  assert.match(await bagText(page), /Hello, QA/);
  pass("signed out, then signed back in through the sign-in form (back on /account)");

  // ── Browse ───────────────────────────────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/`);
  assert.ok((await page.locator('a[href^="/products/"]').count()) >= 4, "homepage lists products");
  await page.goto(`${BASE}/collections/bags?sort=price-asc`);
  const prices = await page.$$eval('a[href^="/products/"] p', (ps) => ps.map((p) => p.textContent));
  const nums = prices.map((t) => Number((t.match(/\$([\d,]+)\s*$/) ?? [])[1]?.replace(/,/g, ""))).filter((n) => n > 0);
  assert.ok(nums.length > 3 && nums.every((n, i) => i === 0 || nums[i - 1] <= n), `Bags sorted by price ascending: ${nums.join(", ")}`);
  await page.goto(`${BASE}/search?q=chain`);
  assert.ok(await page.locator(`a[href="/products/${SLUG}"]`).first().isVisible(), "search finds the chain bag");
  pass("browsed: homepage, Bags sorted by price (low to high), search for 'chain'");

  // ── View a product ───────────────────────────────────────────────────────────────────────────────
  await page.locator(`a[href="/products/${SLUG}"]`).first().click();
  await page.waitForURL(new RegExp(`/products/${SLUG}$`));
  const pdp = await bagText(page);
  assert.ok(pdp.includes(product.name) && pdp.includes(money(product.priceCents)), "product page shows name and price");
  assert.match(pdp, new RegExp(`Only ${STOCK} left|In stock`, "i"));
  assert.match(pdp, /One size/i);
  pass(`viewed ${product.name}: ${money(product.priceCents)}, stock shown, one size`);

  // ── Add to bag ───────────────────────────────────────────────────────────────────────────────────
  await page.getByRole("button", { name: "Add to bag" }).click();
  await page.getByText("Added to your bag.").waitFor();
  await page.goto(`${BASE}/bag`);
  assert.match(await bagText(page), new RegExp(`Your bag \\(1\\).*${product.name}`, "i"));
  pass("added to bag; the bag shows 1 piece");

  // Missing size on a sized product is refused by the server (the browser's `required` removed first).
  await page.goto(`${BASE}/products/${SIZED}`);
  await page.$$eval('input[name="size"]', (inputs) => inputs.forEach((i) => (i.required = false)));
  await page.getByRole("button", { name: "Add to bag" }).click();
  await page.getByText("Please choose a size.").waitFor();
  await page.goto(`${BASE}/bag`);
  assert.match(await bagText(page), /Your bag \(1\)/, "nothing was added");
  pass("adding a sized piece with no size is refused by the server ('Please choose a size.')");

  // ── Change quantity ──────────────────────────────────────────────────────────────────────────────
  const qty = () => page.getByLabel(`Quantity of ${product.name}`, { exact: true }).innerText();
  const inc = () => page.getByRole("button", { name: `Increase quantity of ${product.name}` });
  const dec = () => page.getByRole("button", { name: `Decrease quantity of ${product.name}` });
  const settle = async (expected) => page.waitForFunction(
    ([label, q]) => document.querySelector(`output[aria-label="${label}"]`)?.textContent?.trim() === q,
    [`Quantity of ${product.name}`, String(expected)],
  );
  for (let q = 2; q <= STOCK; q++) {
    await inc().click();
    await settle(q);
  }
  assert.equal(await qty(), String(STOCK));
  assert.ok(await inc().isDisabled(), "+ is disabled at the stock limit");
  assert.ok((await bagText(page)).includes(money(product.priceCents * STOCK)), "subtotal follows the quantity");
  await dec().click();
  await settle(STOCK - 1);
  const QTY = STOCK - 1;
  assert.ok((await bagText(page)).includes(money(product.priceCents * QTY)));
  pass(`quantity 1 → ${STOCK} with +, + disabled at the stock limit, back to ${QTY} with −; subtotal ${money(product.priceCents * QTY)}`);

  // ── Invalid quantities (the + button's value edited in the page, then submitted) ─────────────────
  const tamper = async (value) => {
    await page.evaluate(([label, v]) => {
      const b = document.querySelector(`button[aria-label="${label}"]`);
      b.disabled = false;
      b.value = v;
    }, [`Increase quantity of ${product.name}`, value]);
    await inc().click();
    const alert = page.locator('p[role="alert"]').filter({ hasText: /\w/ }).first();
    await alert.waitFor();
    const text = await alert.innerText();
    await page.reload();
    return text;
  };
  for (const bad of ["0", "11", "1.5", "abc", "-2"]) {
    assert.equal(await tamper(bad), "Choose a quantity between 1 and 10.", `quantity "${bad}"`);
    assert.equal(await qty(), String(QTY));
  }
  assert.equal(await tamper(String(STOCK + 1)), `Only ${STOCK} available for this line.`);
  assert.equal(await qty(), String(QTY));
  pass(`invalid quantities 0, 11, 1.5, abc, -2 and ${STOCK + 1} (over stock) are refused by the server; quantity stays ${QTY}`);

  // ── Checkout and payment ─────────────────────────────────────────────────────────────────────────
  const total = money(product.priceCents * QTY);
  await payWithTestCard(page);
  const success = await bagText(page);
  const ref = (success.match(/MSN-[0-9A-F]{8}/) ?? [])[0];
  assert.ok(ref, "success page shows an order reference");
  assert.ok(success.includes(total), `success page shows the total ${total}`);
  pass(`checked out and paid with Stripe's test card; success page confirms ${ref} for ${total}`);

  const orders = json(db("orders", email));
  assert.equal(orders.length, 1);
  assert.equal(orders[0].status, "paid");
  assert.equal(json(db("product:get", SLUG)).stock, STOCK - QTY, "stock went down by the quantity bought");
  await page.goto(`${BASE}/bag`);
  assert.doesNotMatch(await bagText(page), new RegExp(product.name), "the paid pieces left the bag");
  pass(`order paid in the database, stock ${STOCK} → ${STOCK - QTY}, bag emptied`);

  // ── The order in the account ─────────────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/account/orders`);
  const list = await bagText(page);
  assert.ok(list.includes(ref) && list.includes(total) && /Preparing/i.test(list), `orders list: ${list.slice(0, 300)}`);
  await page.getByRole("link", { name: new RegExp(ref) }).first().click();
  await page.waitForURL(new RegExp(`/account/orders/${orders[0].id}$`));
  const detail = await bagText(page);
  for (const expected of [ref, product.name, `Qty ${QTY}`, total, "San Francisco", "preparing your pieces"]) {
    assert.ok(detail.toLowerCase().includes(expected.toLowerCase()), `order page shows "${expected}": ${detail.slice(0, 500)}`);
  }
  pass(`Account, Orders lists ${ref} (${total}, Preparing); its page shows the item, Qty ${QTY}, total and address`);

  // Ownership: signed out → sign-in; a different customer → plain 404.
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(`${BASE}/account/orders/${orders[0].id}`);
  assert.match(anon.url(), /\/sign-in/);
  const stranger = await signUp(browser, OTHER);
  const res = await stranger.goto(`${BASE}/account/orders/${orders[0].id}`);
  assert.equal(res.status(), 404, "another customer's order is a 404");
  assert.doesNotMatch(await bagText(stranger), new RegExp(ref), "and shows nothing of it");
  pass("the order page asks a signed-out visitor to sign in, and is a 404 for another customer");
} catch (e) {
  console.log(`FAILED: ${e.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  cleanup("test accounts", () => db("cleanup", email, OTHER), [email, OTHER]);
  cleanup("stock", () => `${SLUG} stock is ${json(db("product:get", SLUG)).stock} (was ${STOCK})`, []);
}
