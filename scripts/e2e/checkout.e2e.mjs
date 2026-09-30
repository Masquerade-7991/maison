// The customer flow end to end: sign up → verify → browse → add two pieces → Stripe test payment →
// the order shows as paid. Run: node scripts/e2e/checkout.e2e.mjs (see lib.mjs for the server).
// Uses Stripe's test card, so no money moves; cleanup puts the stock back and deletes the account.
import assert from "node:assert/strict";
import { BASE, db, launch, pass, signUp, testEmail } from "./lib.mjs";

const email = testEmail("checkout");
const browser = await launch();
try {
  const page = await signUp(browser, email);
  pass("signed up, verified from the on-page link, signed in");

  await page.goto(`${BASE}/`);
  await page.goto(`${BASE}/collections/bags`);
  const hrefs = await page.$$eval('a[href^="/products/"]', (as) => [...new Set(as.map((a) => a.getAttribute("href")))]);
  assert.ok(hrefs.length > 0, "the bags collection lists products");
  pass(`browsed the home page and /collections/bags (${hrefs.length} products)`);

  let added = 0;
  for (const href of hrefs) {
    if (added === 2) break;
    await page.goto(BASE + href);
    const add = page.getByRole("button", { name: "Add to bag" });
    if (!(await add.isVisible()) || !(await add.isEnabled())) continue; // sold out
    const size = page.locator('input[name="size"]:not(:disabled)').first();
    if (await size.count()) await size.check({ force: true });
    await add.click();
    await page.getByText(/added|in your bag/i).first().waitFor();
    added++;
  }
  assert.equal(added, 2, "two buyable products added");
  pass("added two products to the bag");

  await page.goto(`${BASE}/bag`);
  await page.getByRole("button", { name: /checkout/i }).click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30000 });
  const card = page.locator('[data-testid="card-accordion-item-button"]');
  if (await card.isVisible().catch(() => false)) await card.click();
  await page.fill("#shippingName", "QA Test");
  await page.fill("#shippingAddressLine1", "1 Market St");
  await page.keyboard.press("Escape"); // close the address autocomplete
  await page.fill("#shippingLocality", "San Francisco");
  await page.fill("#shippingPostalCode", "94105");
  await page.selectOption("#shippingAdministrativeArea", "CA").catch(() => {});
  await page.fill("#cardNumber", "4242424242424242");
  await page.fill("#cardExpiry", "12 / 34");
  await page.fill("#cardCvc", "123");
  const billing = page.locator("#billingName");
  if (await billing.isVisible().catch(() => false)) await billing.fill("QA Test");
  await page.locator('[data-testid="hosted-payment-submit-button"], .SubmitButton').first().click();
  await page.waitForURL(`${BASE}/checkout/success**`, { timeout: 60000 });
  pass("paid with Stripe's test card and came back to /checkout/success");

  await page.getByText("Order confirmed").first().waitFor({ timeout: 30000 }); // polls while the webhook lands
  pass("success page confirms the order");

  await page.goto(`${BASE}/account/orders`);
  assert.match(await page.locator("main").innerText(), /Preparing/i, "the order shows as paid (Preparing)");
  const orders = JSON.parse(db("orders", email));
  assert.equal(orders.length, 1);
  assert.equal(orders[0].status, "paid");
  pass("the order is paid in the database and listed under Account, Orders");
} catch (e) {
  console.log(`FAILED: ${e.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  console.log(`cleanup: ${db("cleanup", email)}`);
}
