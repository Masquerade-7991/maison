// Local currency by country, end to end. A visitor from India (Vercel's x-vercel-ip-country header, added
// here to requests for our site only) sees rupees on the home page, listings, product page and bag, pays in
// INR on Stripe and gets an INR order. Then they choose Japan in the footer: the choice beats the header,
// prices turn into whole yen, and Stripe's page shows the same yen total. Run: node scripts/e2e/markets.e2e.mjs
import assert from "node:assert/strict";
import { BASE, cleanup, db, launch, pass, payWithTestCard, signUp, testEmail } from "./lib.mjs";

const email = testEmail("markets");
const browser = await launch();
const text = async (page) => (await page.locator("main").textContent()).replace(/\s+/g, " ");
const amount = (s, sym) => s.match(new RegExp(`${sym}\\s?[\\d,]+`))?.[0].replace(/\s/g, "");

try {
  const page = await signUp(browser, email);
  await page.context().route(`${BASE}/**`, (route) => route.continue({ headers: { ...route.request().headers(), "x-vercel-ip-country": "IN" } }));
  pass("signed up; requests now come from India");

  // ── Prices in rupees everywhere ────────────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/`);
  assert.ok((await text(page)).includes("₹"), "home page prices in ₹");
  assert.ok(!(await text(page)).includes("$"), "no dollar prices on the home page");
  await page.goto(`${BASE}/collections/bags`);
  const listing = await text(page);
  assert.ok(listing.includes("₹") && /Under ₹[\d,]+/.test(listing), "listing prices and price filters in ₹");
  assert.match(await page.locator("footer").innerText(), /Delivering to: India \(INR\)/i);
  pass("home, Bags listing (with ₹ price filters) and the footer say India, INR");

  const hrefs = await page.$$eval('a[href^="/products/"]', (as) => [...new Set(as.map((a) => a.getAttribute("href")))]);
  let pdpPrice = null;
  for (const href of hrefs) {
    await page.goto(BASE + href);
    const add = page.getByRole("button", { name: "Add to bag" });
    if (!(await add.isVisible()) || !(await add.isEnabled())) continue;
    pdpPrice = amount(await text(page), "₹");
    await add.click();
    await page.getByText(/added|in your bag/i).first().waitFor();
    break;
  }
  assert.ok(pdpPrice, "found a buyable product priced in ₹");
  await page.goto(`${BASE}/bag`);
  await page.getByText("Order summary").waitFor();
  const bag = await text(page);
  assert.ok(bag.includes(pdpPrice), `the bag charges the product page's ${pdpPrice}`);
  assert.match(bag, /in INR\. You'll add a delivery address in India/);
  pass(`product page and bag agree on ${pdpPrice}; checkout note says INR and India`);

  // ── Pay in rupees ──────────────────────────────────────────────────────────────────────────────────
  await page.getByRole("button", { name: /checkout/i }).click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30000 });
  await page.getByText(pdpPrice.replace("₹", "")).first().waitFor({ timeout: 20000 });
  assert.ok((await page.locator("body").innerText()).includes("₹"), "Stripe shows rupees");
  await page.goBack();
  await payWithTestCard(page, { line1: "1 Marine Drive", city: "Mumbai", postal: "400020", state: "MH" });
  const [order] = JSON.parse(db("orders", email)).filter((o) => o.status === "paid");
  assert.ok(order, "a paid order");
  assert.equal(order.currency, "inr");
  assert.equal(order.market, "in");
  assert.equal(order.total, order.subtotal, "Stripe charged exactly our INR total");
  pass(`paid on Stripe in INR; order saved as INR, market India, total ${order.total} paise = subtotal`);

  // ── Choose Japan: whole yen, and the choice beats the detected country ────────────────────────────
  await page.goto(`${BASE}/`);
  await page.locator("footer").getByRole("button", { name: /Delivering to/ }).click();
  await Promise.all([page.waitForEvent("load"), page.getByRole("button", { name: /Japan/ }).click()]);
  await page.getByText(/Delivering to: Japan \(JPY\)/i).waitFor();
  const home = await text(page);
  assert.ok(home.includes("¥") && !home.includes("₹"), "home page now in ¥");
  assert.ok(!/¥[\d,]+\.\d/.test(home), "whole yen, no decimals");
  pass("footer: chose Japan; still Japan although the request says India; prices in whole yen");

  await page.goto(BASE + hrefs[0]);
  const yen = amount(await text(page), "¥");
  const add = page.getByRole("button", { name: "Add to bag" });
  if (await add.isEnabled()) {
    await add.click();
    await page.getByText(/added|in your bag/i).first().waitFor();
  }
  await page.goto(`${BASE}/bag`);
  const total = amount((await page.locator("aside").textContent()).replace(/\s+/g, " ").split("Total")[1] ?? "", "¥");
  await page.getByRole("button", { name: /checkout/i }).click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30000 });
  await page.getByText(total.replace("¥", "")).first().waitFor({ timeout: 20000 });
  pass(`bag total ${total} (product ${yen}) is the total on Stripe's page, in yen`);

  // ── Each region gets its own homepage (src/lib/home-variants.ts); India keeps the default ─────────────
  const homes = { IN: "The Quiet Season", US: "The Gifting Season", GB: "Made to Last", JP: "In Detail", AU: "Into the Light", AE: "Evenings, Gathered" };
  for (const [country, title] of Object.entries(homes)) {
    const ctx = await browser.newContext({ extraHTTPHeaders: { "x-vercel-ip-country": country } });
    const home = await ctx.newPage();
    await home.goto(`${BASE}/`);
    assert.equal(await home.locator("h1").innerText(), title, `${country} homepage`);
    await ctx.close();
  }
  pass(`each region's homepage: ${Object.entries(homes).map(([c, t]) => `${c} "${t}"`).join(", ")}`);
} catch (e) {
  console.log(`FAILED: ${e.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  cleanup("test account", () => db("cleanup", email), [email]);
}
