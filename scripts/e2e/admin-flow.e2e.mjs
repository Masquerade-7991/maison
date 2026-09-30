// The admin flow end to end, then the same actions attempted by a normal customer.
//   admin: sign in → /admin → create a product → edit it → set its stock → storefront shows each change →
//   a customer buys it → the admin inspects that order.
//   customer: every admin page is a 404, signed-out visitors are sent to sign-in, and replaying each
//   admin Server Action the admin just used (create, edit, stock, fulfilment, role) changes nothing.
// Run: node scripts/e2e/admin-flow.e2e.mjs (see lib.mjs for the server). The product is a throwaway
// "qa-" product, deleted at the end with the two test accounts and their order.
import assert from "node:assert/strict";
import { BASE, cleanup, db, launch, makeAdmin, pass, payWithTestCard, replayHeaders, signUp, testEmail } from "./lib.mjs";

const ts = Date.now();
const ADMIN = testEmail("admin");
const CUSTOMER = testEmail("customer");
const NAME = `QA Admin Flow ${ts}`;
const SLUG = `qa-admin-flow-${ts}`;
const EDITED = `${NAME} Edited`;
const IMAGE = "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?ar=4:5&fit=crop&w=1600&q=80";
const note = (m) => console.log(`NOTE ${m}`);
const json = (s) => JSON.parse(s);

const browser = await launch();

// Every Server Action POST the admin makes, so the customer can replay it with their own cookie.
const actions = [];
const record = (page) =>
  page.on("request", (r) => {
    if (r.method() === "POST" && r.headers()["next-action"]) actions.push({ url: r.url(), headers: r.headers(), body: r.postData() ?? "" });
  });
// Next encodes a form action's fields as "_1_<name>".
const has = (a, field) => new RegExp(`name="(?:_?\\d+_)?${field}"`).test(a.body);
/** The latest captured action posting all of these fields. */
const actionWith = (...fields) => {
  const found = [...actions].reverse().find((a) => fields.every((f) => has(a, f)));
  const seen = actions.map((a) => `[${[...a.body.matchAll(/name="([^"]+)"/g)].map((m) => m[1]).join(",") || `${a.body.length} bytes: ${a.body.slice(0, 80)}`}]`);
  assert.ok(found, `captured an action posting ${fields.join(", ")}; recorded ${actions.length}: ${seen.join(" ")}`);
  return found;
};
/** Re-sends a captured action from `page`'s browser context (its cookie), with some fields changed. */
async function replay(page, action, fields) {
  let body = action.body;
  for (const [k, v] of Object.entries(fields)) {
    const re = new RegExp(`(name="(?:_?\\d+_)?${k}"\\r\\n\\r\\n)[^\\r]*`);
    assert.ok(re.test(body), `replayed body has a "${k}" field`);
    body = body.replace(re, `$1${v}`);
  }
  return page.request.post(action.url, { headers: replayHeaders(action.headers), data: body });
}
const statusOf = async (page, path) => (await page.goto(`${BASE}${path}`)).status();

