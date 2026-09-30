// Contact Us and About end to end: the footer links, the About page's images, the contact modal (mouse,
// keyboard, Escape), server-side validation that keeps what was typed, the confirmation, the bot trap,
// and a signed-in customer's details filled in.
// Run: node scripts/e2e/contact.e2e.mjs (see lib.mjs for the server). Set SERVER_LOG to the running
// server's log file to also check that messages are logged (email is off) and trapped ones are not.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BASE, cleanup, db, launch, pass, signUp, testEmail } from "./lib.mjs";

const EMAIL = testEmail("contact");
const marker = `qa-contact-${Date.now()}`;
const log = () => (process.env.SERVER_LOG ? readFileSync(process.env.SERVER_LOG, "utf8") : null);
const browser = await launch();

try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();

  // Footer links and About
  await page.goto(`${BASE}/`);
  await page.locator("footer").getByRole("link", { name: "About", exact: true }).click();
  await page.waitForURL(/\/about$/);
  await page.getByRole("heading", { level: 1, name: /Made slowly/ }).waitFor();
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 700) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 100)); }
  });
  await page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 20000 });
  const broken = await page.evaluate(() => [...document.images].filter((i) => i.naturalWidth === 0).length);
  assert.equal(broken, 0, "every About image loads");
  await page.locator("footer").getByRole("link", { name: "Contact us", exact: true }).click();
  await page.waitForURL(/\/contact$/);
  pass("footer 'About' opens /about (every image loads) and 'Contact us' opens /contact");

  // The modal: mouse, Escape, keyboard
  const dialog = page.locator("dialog");
  await page.getByRole("button", { name: "Write to us" }).click();
  await dialog.and(page.locator("[open]")).waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.id), "contact-name", "focus starts in Name");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("dialog")?.open);
  await page.getByRole("button", { name: "Write to us" }).focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector("dialog")?.open);
  pass("the modal opens by click and by keyboard, focuses Name, and Escape closes it");

  // Validation on the server, keeping what was typed
  const send = () => dialog.getByRole("button", { name: "Send message" }).click();
  await send();
  for (const msg of ["Enter your name.", "Enter your email address.", "Choose a topic.", "Tell us a little more"]) {
    await dialog.getByText(msg).waitFor();
  }
  await dialog.locator("#contact-name").fill("QA Contact");
  await dialog.locator("#contact-email").fill("not-an-email");
  await dialog.locator("#contact-topic").selectOption("Order");
  await dialog.locator("#contact-orderRef").fill("123");
  await dialog.locator("#contact-message").fill(`Where is my parcel, please? ${marker}`);
  await send();
  await dialog.getByText("Enter a valid email address").waitFor();
  await dialog.getByText("Order references look like MSN-1A2B3C4D").waitFor();
  assert.equal(await dialog.locator("#contact-name").inputValue(), "QA Contact", "typed values are kept");
  assert.equal(await dialog.locator("#contact-topic").inputValue(), "Order", "the chosen topic is kept too");
  assert.match(await dialog.locator("#contact-message").inputValue(), new RegExp(marker));
  pass("empty fields, a bad email and a bad order reference are refused by the server; what was typed is kept");

  // Send
  await dialog.locator("#contact-email").fill("qa.contact@example.com");
  await dialog.locator("#contact-orderRef").fill("msn-1a2b3c4d");
  await send();
  await dialog.getByText("Thank you, QA Contact.").waitFor();
  if (log()) {
    await page.waitForTimeout(500);
    const entry = log().split(/\r?\n/).findIndex((l) => l.includes("Contact: Order (MSN-1A2B3C4D) from QA Contact"));
    assert.ok(entry >= 0 && log().includes(marker), "the message reached the server log");
  }
  pass(`a valid message shows 'Thank you, QA Contact.'${log() ? " and is in the server log (email is off)" : ""}`);

  await dialog.getByRole("button", { name: "Close", exact: true }).last().click();
  await page.waitForFunction(() => !document.querySelector("dialog")?.open);
  await page.getByRole("button", { name: "Write to us" }).click();
  assert.equal(await dialog.locator("#contact-name").inputValue(), "", "a fresh form after sending");
  pass("closing after sending and opening again gives a fresh, empty form");

  // The bot trap: thanked, never sent
  const trapped = `${marker}-trap`;
  await dialog.locator("#contact-name").fill("Bot");
  await dialog.locator("#contact-email").fill("bot@example.com");
  await dialog.locator("#contact-topic").selectOption("Other");
  await dialog.locator("#contact-message").fill(`Buy cheap watches ${trapped}`);
  await page.evaluate(() => { document.querySelector("#contact-website").value = "https://spam.example"; });
  await send();
  await dialog.getByText("Thank you, Bot.").waitFor();
  if (log()) {
    await page.waitForTimeout(500);
    assert.ok(!log().includes(trapped), "a trapped message is not sent or logged");
  }
  pass(`a filled-in trap field is thanked${log() ? " but never sent (not in the log)" : ""}`);

  // Signed in: name and email filled in
  const customer = await signUp(browser, EMAIL);
  await customer.goto(`${BASE}/contact`);
  await customer.getByRole("button", { name: "Write to us" }).click();
  assert.equal(await customer.locator("#contact-name").inputValue(), "QA Test");
  assert.equal(await customer.locator("#contact-email").inputValue(), EMAIL);
  pass("a signed-in customer's name and email are filled in");
} catch (e) {
  console.log(`FAILED: ${e.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  cleanup("test account", () => db("cleanup", EMAIL), [EMAIL]);
}
