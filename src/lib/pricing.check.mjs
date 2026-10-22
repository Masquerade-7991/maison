// Run: node src/lib/pricing.check.mjs  (Node 23+ strips the TS types)
import assert from "node:assert/strict";
import { pricePair, pricePoint } from "./pricing.ts";

// Two significant figures, whole units (minor units in, minor units out).
assert.equal(pricePoint(7627), 7600, "$76.27 → $76");
assert.equal(pricePoint(27340), 27000, "$273.40 → $270");
assert.equal(pricePoint(5860), 5900, "£58.60 → £59");
assert.equal(pricePoint(1067), 1100, "$10.67 → $11");
assert.equal(pricePoint(943), 900, "$9.43 → $9");
assert.equal(pricePoint(643700), 640000, "₹6,437 → ₹6,400");
assert.equal(pricePoint(11253, 0), 11000, "¥11,253 → ¥11,000 (no minor unit)");
assert.equal(pricePoint(12, 2), 100, "never below one whole unit");

// The ÷15 price cut on real catalogue prices.
assert.equal(pricePoint(160000 / 15), 11000, "$1,600 → $110");
assert.equal(pricePoint(410000 / 15), 27000, "$4,100 → $270");
assert.equal(pricePoint(16000 / 15), 1100, "$160 → $11");

// A "was" price always stays above the price.
assert.deepEqual(pricePair(340000 / 15, 420000 / 15), { price: 23000, compareAt: 28000 }, "$3,400 was $4,200");
assert.deepEqual(pricePair(10000, 10100), { price: 10000, compareAt: 11000 }, "equal after rounding: was moves up a step");
assert.deepEqual(pricePair(5000, null), { price: 5000, compareAt: null });

console.log("pricing checks passed");
