// Run: node src/lib/contact-rules.check.mjs  (Node 23+ strips the TS types)
import assert from "node:assert/strict";
import { CONTACT_TOPICS, MESSAGE_MAX, parseContactForm } from "./contact-rules.ts";

const form = (o = {}) => {
  const v = { name: "Ada Lovelace", email: "ada@example.com", orderRef: "", topic: "Order", message: "Where is my parcel, please?", ...o };
  return (k) => v[k] ?? "";
};

const ok = parseContactForm(form());
assert.equal(ok.ok, true);
assert.deepEqual(ok.value, { name: "Ada Lovelace", email: "ada@example.com", orderRef: null, topic: "Order", message: "Where is my parcel, please?" });

// Trimmed, and an order reference is normalised to upper case.
const trimmed = parseContactForm(form({ name: "  Ada ", email: " ada@example.com ", orderRef: " msn-1a2b3c4d ", message: "  Ten chars!  " }));
assert.equal(trimmed.ok, true);
assert.equal(trimmed.value.name, "Ada");
assert.equal(trimmed.value.orderRef, "MSN-1A2B3C4D");

const errs = (o) => parseContactForm(form(o)).errors ?? {};
assert.ok(errs({ name: "" }).name);
assert.ok(errs({ name: "x".repeat(101) }).name);
for (const bad of ["", "no-at-sign", "a@b", "a b@c.com", `${"x".repeat(250)}@e.com`]) assert.ok(errs({ email: bad }).email, `email "${bad}"`);
for (const bad of ["123", "MSN-123", "MSN-ZZZZZZZZ", "ORD-1A2B3C4D"]) assert.ok(errs({ orderRef: bad }).orderRef, `ref "${bad}"`);
assert.ok(errs({ topic: "" }).topic);
assert.ok(errs({ topic: "Refund me now" }).topic, "only the fixed topics");
for (const t of CONTACT_TOPICS) assert.equal(errs({ topic: t }).topic, undefined);
assert.ok(errs({ message: "short" }).message);
assert.ok(errs({ message: "         " }).message, "whitespace doesn't count");
assert.ok(errs({ message: "x".repeat(MESSAGE_MAX + 1) }).message);
assert.equal(errs({ message: "x".repeat(MESSAGE_MAX) }).message, undefined);

console.log("contact rules ok");