let productId, orderId, categoryId;
try {
  // ── Admin ────────────────────────────────────────────────────────────────────────────────────────
  const setupPage = await signUp(browser, ADMIN);
  await setupPage.context().close();
  const customer = await signUp(browser, CUSTOMER);
  makeAdmin(ADMIN);

  const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const admin = await adminCtx.newPage();
  record(admin);
  await admin.goto(`${BASE}/sign-in`);
  await admin.fill("#email", ADMIN);
  await admin.fill("#password", "maison-test-1234");
  await admin.click('button[type="submit"]');
  await admin.waitForURL(/\/account/);
  pass("admin signed in through the sign-in form");

  await admin.goto(`${BASE}/admin`);
  assert.match(admin.url(), /\/admin\/products$/, "/admin forwards to /admin/products");
  for (const section of ["Products", "Stock", "Categories", "Orders", "Accounts"]) {
    assert.ok(await admin.getByRole("link", { name: section, exact: true }).first().isVisible(), `admin nav has ${section}`);
  }
  pass("admin area opens (/admin → /admin/products) with Products, Stock, Categories, Orders, Accounts");

  // Create
  await admin.goto(`${BASE}/admin/products/new`);
  await admin.fill("#name", NAME);
  await admin.fill("#description", "A throwaway product created by the admin e2e check.");
  await admin.selectOption("#categoryId", { label: "Bags" });
  categoryId = await admin.locator("#categoryId").inputValue();
  await admin.selectOption("#department", "women");
  await admin.fill("#colour", "Tan");
  await admin.fill("#price", "123.45");
  await admin.fill("#stockQuantity", "5");
  await admin.fill("#imageUrl", IMAGE);
  await admin.fill("#imageAlt", "Tan bag on a shelf");
  await admin.getByRole("button", { name: "Create product" }).click();
  await admin.waitForURL(/\/admin\/products\/[0-9a-f-]{36}\?saved=created/);
  productId = admin.url().match(/products\/([0-9a-f-]{36})/)[1];
  await admin.getByText("Product created. It is live in the store now.").waitFor();
  assert.deepEqual(json(db("product:get", SLUG)), { id: productId, name: NAME, priceCents: 12345, stock: 5 });
  pass(`created "${NAME}" ($123.45, 5 in stock); stored with slug ${SLUG}`);

  await customer.goto(`${BASE}/products/${SLUG}`);
  let pdp = await customer.locator("main").innerText();
  assert.ok(pdp.includes(NAME) && pdp.includes("$123") && /In stock/i.test(pdp), "product page shows the new product");
  await customer.goto(`${BASE}/collections/bags`);
  assert.ok(await customer.locator(`a[href="/products/${SLUG}"]`).first().isVisible(), "listed in Bags");
  await customer.goto(`${BASE}/`);
  assert.ok(await customer.locator(`a[href="/products/${SLUG}"]`).count(), "in the homepage New arrivals (cached page refreshed)");
  pass("storefront shows it at once: product page, the Bags listing and the cached homepage");

  // Edit
  await admin.goto(`${BASE}/admin/products/${productId}`);
  await admin.fill("#name", EDITED);
  await admin.fill("#price", "150.00");
  await admin.getByRole("button", { name: "Save changes" }).click();
  await admin.getByText("Changes saved").waitFor();
  assert.deepEqual(json(db("product:get", SLUG)), { id: productId, name: EDITED, priceCents: 15000, stock: 5 });
  await customer.goto(`${BASE}/products/${SLUG}`);
  pdp = await customer.locator("main").innerText();
  assert.ok(pdp.includes(EDITED) && pdp.includes("$150"), "product page shows the edit");
  pass("edited name and price ($150); the cached product page shows it at once");

  // Stock
  await admin.goto(`${BASE}/admin/stock?q=${encodeURIComponent(EDITED)}`);
  const row = admin.locator("li", { has: admin.getByRole("link", { name: EDITED, exact: true }) });
  await row.locator('input[name="stockQuantity"]').fill("2");
  await row.getByRole("button", { name: "Save" }).click();
  await row.getByText("Saved.").waitFor();
  assert.equal(json(db("product:get", SLUG)).stock, 2);
  await customer.goto(`${BASE}/products/${SLUG}`);
  assert.match(await customer.locator("main").innerText(), /Only 2 left/i);
  await customer.goto(`${BASE}/collections/bags`);
  assert.match(await customer.locator(`a[href="/products/${SLUG}"]`).first().innerText(), /Only 2 left/i, "the product card");
  pass("stock set to 2 on /admin/stock; product page and product card say 'Only 2 left'");

  // A customer buys it, so there is an order to inspect.
  await customer.goto(`${BASE}/products/${SLUG}`);
  await customer.getByRole("button", { name: "Add to bag" }).click();
  await customer.getByText(/added|in your bag/i).first().waitFor();
  await payWithTestCard(customer);
  const orders = json(db("orders", CUSTOMER));
  orderId = orders[0].id;
  assert.equal(orders[0].status, "paid");
  assert.equal(json(db("product:get", SLUG)).stock, 1, "the sale took one unit");
  pass("customer bought it with Stripe's test card: order paid, stock 2 → 1");

  let fresh = false;
  for (let i = 0; i < 10 && !fresh; i++) {
    await customer.goto(`${BASE}/products/${SLUG}`);
    fresh = /Only 1 left/i.test(await customer.locator("main").innerText());
    if (!fresh) await customer.waitForTimeout(2000);
  }
  if (fresh) pass("after the sale the product page says 'Only 1 left'");
  else note("after the sale this server's cached product page still said 'Only 2 left' (see the report)");

  // Inspect the order
  const ref = `MSN-${orderId.slice(0, 8).toUpperCase()}`;
  await admin.goto(`${BASE}/admin/orders`);
  const listRow = admin.locator("li", { hasText: ref });
  const listText = await listRow.first().innerText();
  assert.ok(listText.includes(CUSTOMER) && /Confirmed/i.test(listText), `orders list shows ${ref}, the customer and "Confirmed" (paid): ${listText.replace(/\s+/g, " ")}`);
  await admin.goto(`${BASE}/admin/orders/${orderId}`);
  const detail = await admin.locator("main").innerText();
  // formatCents writes whole amounts without cents: $150, $99.99.
  for (const expected of [ref, EDITED, "$150", "San Francisco", "Mark as shipped"]) {
    // innerText applies CSS text-transform (labels are uppercase), so compare case-insensitively.
    assert.ok(detail.toLowerCase().includes(expected.toLowerCase()), `order page shows ${expected}; it shows: ${detail.replace(/\s+/g, " ").slice(0, 600)}`);
  }
  pass(`orders list and ${ref}'s page show the customer, Confirmed (paid), the item, $150, the address and fulfilment`);

  // Record the fulfilment and role actions without changing anything (both are refused by validation).
  await admin.getByRole("button", { name: "Mark as shipped" }).click();
  await admin.getByText("Enter the carrier.").waitFor();
  assert.equal(json(db("order:get", orderId)).fulfilment, "unfulfilled");
  await admin.goto(`${BASE}/admin/accounts`);
  // The admin's own row has no role form (no self-demotion); save the customer's role unchanged instead,
  // which records the action without changing anything (an unchanged role keeps their sessions).
  assert.equal(await admin.getByLabel(`Role for ${ADMIN}`).count(), 0, "no role form on the admin's own row");
  assert.match(await admin.locator("li", { hasText: ADMIN }).innerText(), /admin \(you\)/i);
  const theirs = admin.locator("form", { has: admin.getByLabel(`Role for ${CUSTOMER}`) });
  await theirs.getByLabel(`Role for ${CUSTOMER}`).selectOption("customer");
  await theirs.getByRole("button", { name: "Save" }).click();
  await theirs.getByText("Saved.").waitFor();
  assert.equal(json(db("user:get", CUSTOMER)).role, "customer");
  pass("shipping without a carrier is refused; the admin's own row is read-only ('admin (you)')");

  // Control: the admin's own replay works, so a refused customer replay is down to authorisation.
  const stockAction = actionWith("stockQuantity");
  const control = await replay(admin, stockAction, { expectedStock: 1, stockQuantity: 3 });
  assert.equal(json(db("product:get", SLUG)).stock, 3, `admin replay applied (HTTP ${control.status()})`);
  pass("control: the admin replaying the stock action applies it (1 → 3)");

  // ── Normal customer ───────────────────────────────────────────────────────────────────────────────
  const routes = ["/admin", "/admin/products", "/admin/products/new", `/admin/products/${productId}`, "/admin/stock",
    "/admin/categories", "/admin/categories/new", `/admin/categories/${categoryId}`, "/admin/orders", `/admin/orders/${orderId}`, "/admin/accounts"];
  for (const path of routes) assert.equal(await statusOf(customer, path), 404, `${path} is a 404 for a customer`);
  assert.ok(!(await customer.locator("text=Accounts").count()), "no admin navigation on the 404");
  pass(`a signed-in customer gets 404 on all ${routes.length} admin pages, with no admin navigation`);

  const anon = await (await browser.newContext()).newPage();
  await anon.goto(`${BASE}/admin/stock`);
  assert.match(anon.url(), /\/sign-in\?next=%2Fadmin%2Fstock/);
  pass("a signed-out visitor is sent to sign-in");

  const { id: customerId } = json(db("user:get", CUSTOMER));
  const attempts = [
    ["create product", actionWith("slug"), { name: "QA Hijack", slug: `qa-hijack-${ts}` }, () => assert.equal(db("products:count", "QA Hijack"), "0")],
    ["edit product", actionWith("description", "expectedStock"), { name: "QA Hijack edit", price: "1.00" }, () => assert.equal(json(db("product:get", SLUG)).name, EDITED)],
    ["stock", stockAction, { expectedStock: 3, stockQuantity: 999 }, () => assert.equal(json(db("product:get", SLUG)).stock, 3)],
    ["ship order", actionWith("carrier"), { carrier: "UPS", trackingNumber: "1ZHIJACK" }, () => assert.equal(json(db("order:get", orderId)).fulfilment, "unfulfilled")],
    ["make self admin", actionWith("role"), { userId: customerId, role: "admin" }, () => assert.equal(json(db("user:get", CUSTOMER)).role, "customer")],
  ];
  for (const [label, action, fields, unchanged] of attempts) {
    assert.ok(action, `captured the ${label} action`);
    const res = await replay(customer, action, fields);
    unchanged();
    pass(`customer replaying "${label}" → HTTP ${res.status()}, nothing changed`);
  }
} catch (e) {
  console.log(`FAILED: ${e.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  cleanup("test accounts and order", () => db("cleanup", ADMIN, CUSTOMER), [ADMIN, CUSTOMER]);
  cleanup("test product", () => db("product:delete", SLUG), []);
}
