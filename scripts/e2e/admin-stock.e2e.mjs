// Admin inventory end to end: /admin/stock saves, server-side validation, the "sold meanwhile" guard,
// the availability filters, what the storefront and bag show at each stock level, and that a customer can
// neither open the page nor replay its Server Action. Run: node scripts/e2e/admin-stock.e2e.mjs (see lib.mjs).
// Uses one seeded product and puts its stock back afterwards; the two test accounts are deleted.
import assert from "node:assert/strict";
import { BASE, db, launch, makeAdmin, pass, signUp, testEmail } from "./lib.mjs";

const SLUG = "wicker-top-handle-bag";
const NAME = "Wicker top-handle bag";
const ADMIN = testEmail("stock.admin");
const CUSTOMER = testEmail("stock.customer");

const original = db("stock:get", SLUG);
assert.notEqual(original, "missing", `seeded product ${SLUG} not found`);
const browser = await launch();

// A stock row's form, located by the product link in the same row.
const row = (page) => page.locator("li", { has: page.getByRole("link", { name: NAME, exact: true }) });
async function save(page, value) {
  const r = row(page);
  await r.locator('input[name="stockQuantity"]').fill(String(value));
  await submit(page);
  return (await r.locator('[role="status"], [role="alert"]').first().innerText()).trim();
}
// Wait for the Server Action's own response, not for a message that may still be the previous one.
async function submit(page) {
  const r = row(page);
  await Promise.all([
    page.waitForResponse((res) => res.request().method() === "POST" && res.url().includes("/admin/stock")),
    r.getByRole("button", { name: "Save" }).click(),
  ]);
  await r.getByRole("button", { name: "Save" }).waitFor(); // re-enabled: the new state has rendered
}
const openStock = (page, qs = "") => page.goto(`${BASE}/admin/stock?q=${encodeURIComponent(NAME)}${qs}`);

