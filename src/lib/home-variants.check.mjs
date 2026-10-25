// Run: node src/lib/home-variants.check.mjs  (Node 23+ strips the TS types)
import assert from "node:assert/strict";
import { homeVariantFor, homeVariants } from "./home-variants.ts";
import { markets } from "./markets.ts";
import { services } from "./sample-data.ts";
import { stories } from "./stories.ts";

// India and International keep the default; every other market has its own region.
assert.equal(homeVariantFor("in").hero.title, "The Quiet Season");
assert.equal(homeVariantFor("intl").hero.title, "The Quiet Season");
assert.equal(homeVariantFor("nowhere").hero.title, "The Quiet Season");
for (const m of markets.filter((m) => !["in", "intl"].includes(m.id))) assert.notEqual(homeVariantFor(m.id).id, "default", `${m.id} has a regional homepage`);
assert.equal(new Set(markets.map((m) => homeVariantFor(m.id).id)).size, 6, "six homepages in use");

const storySlugs = new Set(stories.map((s) => s.slug));
const serviceTitles = new Set(services.map((s) => s.title));
for (const v of homeVariants) {
  assert.ok(v.hero.src.startsWith("https://images.unsplash.com/"), `${v.id}: hero on the allowed image host`);
  const kinds = v.sections.map((s) => s.kind);
  assert.equal(new Set(kinds.filter((k) => k !== "products")).size, kinds.filter((k) => k !== "products").length, `${v.id}: no section twice`);
  for (const s of v.sections) {
    if (s.kind === "products") {
      assert.ok(s.slugs.length >= 10, `${v.id} "${s.title}": eight pieces plus backups for sold-out ones`);
      assert.equal(new Set(s.slugs).size, s.slugs.length, `${v.id} "${s.title}": no piece twice`);
    }
    if (s.kind === "stories") for (const slug of s.slugs) assert.ok(storySlugs.has(slug), `${v.id}: story ${slug} exists`);
    if (s.kind === "services") for (const t of s.lead ?? []) assert.ok(serviceTitles.has(t), `${v.id}: service "${t}" exists`);
    if (s.kind === "editorial") assert.ok(s.image.src.startsWith("https://images.unsplash.com/"), `${v.id}: editorial image host`);
  }
}

console.log("home variant checks passed");
