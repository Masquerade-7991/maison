// Shared helpers for the browser e2e scripts. They drive an installed Edge or Chrome through
// playwright-core (no browser download) against a running production build of the app:
//
//   npm run build
//   EMAIL_LINKS_ON_PAGE=true BETTER_AUTH_URL=http://localhost:3100 npx next start -p 3100
//
// EMAIL_LINKS_ON_PAGE puts the verification link on the sign-up page, so tests can sign up without email.
// The app's database is the shared Neon `production` branch: every script cleans up what it creates.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

export const BASE = process.env.BASE ?? "http://localhost:3100";
const APP = fileURLToPath(new URL("../..", import.meta.url));

export const launch = () => chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? "msedge", headless: true });

/** Runs a scripts/e2e/db.mts command and returns its output (lines joined with "; "). */
export const db = (...args) =>
  execFileSync("npx", ["tsx", "scripts/e2e/db.mts", ...args], { cwd: APP, shell: true, encoding: "utf8" })
    .trim()
    .split("\n")
    .filter((l) => l.trim() && !l.includes("claude-code-hint"))
    .join("; ");

/** Makes an existing, verified test account an admin. */
export const makeAdmin = (email) => execFileSync("npm", ["run", "auth:set-role", "--", email, "admin"], { cwd: APP, shell: true, stdio: "ignore" });

export const testEmail = (tag) => `qa.${tag}+${Date.now()}@example.com`;

export const pass = (m) => console.log(`PASS ${m}`);

/**
 * Signs up and verifies a new account in its own browser context, returning a signed-in page.
 * Production allows 3 sign-ups per minute per client, so keep runs to a couple of accounts.
 */
export async function signUp(browser, email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/sign-up`);
  await page.fill("#name", "QA Test");
  await page.fill("#email", email);
  await page.fill("#password", "maison-test-1234");
  await page.click('button[type="submit"]');
  await page.getByRole("link", { name: "Verify email and continue" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/api/auth") && !u.pathname.startsWith("/sign-up"));
  await page.goto(`${BASE}/account`);
  if (!new URL(page.url()).pathname.startsWith("/account")) throw new Error(`${email} is not signed in after verifying`);
  return page;
}
