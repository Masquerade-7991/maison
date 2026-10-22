// Run: node src/lib/markets.check.mjs  (Node 23+ strips the TS types)
import assert from "node:assert/strict";
import { currencyDigits, fallbackRates, localPair, localPrice, marketById, marketForCountry, markets } from "./markets.ts";

// Country → market.
assert.equal(marketForCountry("IN").id, "in");
assert.equal(marketForCountry("de").id, "eu", "lower case works; Germany is in the eurozone");
assert.equal(marketForCountry("LI").id, "ch");
assert.equal(marketForCountry("BR").id, "intl", "unsupported country → International");
assert.equal(marketForCountry(undefined).id, "us", "no country (local dev) → US");
assert.equal(marketById("nope").id, "us", "unknown cookie → US");

// Every market id is unique, and no country is claimed by two markets (International aside).
assert.equal(new Set(markets.map((m) => m.id)).size, markets.length);
const claimed = markets.filter((m) => m.id !== "intl").flatMap((m) => m.countries);
assert.equal(new Set(claimed).size, claimed.length, "a country belongs to one market");

// Minor units.
assert.equal(currencyDigits("USD"), 2);
assert.equal(currencyDigits("JPY"), 0);
assert.equal(currencyDigits("KRW"), 0);
assert.equal(currencyDigits("INR"), 2);

// Conversion: USD stays exact; other currencies become whole-unit price points.
const rates = { ...fallbackRates(), INR: 94.82, JPY: 157.05, GBP: 0.74761 };
assert.equal(localPrice(12345, marketById("us"), rates), 12345, "$123.45 stays exact in USD");
assert.equal(localPrice(11000, marketById("in"), rates), 1000000, "$110 → ₹10,000 (10,430 at 94.82)");
assert.equal(localPrice(11000, marketById("jp"), rates), 17000, "$110 → ¥17,000, whole yen");
assert.equal(localPrice(7600, marketById("gb"), rates), 5700, "$76 → £57");
assert.equal(localPrice(11000, marketById("intl"), rates), 11000, "International pays dollars");
for (const m of markets) {
  const p = localPrice(1100, m, rates);
  assert.ok(Number.isInteger(p) && p > 0 && p % 10 ** currencyDigits(m.currency) === 0, `${m.id}: whole units`);
}
assert.deepEqual(localPair(23000, 28000, marketById("in"), rates), { price: 2200000, compareAt: 2700000 }, "was price stays above");

console.log("markets checks passed");
