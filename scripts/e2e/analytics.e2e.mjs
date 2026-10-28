// Event analytics (Helo), end to end in the browser, without sending anything real: every request to
// Helo's ingest hosts is answered 202 here and recorded. The test opts in to analytics despite automation
// (window.__HELO_TEST__); the server must be built with NEXT_PUBLIC_HELO_API_KEY and
// NEXT_PUBLIC_HELO_PROJECT_ID set (any values work, e.g. pk_test_e2e / proj_e2e).
//   Consent: nothing before Accept; Decline (in another tab) stops every tab and removes the SDK's storage.
//   Shopping: identify by account id, the events, one Charged per order across a reload, a second tab and the
//   order page; a purchase whose confirmation page never sent it is sent from the orders list.
//   Identity races: sign-out clicked straight after a page load still logs out; switching account on the same
//   page identifies the new customer without a mismatch; deletion and "Keep my account" are recorded.
// Run: node scripts/e2e/analytics.e2e.mjs
import assert from "node:assert/strict";
import { BASE, cleanup, db, launch, pass, payWithTestCard, signUp, testEmail } from "./lib.mjs";

const SLUG = "merino-knit-scarf";
const PASSWORD = "maison-test-1234";
const A = testEmail("analytics.a");
const B = testEmail("analytics.b");
const browser = await launch();
const json = (s) => JSON.parse(s);

/** A context that lets analytics run (or not) and captures what it would send to Helo. */
async function captured(storageState, analytics = true) {
  const ctx = await browser.newContext({ storageState, viewport: { width: 1280, height: 900 } });
  if (analytics) await ctx.addInitScript(() => (window.__HELO_TEST__ = true));
  const sent = [];
  const warnings = [];
  ctx.on("console", (m) => m.type() === "warning" && warnings.push(m.text()));
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
  const calls = (suffix) => sent.filter((s) => s.path.endsWith(suffix));
  return { ctx, sent, warnings, events, named, calls };
}
/** Batches leave every 10 seconds, on identify/logout, or when the page changes; wait until `test` holds. */
async function until(test, what, ms = 25000) {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 500))) if (test()) return;
  assert.fail(`timed out waiting for ${what}`);
}
const accept = async (page) => {
  const banner = page.getByRole("region", { name: "Cookie preferences" });
  await banner.getByRole("button", { name: "Accept" }).click();
  await banner.waitFor({ state: "detached" });
};
async function signIn(page, email) {
  await page.goto(`${BASE}/sign-in`);
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"));
}

