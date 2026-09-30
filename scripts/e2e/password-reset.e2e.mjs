// Forgot password end to end: the request never reveals whether an account exists, the emailed link
// (read from the database here, standing in for the email) opens our form, bad passwords are refused in
// the browser and on the server, saving signs every session out, the old password stops working, the new
// one works, and the link can't be used twice. The page never shows a reset link.
// Run: node scripts/e2e/password-reset.e2e.mjs (see lib.mjs for the server).
import assert from "node:assert/strict";
import { BASE, cleanup, db, launch, pass, signUp, testEmail } from "./lib.mjs";

const EMAIL = testEmail("reset");
const OLD = "maison-test-1234"; // the password signUp() uses
const NEW = "maison-new-5678";
const browser = await launch();
const text = async (page) => (await page.locator("main").innerText()).replace(/\s+/g, " ");

async function signIn(page, password) {
  await page.goto(`${BASE}/sign-in`);
  await page.fill("#email", EMAIL);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
}

try {
  const device = await signUp(browser, EMAIL); // stays signed in: the "other device" a reset must sign out
  const page = await (await browser.newContext()).newPage();

  // Request
  await page.goto(`${BASE}/sign-in`);
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await page.waitForURL(/\/forgot-password$/);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await page.getByText("Enter your email address.").waitFor();
  await page.fill("#email", EMAIL);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await page.getByText(`If an account exists for ${EMAIL}`).waitFor();
  const html = await page.content();
  assert.ok(!/reset-password\/[A-Za-z0-9]/.test(html) && !/[?&]token=/.test(html), "the page never shows a reset link");
  pass("'Forgot your password?' on sign-in → request sent; the page shows no link");

  const unknown = `qa.nobody+${Date.now()}@example.com`;
  await page.goto(`${BASE}/forgot-password`);
  await page.fill("#email", unknown);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await page.getByText(`If an account exists for ${unknown}`).waitFor();
  pass("an unknown email gets exactly the same reply (no account enumeration)");

  // The emailed link
  const token = db("reset:token", EMAIL);
  assert.notEqual(token, "none", "a reset token was stored (the email was sent)");
  const link = `${BASE}/api/auth/reset-password/${token}?callbackURL=${encodeURIComponent("/reset-password")}`;
  await page.goto(link);
  await page.waitForURL(/\/reset-password\?token=/);
  await page.getByRole("heading", { name: "Choose a new password" }).waitFor();
  pass("the link Better Auth emails checks the token and lands on our form");

  // Refusals
  await page.fill("#password", NEW);
  await page.fill("#confirm", "something-else-99");
  await page.getByRole("button", { name: "Save new password" }).click();
  await page.getByText("The two passwords don't match.").waitFor();
  await page.fill("#password", "short");
  await page.fill("#confirm", "short");
  await page.getByRole("button", { name: "Save new password" }).click();
  await page.getByText("Use at least 8 characters.").waitFor();
  const server = await page.evaluate(async (t) => {
    const r = await fetch("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ newPassword: "short", token: t }) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, token);
  assert.equal(server.status, 400);
  assert.equal(server.body.code, "PASSWORD_TOO_SHORT");
  pass("mismatched and short passwords are refused in the browser; the server refuses a short one too (400)");

  // Save
  await page.fill("#password", NEW);
  await page.fill("#confirm", NEW);
  await page.getByRole("button", { name: "Save new password" }).click();
  await page.waitForURL(/\/sign-in\?reset=1/);
  await page.getByText("Your password has changed. Sign in with the new one.").waitFor();
  pass("new password saved → sign-in with the 'password has changed' notice");

  await device.goto(`${BASE}/account`);
  assert.match(device.url(), /\/sign-in\?next=%2Faccount/, "the other signed-in session was signed out");
  pass("the account's existing session elsewhere was signed out");

  await signIn(page, OLD);
  await page.getByText("Email or password is incorrect.").waitFor();
  await signIn(page, NEW);
  await page.waitForURL(/\/account/);
  assert.match(await text(page), /Hello, QA/);
  pass("the old password is refused and the new one signs in");

  await page.goto(link);
  await page.waitForURL(/\/reset-password\?error=INVALID_TOKEN/);
  await page.getByText("This link has expired").waitFor();
  pass("the same link can't be used twice ('This link has expired')");
} catch (e) {
  console.log(`FAILED: ${e.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  cleanup("test account", () => db("cleanup", EMAIL), [EMAIL]);
}