try {
  const adminPage = await signUp(browser, ADMIN);
  const customerPage = await signUp(browser, CUSTOMER);
  makeAdmin(ADMIN);
  pass("temporary admin and customer created and verified");

  // Capture one real stock action request, to replay later as the customer.
  let captured;
  adminPage.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/admin/stock") && r.headers()["next-action"]) captured ??= { url: r.url(), headers: r.headers(), body: r.postData() };
  });

  // 1. Valid save
  await openStock(adminPage);
  assert.equal(await save(adminPage, 5), "Saved.");
  assert.equal(db("stock:get", SLUG), "5");
  pass("valid save → Saved., database = 5");

  // 2. Invalid values are refused server-side (input has noValidate, so the server sees them)
  for (const bad of ["-1", "1.5", "100001"]) {
    const msg = await save(adminPage, bad);
    assert.match(msg, /whole number from 0 to 100,000/, `"${bad}" → ${msg}`);
    assert.equal(db("stock:get", SLUG), "5");
  }
  pass("-1, 1.5, 100001 refused with the stock error; database unchanged");

  // 3. Conflict: a sale lands while the page is open
  await openStock(adminPage);
  db("stock:set", SLUG, "4");
  const conflict = await save(adminPage, 7);
  assert.match(conflict, /Stock changed to 4 meanwhile/, conflict);
  assert.equal(db("stock:get", SLUG), "4");
  pass("stale save refused: 'Stock changed to 4 meanwhile', database kept 4");
  const retry = row(adminPage);
  assert.equal(await retry.locator('input[name="stockQuantity"]').inputValue(), "7", "typed value kept");
  await submit(adminPage);
  assert.equal(db("stock:get", SLUG), "7");
  pass("second save applies deliberately → database = 7");

  // 4. Filter + counts + storefront state
  await openStock(adminPage);
  assert.equal(await save(adminPage, 2), "Saved.");
  await adminPage.goto(`${BASE}/admin/stock?state=low_stock`);
  assert.ok(await adminPage.getByRole("link", { name: NAME, exact: true }).isVisible(), "listed under Low stock");
  assert.match(await adminPage.locator("h2").first().innerText(), /\d+ low/i);
  pass("stock 2 → listed under Low stock, heading shows the low count");
  let pdp = await customerPage.goto(`${BASE}/products/${SLUG}`).then(() => customerPage.locator("main").innerText());
  assert.match(pdp, /Only 2 left/i);
  pass("storefront product page says 'Only 2 left'");

  // Customer puts it in the bag while it's buyable
  await customerPage.getByRole("button", { name: "Add to bag" }).click();
  await customerPage.getByText(/added|in your bag/i).first().waitFor();

  await openStock(adminPage);
  assert.equal(await save(adminPage, 0), "Saved.");
  await adminPage.goto(`${BASE}/admin/stock?state=sold_out`);
  assert.ok(await adminPage.getByRole("link", { name: NAME, exact: true }).isVisible(), "listed under Sold out");
  await adminPage.goto(`${BASE}/admin/stock?state=low_stock`);
  assert.ok(!(await adminPage.getByRole("link", { name: NAME, exact: true }).isVisible()), "gone from Low stock");
  pass("stock 0 → under Sold out, not under Low stock");
  await customerPage.goto(`${BASE}/products/${SLUG}`);
  assert.ok(await customerPage.getByRole("button", { name: "Sold out" }).isDisabled());
  pass("storefront product page shows a disabled 'Sold out' button");

  // 5. Bag reflects live stock; checkout blocked, then allowed again
  await customerPage.goto(`${BASE}/bag`);
  const checkout = customerPage.getByRole("button", { name: /checkout/i });
  assert.ok(await checkout.isDisabled(), "checkout blocked while the bag holds a sold-out piece");
  pass("bag shows the issue and checkout is blocked at stock 0");
  await openStock(adminPage);
  assert.equal(await save(adminPage, 5), "Saved.");
  await customerPage.reload();
  assert.ok(await checkout.isEnabled(), "checkout allowed again");
  pass("stock back to 5 → checkout allowed again");

  // 6. Access: customer gets a 404 page, and a replayed action changes nothing
  const res = await customerPage.goto(`${BASE}/admin/stock`);
  assert.equal(res.status(), 404);
  assert.ok(captured, "captured an action request");
  const replay = await customerPage.request.post(captured.url, {
    headers: { ...captured.headers, cookie: undefined },
    data: captured.body.replace(/(name="stockQuantity"\r\n\r\n)\d+/, "$1999"),
  });
  assert.equal(db("stock:get", SLUG), "5", "customer replay must not write");
  pass(`customer: /admin/stock is 404; replayed action → HTTP ${replay.status()}, database unchanged`);

  // 7. Saving the unchanged number after a sale is refused, not "Saved." (no-op shortcut removed)
  await openStock(adminPage);
  db("stock:set", SLUG, "3");
  const same = await save(adminPage, 5);
  assert.match(same, /Stock changed to 3 meanwhile/, same);
  assert.equal(db("stock:get", SLUG), "3");
  pass("unchanged save after a sale → refused with the new number, database kept 3");

  // 8. After its own save, a row picks up newer server data when another row's save re-renders the page
  await adminPage.goto(`${BASE}/admin/stock?q=top-handle`);
  assert.equal(await save(adminPage, 6), "Saved.");
  db("stock:set", SLUG, "2"); // a sale lands
  const other = adminPage.locator("li", { has: adminPage.getByRole("link", { name: "Leather top-handle bag", exact: true }) });
  await Promise.all([
    adminPage.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/admin/stock")),
    other.getByRole("button", { name: "Save" }).click(), // saves its unchanged number → revalidates the page
  ]);
  await other.getByRole("button", { name: "Save", exact: true }).waitFor(); // finished, not "Saving…"
  await row(adminPage).getByText(/Only 2 left/i).waitFor(); // the page re-rendered with the sold-down number
  assert.equal(await row(adminPage).locator('input[name="stockQuantity"]').inputValue(), "2", "row shows the newer server number");
  assert.equal(await row(adminPage).locator('input[name="expectedStock"]').inputValue(), "2", "and will post it as expected");
  pass("after another row saves, the first row shows the sold-down 2 (no avoidable conflict)");
} catch (e) {
  console.log(`FAILED: ${e.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  db("stock:set", SLUG, original);
  console.log(`cleanup: ${SLUG} stock back to ${db("stock:get", SLUG)}; ${db("cleanup", ADMIN, CUSTOMER)}`);
}
