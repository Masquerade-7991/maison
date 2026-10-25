// Run: node src/lib/address-rules.check.mjs  (Node 23+ strips the TS types)
import assert from "node:assert/strict";
import { ADDRESS_FIELDS, INDIAN_STATES, UPI_MAX_PAISE, parseAddressForm, upiAllowed, upiDeviceReady } from "./address-rules.ts";

const form = (o = {}) => {
  const v = { name: "Asha Rao", phone: "98765 43210", line1: "12 MG Road", line2: "", city: "Bengaluru", state: "Karnataka", postalCode: "560001", ...o };
  return (k) => v[k] ?? "";
};

const ok = parseAddressForm(form());
assert.equal(ok.ok, true);
assert.deepEqual(ok.value, {
  name: "Asha Rao",
  phone: "+919876543210",
  address: { line1: "12 MG Road", line2: null, city: "Bengaluru", state: "Karnataka", postal_code: "560001", country: "IN" },
});

// Trimmed; an optional second line is kept.
const trimmed = parseAddressForm(form({ name: "  Asha ", line1: " 12 MG Road ", line2: " Flat 4 ", city: " Bengaluru " }));
assert.equal(trimmed.value.name, "Asha");
assert.equal(trimmed.value.address.line1, "12 MG Road");
assert.equal(trimmed.value.address.line2, "Flat 4");
assert.equal(trimmed.value.address.city, "Bengaluru");

// Every way of writing an Indian mobile number comes out the same.
for (const p of ["+91 98765 43210", "09876543210", "9876543210", "+919876543210", "919876543210", "98765-43210"])
  assert.equal(parseAddressForm(form({ phone: p })).value?.phone, "+919876543210", `phone "${p}"`);

const errs = (o) => parseAddressForm(form(o)).errors ?? {};
for (const bad of ["", "A", "x".repeat(101), "   "]) assert.ok(errs({ name: bad }).name, `name "${bad}"`);
assert.equal(errs({ name: "Al" }).name, undefined);
for (const bad of ["", "12345", "5876543210", "98765432100", "+1 9876543210", "+91 0876543210", "abcdefghij"]) assert.ok(errs({ phone: bad }).phone, `phone "${bad}"`);
assert.ok(errs({ line1: "" }).line1);
assert.ok(errs({ line1: "x".repeat(201) }).line1);
assert.equal(errs({ line1: "x".repeat(200) }).line1, undefined);
assert.ok(errs({ line2: "x".repeat(201) }).line2);
assert.ok(errs({ city: "" }).city);
assert.ok(errs({ city: "x".repeat(101) }).city);
for (const bad of ["", "Bangalore", "karnataka", "California"]) assert.ok(errs({ state: bad }).state, `state "${bad}"`);
for (const bad of ["", "56000", "5600011", "060001", "56A001"]) assert.ok(errs({ postalCode: bad }).postalCode, `PIN "${bad}"`);

// Every field reports at once.
assert.deepEqual(Object.keys(parseAddressForm(() => "").errors).sort(), ADDRESS_FIELDS.filter((f) => f !== "line2").sort());

// The official list: 28 states and 8 union territories, sorted, no duplicates.
assert.equal(INDIAN_STATES.length, 36);
assert.equal(new Set(INDIAN_STATES).size, 36);
assert.deepEqual([...INDIAN_STATES].sort(), INDIAN_STATES);
for (const s of INDIAN_STATES) assert.equal(errs({ state: s }).state, undefined);

// UPI: India and rupees only, up to ₹1,00,000.
assert.equal(upiAllowed("in", "INR", 640_000), true);
assert.equal(upiAllowed("in", "inr", UPI_MAX_PAISE), true, "the cap itself is allowed");
assert.equal(upiAllowed("in", "INR", UPI_MAX_PAISE + 1), false);
assert.equal(upiAllowed("in", "INR", 0), false);
assert.equal(upiAllowed("us", "INR", 640_000), false);
assert.equal(upiAllowed("in", "USD", 640_000), false);

// UPI by device: QR works everywhere, intent only on phones, nothing without either.
const android = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36";
const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
const desktop = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36";
assert.ok(upiDeviceReady(desktop, { upi: true, intent: false }), "QR: computers");
assert.ok(upiDeviceReady(android, { upi: false, intent: true }) && upiDeviceReady(iphone, { upi: false, intent: true }), "intent: phones");
assert.ok(!upiDeviceReady(desktop, { upi: false, intent: true }), "intent alone: not on a computer");
assert.ok(!upiDeviceReady(android, { upi: false, intent: false }) && !upiDeviceReady(android, null), "nothing enabled or unknown");

console.log("address rules ok");
