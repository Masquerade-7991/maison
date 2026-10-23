// Account deletion end to end: the "Delete account" section, the confirmation modal (the button stays off
// until the account's email is typed; Enter submits; it says deletion completes within 14 days), signing out
// everywhere, signing back in to "Keep my account", the block while an order is in progress, and the nightly
// completion: deleted outright without orders, anonymised (orders kept, personal details gone) with them.
// Test addresses are never mailed. Run: node scripts/e2e/account-deletion.e2e.mjs
import assert from "node:assert/strict";
import { BASE, cleanup, db, launch, pass, signUp, testEmail } from "./lib.mjs";

const A = testEmail("delete.a"); // no orders: deleted outright
const B = testEmail("delete.b"); // with an order: anonymised
const PASSWORD = "maison-test-1234";
const emails = (who) => JSON.parse(db("emails", who)).map((e) => e.kind);
const browser = await launch();
let anonymisedId = null;

async function requestDeletion(page, email) {
  await page.goto(`${BASE}/account`);
  await page.getByRole("button", { name: "Delete account" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/to confirm/).fill(email);
  await dialog.getByLabel(/to confirm/).press("Enter");
  await dialog.getByText("Deletion scheduled").waitFor();
  return dialog;
}

try {
  const page = await signUp(browser, A);

  // The section and the modal.
  await page.goto(`${BASE}/account`);
  const section = page.getByRole("region", { name: "Delete your Maison account" });
  assert.ok(await section.isVisible(), "a separate Delete account section");
  assert.match(await section.innerText(), /within 14 days/);
  await section.getByRole("button", { name: "Delete account" }).click();
  const dialog = page.getByRole("dialog");
  assert.match(await dialog.innerText(), /completed automatically within 14 days/i);
  const confirm = dialog.getByRole("button", { name: "Delete my account" });
  assert.ok(await confirm.isDisabled(), "disabled before typing");
  await dialog.getByLabel(/to confirm/).fill("someone.else@example.com");
  assert.ok(await confirm.isDisabled(), "disabled for another address");
  await dialog.getByRole("button", { name: "Keep my account" }).click();
  pass("account page: a distinct Delete account section; the modal says 'within 14 days' and stays locked until the exact email is typed");

  // Request with Enter: scheduled 14 days out, signed out, emailed.
  await requestDeletion(page, A.toUpperCase()); // case doesn't matter
  const when = JSON.parse(db("deletion:get", A));
  const days = (new Date(when.scheduledFor) - Date.now()) / 86_400_000;
  assert.ok(days > 13.9 && days < 14.1, `scheduled 14 days out (${days.toFixed(2)})`);
  await page.getByRole("button", { name: "Done" }).click();
  await page.waitForURL(`${BASE}/`);
  await page.goto(`${BASE}/account`);
  await page.waitForURL(/\/sign-in/);
  assert.ok(emails(A).includes("account.deletion_scheduled"), "deletion email recorded");
  pass("typed the email and pressed Enter: deletion scheduled in 14 days, signed out, email recorded");

  // Sign back in and keep the account.
  await page.fill("#email", A);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/account/);
  await page.getByText(/Your account will be deleted on/).waitFor();
  assert.equal(await page.getByRole("button", { name: "Delete account" }).count(), 0, "no second request while one is pending");
  await page.getByRole("button", { name: "Keep my account" }).click();
  await page.getByRole("button", { name: "Delete account" }).waitFor();
  assert.equal(JSON.parse(db("deletion:get", A)), null, "deletion cancelled");
  assert.ok(emails(A).includes("account.deletion_cancelled"));
  pass("signed back in: banner with the date; 'Keep my account' cancelled it and emailed the customer");

  // Requested again, then 14 days pass: no orders, so deleted outright.
  await requestDeletion(page, A);
  const resultA = JSON.parse(db("deletion:complete", A));
  assert.deepEqual(resultA, { deleted: 1, anonymised: 0, skipped: 0 });
  assert.equal(db("user:id", A), "none", "account gone");
  pass("after 14 days (simulated): an account without orders is deleted outright");

  // An order in progress blocks it; once delivered, completion anonymises instead of deleting.
  const pageB = await signUp(browser, B);
  db("order:fake", B, "unfulfilled");
  await pageB.goto(`${BASE}/account`);
  await pageB.getByRole("button", { name: "Delete account" }).click();
  await pageB.getByRole("dialog").getByText(/order in progress/).waitFor();
  assert.equal(await pageB.getByRole("dialog").getByRole("button", { name: "Delete my account" }).count(), 0, "no way to confirm");
  pass("an order in progress: the modal explains and offers no confirm button");

  db("orders:deliver", B);
  await pageB.reload();
  await requestDeletion(pageB, B);
  anonymisedId = db("user:id", B);
  const resultB = JSON.parse(db("deletion:complete", B));
  assert.deepEqual(resultB, { deleted: 0, anonymised: 1, skipped: 0 });
  const left = JSON.parse(db("anonymised:get", anonymisedId));
  assert.equal(left.user.name, "Deleted customer");
  assert.match(left.user.email, /^deleted-.*@deleted\.invalid$/);
  assert.equal(left.orders.length, 1, "the order is kept");
  assert.deepEqual(left.orders[0], { email: null, name: null, address: null }, "without personal details");
  pass("with a delivered order: the account is anonymised, the order kept without name, email or address");
} catch (e) {
  console.log(`FAILED: ${e.message}`);
  if (process.env.SHOT) for (const [i, p] of browser.contexts().flatMap((c) => c.pages()).entries()) await p.screenshot({ path: `${process.env.SHOT}-${i}.png`, fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
  cleanup("test accounts", () => db("cleanup", A, B), [A, B]);
  if (anonymisedId) cleanup("anonymised account", () => db("anonymised:remove", anonymisedId), []);
}
