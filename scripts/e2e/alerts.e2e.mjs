// Back-in-stock alerts end to end: a sold-out piece, "Notify me" for a signed-in customer (and Undo), the
// sign-in prompt for a signed-out visitor, an admin restock on /admin/stock that emails the customer exactly
// once, and a second restock that sends nothing. Also checks sign-up recorded the verify and welcome emails.
// Test addresses are never mailed, so every email lands in email_log as "logged". Run: node scripts/e2e/alerts.e2e.mjs
import assert from "node:assert/strict";
import { BASE, cleanup, db, launch, makeAdmin, pass, signUp, testEmail } from "./lib.mjs";

const SLUG = "structured-satchel";
const NAME = "Structured satchel";
const ADMIN = testEmail("alerts.admin");
const CUSTOMER = testEmail("alerts.customer");
const original = db("stock:get", SLUG);
assert.notEqual(original, "missing", `seeded product ${SLUG} not found`);
const emails = (who) => JSON.parse(db("emails", who));
const browser = await launch();

async function adminSave(page, value) {
  await page.goto(`${BASE}/admin/stock?q=${encodeURIComponent(NAME)}`);
  const row = page.locator("li", { has: page.getByRole("link", { name: NAME, exact: true }) });
  await row.locator('input[name="stockQuantity"]').fill(String(value));
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/admin/stock")),
    row.getByRole("button", { name: "Save" }).click(),
  ]);
  await row.getByText("Saved.").waitFor();
}
async function waitFor(check, ms = 15000) {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 500))) if (check()) return true;
  return check();
}

try {
  const adminPage = await signUp(browser, ADMIN);
  const customer = await signUp(browser, CUSTOMER);
  makeAdmin(ADMIN);
  const signUpMail = emails(CUSTOMER).map((e) => e.kind);
  assert.ok(signUpMail.includes("account.verify") && signUpMail.includes("account.welcome"), `sign-up emails recorded: ${signUpMail}`);
  pass(`accounts created; sign-up recorded ${signUpMail.join(", ")} (test address: logged, never mailed)`);
  // Through the admin page, as an admin would: that also refreshes the cached product page.
  await adminSave(adminPage, 0);

  // Signed out: the button asks them to sign in and come back.
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(`${BASE}/products/${SLUG}`);
  await anon.getByRole("button", { name: "Notify me when it's back" }).click();
  const signIn = anon.getByRole("link", { name: "Sign in to be notified" });
  await signIn.waitFor();
  assert.match(await signIn.getAttribute("href"), new RegExp(`/sign-in\\?next=%2Fproducts%2F${SLUG}`));
  pass("signed out: 'Notify me' becomes 'Sign in to be notified', returning to the product");

  // Signed in: ask, undo, ask again.
  await customer.goto(`${BASE}/products/${SLUG}`);
  await customer.getByRole("button", { name: "Notify me when it's back" }).click();
  await customer.getByText(`We'll email ${CUSTOMER} when it's back.`).waitFor();
  await customer.getByRole("button", { name: "Undo" }).click();
  await customer.getByRole("button", { name: "Notify me when it's back" }).click();
  await customer.getByText(`We'll email ${CUSTOMER} when it's back.`).waitFor();
  pass("signed in: alert on, undone, on again");

  // Restock: one email, after the save has answered.
  await adminSave(adminPage, 3);
  assert.ok(await waitFor(() => emails(CUSTOMER).some((e) => e.kind === "stock.back")), "back-in-stock email recorded");
  pass("admin restocked 0 → 3: the customer's back-in-stock email went out (after the save)");

  await adminSave(adminPage, 0);
  await adminSave(adminPage, 5);
  await new Promise((r) => setTimeout(r, 4000));
  assert.equal(emails(CUSTOMER).filter((e) => e.kind === "stock.back").length, 1, "a second restock sends nothing");
  pass("sold out and restocked again: no second email (one email per request)");
} catch (e) {
  console.log(`FAILED: ${e.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  cleanup(`${SLUG} stock back to ${original}`, () => db("stock:set", SLUG, original), []);
  cleanup("test accounts", () => db("cleanup", ADMIN, CUSTOMER), [ADMIN, CUSTOMER]);
}