try {
  const signedA = await signUp(browser, A);
  const stateA = await signedA.context().storageState();
  await signedA.context().close();

  // ── Consent first ────────────────────────────────────────────────────────────────────────────────
  const a = await captured(stateA);
  const page = await a.ctx.newPage();
  await page.goto(`${BASE}/`);
  await page.getByRole("region", { name: "Cookie preferences" }).waitFor();
  await page.waitForTimeout(2000);
  assert.equal(a.sent.length, 0, "nothing is sent before the banner is answered");
  await accept(page);
  pass("banner shown; zero requests to Helo before Accept");

  // ── Shopping, identity, one Charged ──────────────────────────────────────────────────────────────
  await until(() => a.calls("/identify").length > 0, "identify");
  const idA = a.calls("/identify")[0].body.traits;
  assert.equal(idA.email, A, "identify carries the account email");
  assert.ok(idA.customer_id && idA.customer_id !== A, "identified by the account id, not the email");
  await page.goto(`${BASE}/products/${SLUG}`);
  const add = page.getByRole("button", { name: "Add to bag" });
  await add.dblclick(); // a fast double click: one event per add the server confirms
  await page.getByText(/added|in your bag/i).first().waitFor();
  await page.waitForTimeout(1500);
  const bagCount = (await (await page.request.get(`${BASE}/api/bag/count`)).json()).count;
  await payWithTestCard(page);
  const successUrl = page.url();
  await until(() => a.named("Charged").length === 1 && a.named("Order Completed").length === 1, "Charged");
  assert.equal(a.named("Product Added").length, bagCount, `Product Added events (${a.named("Product Added").length}) = pieces added (${bagCount})`);
  for (const name of ["page_view", "Product Viewed", "Cart Viewed", "Checkout Started"]) assert.ok(a.named(name).length > 0, `${name} was sent`);
  const charged = a.named("Charged")[0];
  assert.ok(charged.properties.amount > 0 && /^[A-Z]{3}$/.test(charged.properties.currency), `Charged ${JSON.stringify(charged.properties)}`);
  assert.ok(charged.customer_id, "Charged belongs to the identified customer");
  // Signed in from the start: every event, including the first ones on each fresh page load, is theirs.
  const anonymous = a.events().filter((e) => e.customer_id !== idA.customer_id).map((e) => e.event_name);
  assert.deepEqual(anonymous, [], `events sent without the signed-in customer: ${anonymous.join(", ")}`);
  const batch = a.calls("/events/batch")[0].body;
  assert.ok(batch.context?.anonymous_id && batch.context?.session_id, "batches carry the anonymous and session ids");
  for (const e of a.events()) for (const k of Object.keys(e.properties ?? {})) assert.ok(!/email|phone|address|message/i.test(k), `no personal key "${k}" in ${e.event_name}`);
  const views = a.named("page_view").map((e) => e.properties.event_target);
  assert.ok(views.every((v, i) => i === 0 || v !== views[i - 1]), `no page view sent twice in a row: ${views.join(", ")}`);
  pass(`identify(account id + email); ${bagCount} add(s) after a double click = ${bagCount} Product Added; Charged ${charged.properties.amount} ${charged.properties.currency}`);

  // The same order seen again: a reload, a second tab, the order page. Still one Charged.
  await page.reload();
  const second = await a.ctx.newPage();
  await second.goto(successUrl);
  const orderA = json(db("orders", A)).find((o) => o.status === "paid");
  await second.goto(`${BASE}/account/orders/${orderA.id}`);
  await second.goto(`${BASE}/account/orders`);
  await page.goto(`${BASE}/`);
  await page.waitForTimeout(12000);
  assert.equal(a.named("Charged").length, 1, "one Charged across a reload, a second tab, the order page and the list");
  await second.close();
  pass("reload, a second tab, the order page and the orders list: still exactly one Charged");

  // A purchase whose confirmation page never sent it (analytics off there, as if the tab closed first).
  const off = await captured(stateA, false);
  const offPage = await off.ctx.newPage();
  await offPage.goto(`${BASE}/products/${SLUG}`);
  await offPage.getByRole("button", { name: "Add to bag" }).click();
  await offPage.getByText(/added|in your bag/i).first().waitFor();
  await payWithTestCard(offPage);
  await off.ctx.close();
  assert.equal(off.sent.length, 0);
  await page.goto(`${BASE}/account/orders`);
  await until(() => a.named("Charged").length === 2, "the missed purchase, sent from the orders list");
  pass("a purchase whose confirmation page sent nothing is sent once from the orders list");

  // ── Sign-out straight after a page load still reaches Helo ───────────────────────────────────────
  await page.goto(`${BASE}/account`);
  await page.getByRole("button", { name: "Sign out" }).click(); // no pause: the page may not have identified yet
  await until(() => a.calls("/identify/logout").length > 0, "logout");
  await page.waitForURL(`${BASE}/`);
  pass("sign-out clicked immediately after the page loaded → Helo logout");

  // ── Another account on the same page; deletion and "Keep my account" ─────────────────────────────
  const signedB = await signUp(browser, B);
  await signedB.context().close();
  await signIn(page, B);
  await page.goto(`${BASE}/account`);
  await until(() => a.calls("/identify").some((c) => c.body.traits.email === B), "identify for the second account");
  const idB = a.calls("/identify").find((c) => c.body.traits.email === B).body.traits;
  assert.ok(idB.customer_id && idB.customer_id !== idA.customer_id, "the second account is identified as itself");
  assert.ok(!a.warnings.some((w) => /IDENTIFY_CUSTOMER_MISMATCH/.test(w)), `no identity mismatch: ${a.warnings.join(" | ")}`);
  const logoutsBefore = a.calls("/identify/logout").length;
  await page.getByRole("button", { name: "Delete account" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/to confirm/).fill(B);
  await dialog.getByRole("button", { name: "Delete my account" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await until(() => a.named("Account Deletion Requested").length === 1 && a.calls("/identify/logout").length > logoutsBefore, "deletion event and logout");
  await signIn(page, B);
  await page.goto(`${BASE}/account`);
  await page.getByRole("button", { name: "Keep my account" }).click();
  await page.getByRole("button", { name: "Delete account" }).waitFor();
  await page.goto(`${BASE}/`); // flushes the queued event
  await until(() => a.named("Account Deletion Cancelled").length === 1, "Account Deletion Cancelled");
  pass("same page, second account: identified as itself, no mismatch; deletion logs out; 'Keep my account' recorded");
  await a.ctx.close();

  // ── Consent across tabs; Decline removes the SDK's storage ───────────────────────────────────────
  const c = await captured(undefined);
  const t1 = await c.ctx.newPage();
  const t2 = await c.ctx.newPage();
  await t1.goto(`${BASE}/`);
  await t2.goto(`${BASE}/women`);
  await accept(t1);
  await t2.getByRole("region", { name: "Cookie preferences" }).waitFor({ state: "detached" });
  await t2.goto(`${BASE}/products/${SLUG}`);
  await until(() => c.named("Product Viewed").length > 0, "the other tab sending after Accept");
  await t1.getByRole("button", { name: "Cookie preferences" }).click();
  await t1.getByRole("region", { name: "Cookie preferences" }).getByRole("button", { name: "Decline" }).click();
  await t2.waitForTimeout(1000);
  const stored = await t2.evaluate(() => ({ keys: Object.keys(localStorage).filter((k) => k.startsWith("helo")), cookie: document.cookie.includes("helo_anonymous_id") }));
  assert.deepEqual(stored, { keys: [], cookie: false }, "Decline removes the SDK's queues and anonymous id");
  const after = c.sent.length;
  await t2.goto(`${BASE}/men`);
  await t2.goto(`${BASE}/products/${SLUG}`);
  await t2.waitForTimeout(12000);
  assert.equal(c.sent.length, after, "after Decline in one tab, the other sends nothing");
  pass("Accept in one tab starts the other; Decline there stops both and removes the SDK's storage and cookie");

  // ── Back/forward cache: a return counts as a view (when the browser restores from it) ────────────
  const d = await captured(undefined);
  const p = await d.ctx.newPage();
  await p.goto(`${BASE}/`);
  await accept(p);
  await p.goto(`${BASE}/women`);
  await p.goBack();
  await p.goto(`${BASE}/men`); // flush
  await p.waitForTimeout(12000);
  const homeViews = d.named("page_view").filter((e) => e.properties.event_target === "/").length;
  if (homeViews >= 2) pass("back to the home page counted as a second view");
  else console.log("NOTE this browser didn't restore the page from the back/forward cache, so the bfcache path wasn't exercised");
  await d.ctx.close();
  await c.ctx.close();
} catch (e) {
  console.error("FAILED:", e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
  cleanup("accounts", () => db("cleanup", A, B), [A, B]);
}
