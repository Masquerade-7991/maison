// node src/lib/auth-validation.check.mjs
import assert from "node:assert/strict";
import { validate, validateField } from "./auth-validation.ts";

const ok = { name: "Ada", email: "ada@example.com", password: "12345678" };

assert.deepEqual(validate("sign-up", ok), {});
assert.deepEqual(validate("sign-in", { ...ok, name: "" }), {}, "name is not asked for on sign-in");
assert.deepEqual(Object.keys(validate("sign-up", { name: " ", email: "", password: "" })), ["name", "email", "password"]);

for (const bad of ["ada", "ada@", "ada@example", "a da@example.com", "@example.com"])
  assert.ok(validateField("sign-up", "email", bad), `rejects ${bad}`);
assert.equal(validateField("sign-up", "email", "  ada@example.com  "), undefined, "trims before checking");

assert.match(validateField("sign-up", "password", "1234567"), /at least 8/);
assert.equal(validateField("sign-up", "password", "12345678"), undefined);
assert.match(validateField("sign-up", "password", "x".repeat(129)), /at most 128/);
assert.equal(validateField("sign-in", "password", "short"), undefined, "sign-in doesn't reveal the rules");
assert.match(validateField("sign-in", "password", ""), /Enter your password/);

console.log("auth validation ok");
