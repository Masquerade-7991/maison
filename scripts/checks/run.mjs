// Runs every src/**/*.check.mjs (the pure-rule checks) and fails if any does. `npm run check`.
import { spawnSync } from "node:child_process";
import { globSync } from "node:fs";

let failed = 0;
for (const file of globSync("src/**/*.check.mjs").sort()) {
  const r = spawnSync(process.execPath, ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", file], { encoding: "utf8" });
  const out = (r.stdout + r.stderr).trim().split("\n").pop();
  console.log(`${r.status === 0 ? "ok  " : "FAIL"} ${file}${r.status === 0 ? "" : `\n     ${out}`}`);
  if (r.status !== 0) failed++;
}
process.exit(failed ? 1 : 0);
