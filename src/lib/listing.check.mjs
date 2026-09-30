// Run: node src/lib/listing.check.mjs  (Node 23+ strips the TS types)
import assert from "node:assert/strict";
import { filterProducts } from "./listing.ts";
import { isBuyable, stockCopy, stockState } from "./stock.ts";

const d = (h) => new Date(Date.UTC(2026, 8, 1) - h * 3_600_000);
const p = (slug, o) => ({ slug, price: 100, colour: "Black", department: "women", category: { slug: "bags" }, stockQuantity: 10, madeToOrder: false, createdAt: d(0), ...o });

const list = [
  p("a", { price: 450, colour: "Blue", createdAt: d(1) }),
  p("b", { price: 2000, department: "men", category: { slug: "shoes" }, createdAt: d(2) }),
  p("c", { price: 800, department: "unisex", stockQuantity: 0, createdAt: d(0) }),
  p("d", { price: 300, colour: "Blue", department: "men", createdAt: d(3) }),
];
const slugs = (xs) => xs.map((x) => x.slug).join("");

assert.equal(slugs(filterProducts(list, { sort: "price-asc" })), "dacb", "price-asc");
assert.equal(slugs(filterProducts(list, { sort: "price-desc" })), "bcad", "price-desc");
assert.equal(slugs(filterProducts(list, { sort: "newest" })), "cabd", "newest by createdAt");
assert.equal(slugs(filterProducts(list, {})), "abdc", "featured: sold out last, then newest");
assert.equal(slugs(filterProducts(list, { department: "men", sort: "newest" })), "cbd", "department includes unisex");
assert.equal(slugs(filterProducts(list, { category: "shoes" })), "b", "category");
assert.equal(slugs(filterProducts(list, { colour: "Blue", price: "under-500", sort: "newest" })), "ad", "filters combine");
assert.equal(filterProducts(list, { category: "nope" }).length, 0, "unknown category matches nothing");

const s = (stockQuantity, madeToOrder = false) => stockState({ stockQuantity, madeToOrder });
assert.equal(s(4), "in_stock");
assert.equal(s(3), "low_stock");
assert.equal(s(1), "low_stock");
assert.equal(s(0), "sold_out");
assert.equal(s(0, true), "made_to_order");
assert.equal(s(5, true), "in_stock", "stock on hand wins over made to order");
assert.equal(s(2, true), "in_stock", "made to order with a few on hand is never 'Only 2 left'");
assert.equal(s(2), "low_stock");
assert.equal(stockCopy("low_stock", 2), "Only 2 left");
assert.equal(isBuyable("sold_out"), false);
assert.equal(isBuyable("made_to_order"), true);

console.log("listing + stock ok");
