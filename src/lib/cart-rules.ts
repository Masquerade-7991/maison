// Bag rules and shapes with no database access, so client components and check files can import them.
// src/lib/cart.ts is the only module that reads or writes cart_items.
import type { StockState } from "@/lib/stock";

export const MAX_PER_PRODUCT = 10; // also enforced by cart_items_quantity_range in src/db/schema.ts

export type StockInfo = { stockQuantity: number; madeToOrder: boolean };

/** Most of one product a bag may hold, summed across its sizes (sizes aren't stocked separately). 0 = sold out. */
export const maxAllowed = (p: StockInfo) =>
  p.madeToOrder ? MAX_PER_PRODUCT : Math.max(0, Math.min(p.stockQuantity, MAX_PER_PRODUCT));

/** Highest quantity one line may be set to, given what the product's other sizes already take. */
export const lineMax = (allowed: number, productTotal: number, lineQuantity: number) =>
  Math.max(0, allowed - (productTotal - lineQuantity));

export const isValidQuantity = (n: number) => Number.isInteger(n) && n >= 1 && n <= MAX_PER_PRODUCT;

/** Categories with a size list need one of those sizes; one-size categories store "". */
export const isValidSize = (sizes: string[], size: string) => (sizes.length ? sizes.includes(size) : size === "");

export const lineTotalCents = (priceCents: number, quantity: number) => priceCents * quantity;

export const subtotalCents = (lines: { priceCents: number; quantity: number }[]) =>
  lines.reduce((sum, l) => sum + lineTotalCents(l.priceCents, l.quantity), 0);

/** Why a line can't be bought as it stands (stock changed after it was added), or null. */
export type BagIssue = "sold_out" | "over_stock" | null;
export const lineIssue = (allowed: number, productTotal: number): BagIssue =>
  allowed === 0 ? "sold_out" : productTotal > allowed ? "over_stock" : null;

export type BagLine = {
  productId: string;
  slug: string;
  name: string;
  colour: string;
  categoryName: string;
  size: string;
  imageUrl: string | null;
  imageAlt: string;
  priceCents: number; // live from products, never stored with the line
  quantity: number;
  lineMax: number;
  allowed: number;
  issue: BagIssue;
  stock: StockState;
  stockQuantity: number;
  stockDetail: string | null;
};

/** itemCount is everything in the bag; payableCount and subtotalCents leave out sold-out lines, which can't be ordered. */
export type Bag = { lines: BagLine[]; itemCount: number; payableCount: number; subtotalCents: number; hasIssues: boolean };
