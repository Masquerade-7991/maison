// Run: node src/lib/analytics-events.check.mjs  (Node 23+ strips the TS types)
import assert from "node:assert/strict";
import { cleanProps, latePurchaseOk, toMajor, validEventName } from "./analytics-events.ts";

// Money: minor units to the amount Helo records, per currency.
assert.equal(toMajor(180000, "inr"), 1800);
assert.equal(toMajor(12345, "USD"), 123.45);
assert.equal(toMajor(17000, "JPY"), 17000, "yen has no minor unit");
assert.equal(toMajor(250000, "KRW"), 250000, "won has no minor unit");
assert.ok(toMajor(0, "INR") >= 0);

// Names: 1 to 128 characters.
assert.ok(validEventName("Product Viewed"));
assert.ok(!validEventName(""));
assert.ok(!validEventName("x".repeat(129)));

// Personal details never reach event properties.
const { props, removed } = cleanProps({ product_id: "scarf", email: "a@b.c", phone: "+91…", line1: "12 MG Road", message: "hi", qty: 1, size: undefined });
assert.deepEqual(props, { product_id: "scarf", qty: 1 });
assert.deepEqual(removed.sort(), ["email", "line1", "message", "phone"]);
assert.deepEqual(cleanProps({ name: "Merino knit scarf", city: "Bengaluru" }).removed, [], "product names and cities are fine");

// Person names never pass; a product's name does.
assert.deepEqual(cleanProps({ full_name: "A", first_name: "A", shipping_name: "A", customer_email: "a@b.c", name: "Scarf" }).props, { name: "Scarf" });

// Late purchases: within 7 days of payment, never cancelled, never unpaid.
const now = Date.parse("2026-10-28T12:00:00Z");
const day = 86_400_000;
assert.ok(latePurchaseOk({ paidAt: new Date(now - 2 * day), fulfilmentStatus: "shipped" }, now));
assert.ok(!latePurchaseOk({ paidAt: new Date(now - 8 * day), fulfilmentStatus: "delivered" }, now), "too old");
assert.ok(!latePurchaseOk({ paidAt: new Date(now - day), fulfilmentStatus: "cancelled" }, now), "cancelled");
assert.ok(!latePurchaseOk({ paidAt: null, fulfilmentStatus: "unfulfilled" }, now), "unpaid");

console.log("analytics event checks passed");
