// node src/lib/analytics-guard.check.mjs
// Keeps event analytics in one shape as the site changes: the SDK only behind the wrapper, no tracking from
// server code, every catalogued event actually sent somewhere, and the tracking plan listing exactly the
// catalogue. Static on purpose, like admin-guard.check.mjs: it catches the event someone adds next.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const rel = (f) => relative(root, f).replaceAll("\\", "/");
const files = walk(join(root, "src")).filter((f) => /\.(ts|tsx)$/.test(f)).map((f) => ({ path: rel(f), text: readFileSync(f, "utf8") }));

// The catalogue: the keys of AnalyticsEvents.
const catalogueSrc = readFileSync(join(root, "src/lib/analytics-events.ts"), "utf8");
const block = catalogueSrc.match(/export type AnalyticsEvents = \{([\s\S]*?)\n\};/);
assert.ok(block, "AnalyticsEvents not found in src/lib/analytics-events.ts");
const events = [...block[1].matchAll(/^\s+"?([^":\n]+?)"?:\s/gm)].map((m) => m[1]);
assert.ok(events.length > 10, `only ${events.length} events found in the catalogue`);

// 1. Only the wrapper imports the SDK.
for (const f of files) {
  if (f.path === "src/lib/analytics.ts") continue;
  assert.ok(!/from ["']helo-sdk["']|import\(["']helo-sdk["']\)/.test(f.text), `${f.path}: import helo-sdk only in src/lib/analytics.ts`);
}

// 2. No tracking from server code: the SDK is browser only, and a server call would silently do nothing.
// Only client components ("use client") may import the wrapper.
for (const f of files) {
  if (!/from ["']@\/lib\/analytics["']/.test(f.text)) continue;
  assert.ok(/^\s*["']use client["']/.test(f.text), `${f.path}: imports @/lib/analytics but isn't a "use client" file`);
}

// 3. Every catalogued event is sent somewhere (a dead event means a flow was removed or renamed). Only lines
// that send count: track(…), logout(…, "X"), trackPageView(…) or <TrackEvent name="X">; UI copy doesn't.
const sending = files
  .filter((f) => f.path !== "src/lib/analytics-events.ts")
  .flatMap((f) => f.text.split("\n"))
  .filter((l) => /\btrack\(|\blogout\(|trackPageView\(|name=["']/.test(l))
  .join("\n");
for (const e of events) {
  const used = sending.includes(`"${e}"`) || sending.includes(`'${e}'`);
  assert.ok(used, `event "${e}" is in the catalogue but never sent: wire it or remove it (and from the tracking plan)`);
}

// 4. The tracking plan lists exactly the catalogue.
const plan = readFileSync(join(root, "docs/analytics/tracking-plan.md"), "utf8");
const planned = new Set([...plan.matchAll(/^\| `([^`]+)` \|/gm)].map((m) => m[1]));
for (const e of events) assert.ok(planned.has(e), `docs/analytics/tracking-plan.md is missing "${e}"`);
for (const p of planned) assert.ok(events.includes(p), `docs/analytics/tracking-plan.md lists "${p}", which the catalogue doesn't have`);

console.log(`analytics guard: ${events.length} events, all wired and planned`);
