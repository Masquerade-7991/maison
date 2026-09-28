// node src/lib/admin-rules.check.mjs
import assert from "node:assert/strict";
import { centsToInput, isAllowedImageUrl, parseCategoryForm, parseProductForm, parseStock, slugify, toCents } from "./admin-rules.ts";

// Money is parsed as text: no float drift, no fractions of a cent.
assert.equal(toCents("1450"), 145000);
assert.equal(toCents("1,450.00"), 145000);
assert.equal(toCents("$1450.5"), 145050);
assert.equal(toCents("0.1"), 10);
assert.equal(toCents("19.99"), 1999);
assert.equal(toCents("0.29"), 29, "0.29 * 100 is 28.999… as a float");
for (const bad of ["", "abc", "12.345", "-5", "1e3", "12.", ".5", "1,45.00", "12 00"]) assert.equal(toCents(bad), null, `"${bad}" is not money`);
assert.equal(centsToInput(145050), "1450.50");
assert.equal(centsToInput(9), "0.09");
assert.equal(toCents(centsToInput(123456)), 123456, "round trip");

assert.equal(slugify("Satin Bomber Jacket"), "satin-bomber-jacket");
assert.equal(slugify("  Crêpe — 'Été' coat!! "), "crepe-ete-coat");
assert.equal(slugify("---"), "");

assert.ok(isAllowedImageUrl("https://images.unsplash.com/photo-1?w=800"));
for (const bad of ["http://images.unsplash.com/x", "https://images.unsplash.com.evil.com/x", "https://evil.com/images.unsplash.com", "javascript:alert(1)", "not a url"])
  assert.ok(!isAllowedImageUrl(bad), bad);

const good = {
  name: "Silk Scarf",
  slug: "",
  description: "A scarf.",
  categoryId: "5b9f3a3e-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
  department: "unisex",
  colour: "Ivory",
  price: "320",
  compareAt: "",
  stockQuantity: "4",
  stockDetail: "",
  imageUrl: "https://images.unsplash.com/photo-1",
  imageAlt: "Ivory silk scarf",
  madeToOrder: "on",
};
const parse = (over, create = true) => parseProductForm((k) => ({ ...good, ...over })[k] ?? "", { create });

const ok = parse({});
assert.ok(ok.ok);
assert.equal(ok.value.slug, "silk-scarf", "slug derived from the name");
assert.equal(ok.value.priceCents, 32000);
assert.equal(ok.value.compareAtCents, null);
assert.equal(ok.value.madeToOrder, true);
assert.equal(ok.value.isGift, false, "unchecked box is absent from the form");
assert.equal(ok.value.stockDetail, null);
assert.equal(parse({ slug: "Will Be Ignored" }, false).value.slug, "", "edit never reads the slug");

const err = (over, create) => { const r = parse(over, create); assert.ok(!r.ok, JSON.stringify(over)); return r.errors; };
assert.ok(err({ name: " " }).name);
assert.ok(err({ slug: "Bad Slug" }).slug);
assert.ok(err({ categoryId: "1; drop table products" }).categoryId);
assert.ok(err({ department: "kids" }).department);
assert.ok(err({ price: "0" }).priceCents);
assert.ok(err({ price: "12.345" }).priceCents);
assert.ok(err({ compareAt: "300" }).compareAtCents, "original price must be above price");
assert.ok(err({ compareAt: "320" }).compareAtCents);
assert.equal(parse({ compareAt: "400" }).value.compareAtCents, 40000);
for (const s of ["-1", "1.5", "", "abc", "100001"]) assert.ok(err({ stockQuantity: s }).stockQuantity, s);
assert.ok(err({ imageUrl: "https://example.com/a.jpg" }).imageUrl);
assert.ok(err({ description: "x".repeat(4001) }).description);
assert.deepEqual(Object.keys(err({ name: "", price: "x" })).sort(), ["name", "priceCents"], "every bad field reported at once");

// Stock editor: a whole number of units, 0..100000.
assert.equal(parseStock("0"), 0);
assert.equal(parseStock(" 12 "), 12);
assert.equal(parseStock("100000"), 100000);
for (const bad of ["", "-1", "1.5", "1e3", "abc", "100001", "0x10", "1 000"]) assert.equal(parseStock(bad), null, `"${bad}" is not stock`);

const cat = { name: "Knitwear", description: "Soft things.", imageUrl: "", imageAlt: "", position: "3" };
const parseCat = (over, create = true) => parseCategoryForm((k) => ({ ...cat, ...over })[k] ?? "", { create });
const c = parseCat({});
assert.ok(c.ok);
assert.deepEqual(c.value, { name: "Knitwear", slug: "knitwear", description: "Soft things.", imageUrl: null, imageAlt: null, position: 3 });
assert.equal(parseCat({ name: "Bags & Small Leather" }).value.slug, "bags-small-leather");
assert.equal(parseCat({ slug: "ignored" }, false).value.slug, "", "edit never derives a slug");
const withImage = parseCat({ imageUrl: "https://images.unsplash.com/photo-2", imageAlt: "Folded knits" });
assert.equal(withImage.value.imageUrl, "https://images.unsplash.com/photo-2");
const catErr = (over, create) => { const r = parseCat(over, create); assert.ok(!r.ok, JSON.stringify(over)); return r.errors; };
assert.ok(catErr({ name: "" }).name);
assert.ok(catErr({ name: "!!!" }).name, "a name with no slug-able characters");
assert.ok(parseCat({ name: "!!!" }, false).ok, "edit doesn't need a slug");
assert.ok(catErr({ name: "x".repeat(61) }).name);
assert.ok(catErr({ description: " " }).description);
assert.ok(catErr({ imageUrl: "https://example.com/a.jpg", imageAlt: "A" }).imageUrl);
assert.ok(catErr({ imageUrl: "https://images.unsplash.com/photo-2" }).imageAlt, "image needs its description");
assert.ok(catErr({ imageAlt: "Orphan description" }).imageUrl, "description needs its image");
for (const p of ["", "-1", "1.5", "10000", "abc"]) assert.ok(catErr({ position: p }).position, p);

console.log("admin rules ok");
