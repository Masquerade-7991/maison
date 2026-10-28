// Event analytics (Helo), end to end in the browser, without sending anything real: every request to
// Helo's ingest hosts is answered 202 here and recorded. The test opts in to analytics despite automation
// (window.__HELO_TEST__); the server must be built with NEXT_PUBLIC_HELO_API_KEY and
// NEXT_PUBLIC_HELO_PROJECT_ID set (any values work, e.g. pk_test_e2e / proj_e2e).
//   No banner answer → nothing sent. Accept → page views, product, bag, checkout and one Charged per order
//   (a reload doesn't repeat it), identify with the account id, logout on sign-out. Decline → nothing.
// Run: node scripts/e2e/analytics.e2e.mjs
import assert from "node:assert/strict";
import { BASE, cleanup, db, launch, pass, payWithTestCard, signUp, testEmail } from "./lib.mjs";

const SLUG = "merino-knit-scarf";
const email = testEmail("analytics");
const browser = await launch();

/** A context that lets analytics run and captures what it would send to Helo. */
async function captured(storageState) {
  const ctx = await browser.newContext({ storageState, viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => {
    window.__HELO_TEST__ = true;
  });
  const sent = [];
  await ctx.route(/https:\/\/(clarity\.helo\.ai|uatapi-platform\.helo\.ai)\/.*/, (route) => {
    const r = route.request();
    let body = null;
    try {
      body = JSON.parse(r.postData() ?? "null");
    } catch {}
    sent.push({ path: new URL(r.url()).pathname, body });
    route.fulfill({ status: 202, contentType: "application/json", body: "{}" });
  });
  const events = () => sent.filter((s) => s.path.endsWith("/events/batch")).flatMap((s) => s.body?.events ?? []);
  const named = (name) => events().filter((e) => e.event_name === name);
  return { ctx, sent, events, named };
}
/** Batches leave every 10 seconds, or on a page change; wait until `test` holds. */
async function until(test, what, ms = 25000) {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 500))) if (test()) return;
  assert.fail(`timed out waiting for ${what}`);
}

try {
  const signed = await signUp(browser, email);
  const state = await signed.context().storageState();
  await signed.context().close();

  // ── Consent first: nothing before Accept ─────────────────────────────────────────────────────────
  const a = await captured(state);
  const page = await a.ctx.newPage();
  await page.goto(`${BASE}/`);
  const banner = page.getByRole("region", { name: "Cookie preferences" });
  await banner.waitFor();
  await page.waitForTimeout(2000);
  assert.equal(a.sent.length, 0, "nothing is sent before the banner is answered");
  await banner.getByRole("button", { name: "Accept" }).click();
  await banner.waitFor({ state: "detached" });
  pass("banner shown; zero requests to Helo before Accept");

  // ── Accept: identity, page views, shopping, one Charged ──────────────────────────────────────────
  await until(() => a.sent.some((s) => s.path.endsWith("/identify")), "identify");
  const id = a.sent.find((s) => s.path.endsWith("/identify")).body;
  assert.equal(id.traits?.email, email, "identify carries the account email");
  assert.ok(id.traits?.customer_id && id.traits.customer_id !== email, "identified by the account id, not the email");
  await page.goto(`${BASE}/products/${SLUG}`);
  await page.getByRole("button", { name: "Add to bag" }).click();
  await page.getByText(/added|in your bag/i).first().waitFor();
  await payWithTestCard(page);
  await until(() => a.named("Charged").length === 1 && a.named("Order Completed").length === 1, "Charged");
  for (const name of ["page_view", "Product Viewed", "Product Added", "Cart Viewed", "Checkout Started"]) assert.ok(a.named(name).length > 0, `${name} was sent`);
  const viewed = a.named("Product Viewed")[0];
  assert.equal(viewed.properties.product_id, SLUG);
  assert.equal(typeof viewed.properties.price, "number");
  const charged = a.named("Charged")[0];
  assert.ok(charged.properties.amount > 0 && /^[A-Z]{3}$/.test(charged.properties.currency), `Charged ${JSON.stringify(charged.properties)}`);
  assert.ok(charged.customer_id, "Charged belongs to the identified customer");
  const batch = a.sent.find((s) => s.path.endsWith("/events/batch")).body;
  assert.ok(batch.context?.anonymous_id && batch.context?.session_id, "batches carry the anonymous and session ids");
  for (const e of a.events()) for (const k of Object.keys(e.properties ?? {})) assert.ok(!/email|phone|address|message/i.test(k), `no personal key "${k}" in ${e.event_name}`);
  pass(`identify(account id + email); ${[...new Set(a.events().map((e) => e.event_name))].join(", ")}; Charged ${charged.properties.amount} ${charged.properties.currency}`);

  await page.reload();
  await page.getByText("Order confirmed").first().waitFor();
  await page.goto(`${BASE}/`); // a page change flushes whatever the reload queued
  await page.waitForTimeout(12000);
  assert.equal(a.named("Charged").length, 1, "reloading the confirmation page doesn't count the order again");
  pass("reloading the confirmation page sends no second Charged");

  await page.goto(`${BASE}/account`);
  await page.waitForTimeout(3000); // as a person would: the page identifies the customer first
  await page.getByRole("button", { name: "Sign out" }).click();
  await until(() => a.sent.some((s) => s.path.endsWith("/identify/logout")), "logout");
  pass("sign out → Helo logout");
  await a.ctx.close();

  // ── Decline: nothing, ever ───────────────────────────────────────────────────────────────────────
  const d = await captured(undefined);
  const p2 = await d.ctx.newPage();
  await p2.goto(`${BASE}/`);
  await p2.getByRole("region", { name: "Cookie preferences" }).getByRole("button", { name: "Decline" }).click();
  await p2.goto(`${BASE}/products/${SLUG}`);
  await p2.goto(`${BASE}/women`);
  await p2.waitForTimeout(12000);
  assert.equal(d.sent.length, 0, "Decline → zero requests");
  pass("Decline → zero requests to Helo while browsing");
  await d.ctx.close();
} catch (e) {
  console.error("FAILED:", e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
  cleanup("account", () => db("cleanup", email), [email]);
}
