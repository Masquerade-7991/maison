// Listing filters, sorts and swatches. Pure functions over the mapped Product type, no db access.
import type { Product } from "./products";
import { isBuyable, stockState } from "./stock.ts"; // .ts extension: listing.check.mjs runs this file in Node

export const colourSwatch: Record<string, string> = {
  Black: "#111111",
  White: "#f4f4f2",
  Cream: "#ece3d0",
  Grey: "#9a9a9a",
  Silver: "#c8c8c8",
  Gold: "#c9a45c",
  Tan: "#c19a6b",
  Brown: "#6f4a32",
  Red: "#b3261e",
  Pink: "#e7b8b5",
  Purple: "#5e2a54",
  Blue: "#4a6f9b",
  Navy: "#1f2a44",
  Green: "#4e6b4a",
};

export const priceBands = [
  { slug: "under-500", label: "Under $500", test: (n: number) => n < 500 },
  { slug: "500-1500", label: "$500 – $1,500", test: (n: number) => n >= 500 && n <= 1500 },
  { slug: "over-1500", label: "Over $1,500", test: (n: number) => n > 1500 },
];

export const sorts = [
  { slug: "featured", label: "Featured" },
  { slug: "newest", label: "Newest" },
  { slug: "price-asc", label: "Price: low to high" },
  { slug: "price-desc", label: "Price: high to low" },
];

export type Filters = {
  category?: string;
  department?: string;
  colour?: string;
  price?: string;
  sort?: string;
};

type Listable = Pick<Product, "price" | "colour" | "department" | "createdAt" | "stockQuantity" | "madeToOrder"> & {
  category: { slug: string };
};

// ponytail: filters run in memory over one view's products; move them into the SQL where-clause
// in src/lib/products.ts once a single view holds a few hundred products.
// One value per filter; switch to string[] per key if multi-select is needed.
export function filterProducts<T extends Listable>(list: T[], f: Filters): T[] {
  const band = priceBands.find((b) => b.slug === f.price);
  const out = list.filter(
    (p) =>
      (!f.category || p.category.slug === f.category) &&
      (!f.department || p.department === f.department || p.department === "unisex") &&
      (!f.colour || p.colour === f.colour) &&
      (!band || band.test(p.price)),
  );
  const newest = (a: T, b: T) => b.createdAt.getTime() - a.createdAt.getTime();
  if (f.sort === "price-asc") out.sort((a, b) => a.price - b.price);
  else if (f.sort === "price-desc") out.sort((a, b) => b.price - a.price);
  else if (f.sort === "newest") out.sort(newest);
  // Featured: anything you can buy first, then newest.
  else {
    const soldOut = (p: T) => Number(!isBuyable(stockState(p)));
    out.sort((a, b) => soldOut(a) - soldOut(b) || newest(a, b));
  }
  return out;
}
