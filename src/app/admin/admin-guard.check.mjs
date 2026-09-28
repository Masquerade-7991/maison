// node src/app/admin/admin-guard.check.mjs
// Fails if any admin page skips requireAdmin(), or any admin Server Action / data function doesn't
// start with assertAdmin(). Static on purpose: it catches the route or action someone adds next.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const adminFiles = walk(join(root, "src/app/admin"));

// Every page (or route handler) under /admin: the default export awaits requireAdmin() first. The one
// thing allowed before it is reading the route params, which the sign-in `next` path is built from.
const pages = adminFiles.filter((f) => /[\\/](page|route)\.tsx?$/.test(f));
assert.ok(pages.length > 0, "no admin pages found");
for (const f of pages) {
  const body = readFileSync(f, "utf8").match(/export default async function \w+\([^)]*\)[^{]*\{\s*([^;]+);\s*([^;]*);?/);
  assert.ok(body, `${f}: default export must be an async function`);
  const [, first, second] = body;
  const guard = /^const \{[\w\s,]+\} = await params$/.test(first) ? second : first;
  assert.match(guard, /^(const [^=]+= )?await requireAdmin\(/, `${f}: first statement must be await requireAdmin()`);
}

// Every exported async function in admin action files and admin-only lib modules starts with assertAdmin().
// Any file under src/app/admin with a "use server" directive counts as an action file, whatever its name.
const useServer = (f) => /["']use server["']/.test(readFileSync(f, "utf8"));
const guarded = [
  ...adminFiles.filter((f) => /\.[jt]sx?$/.test(f) && (/[\\/]actions\.ts$/.test(f) || useServer(f))),
  ...["src/lib/users.ts", ...readdirSync(join(root, "src/lib")).filter((n) => /^admin-.*\.ts$/.test(n)).map((n) => `src/lib/${n}`)]
    .map((p) => join(root, p))
    .filter(existsSync),
];
// `export async function f() {`, `export const f = async (...) => {` and `export const f = async function () {`.
const exported = /export (?:async function (\w+)\([^)]*\)[^{]*|const (\w+)\s*=\s*async\b(?:[^;]*?=>\s*|\s+function\b[^{]*))\{\s*([^;]+);/g;
let fns = 0;
for (const f of guarded) {
  const src = readFileSync(f, "utf8");
  for (const [, fn, arrow, first] of src.matchAll(exported)) {
    fns++;
    assert.match(first, /await assertAdmin\(\)/, `${f}: ${fn ?? arrow}() must start with await assertAdmin()`);
  }
  // An async arrow with an expression body has no statement to put the check in.
  for (const [, name] of src.matchAll(/export const (\w+)\s*=\s*async\b[^;]*?=>(?!\s*\{)/g)) {
    assert.fail(`${f}: ${name} must have a block body that starts with await assertAdmin()`);
  }
}
assert.ok(fns > 0, "no admin actions found");

console.log(`admin guard ok: ${pages.length} pages, ${fns} actions/data functions`);
