// node src/lib/cart-rules.check.mjs
import assert from "node:assert/strict";
import { isValidQuantity, isValidSize, lineIssue, lineMax, maxAllowed, subtotalCents } from "./cart-rules.ts";

// maxAllowed: stock, capped at 10; made to order is always 10; sold out is 0.
assert.equal(maxAllowed({ stockQuantity: 25, madeToOrder: false }), 10);
assert.equal(maxAllowed({ stockQuantity: 3, madeToOrder: false }), 3);
assert.equal(maxAllowed({ stockQuantity: 0, madeToOrder: false }), 0);
assert.equal(maxAllowed({ stockQuantity: 0, madeToOrder: true }), 10);
assert.equal(maxAllowed({ stockQuantity: -1, madeToOrder: false }), 0, "never negative");

// lineMax: other sizes of the same product use up the allowance.
assert.equal(lineMax(3, 3, 1), 1, "3 allowed, 2 in another size → this line may hold 1");
assert.equal(lineMax(3, 2, 2), 3);
assert.equal(lineMax(2, 4, 1), 0, "stock fell below what other sizes hold");

// Quantities are whole numbers 1–10.
for (const bad of [0, -1, 11, 999, 1.5, NaN]) assert.equal(isValidQuantity(bad), false, `rejects ${bad}`);
for (const ok of [1, 5, 10]) assert.equal(isValidQuantity(ok), true);

// Sizes must come from the category's list; sizeless categories take "".
assert.equal(isValidSize(["S", "M"], "M"), true);
assert.equal(isValidSize(["S", "M"], "XL"), false);
assert.equal(isValidSize(["S", "M"], ""), false, "a size is required when the category has sizes");
assert.equal(isValidSize([], ""), true);
assert.equal(isValidSize([], "M"), false);

// Subtotal is exact integer cents.
assert.equal(subtotalCents([]), 0);
assert.equal(subtotalCents([{ priceCents: 145000, quantity: 2 }, { priceCents: 9999, quantity: 3 }]), 319997);

// Issues appear when stock drops below what's in the bag.
assert.equal(lineIssue(0, 1), "sold_out");
assert.equal(lineIssue(2, 3), "over_stock");
assert.equal(lineIssue(3, 3), null);

console.log("cart rules ok");
