// The only module that reads or writes cart_items, the way products.ts owns the catalogue.
// Every function takes the userId from the caller's session; nothing here trusts the browser.
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { cartItems, categories, productImages, products } from "@/db/schema";
import { lineIssue, lineMax, maxAllowed, subtotalCents, type Bag, type BagLine } from "@/lib/cart-rules";
import { stockState } from "@/lib/stock";

/** The signed-in user's bag, priced from the live products table. */
export async function getBag(userId: string): Promise<Bag> {
  const rows = await db
    .select({
      productId: cartItems.productId,
      size: cartItems.size,
      quantity: cartItems.quantity,
      slug: products.slug,
      name: products.name,
      colour: products.colour,
      priceCents: products.priceCents,
      stockQuantity: products.stockQuantity,
      madeToOrder: products.madeToOrder,
      stockDetail: products.stockDetail,
      categoryName: categories.name,
      imageUrl: productImages.url,
      imageAlt: productImages.alt,
    })
    .from(cartItems)
    .innerJoin(products, eq(products.id, cartItems.productId))
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(productImages, and(eq(productImages.productId, products.id), eq(productImages.position, 0)))
    .where(eq(cartItems.userId, userId))
    .orderBy(asc(cartItems.createdAt), asc(cartItems.size));

  // Stock is per product, so a product's sizes share one allowance.
  const productTotals = new Map<string, number>();
  for (const r of rows) productTotals.set(r.productId, (productTotals.get(r.productId) ?? 0) + r.quantity);

  const lines: BagLine[] = rows.map((r) => {
    const allowed = maxAllowed(r);
    const productTotal = productTotals.get(r.productId)!;
    return {
      productId: r.productId,
      slug: r.slug,
      name: r.name,
      colour: r.colour,
      categoryName: r.categoryName,
      size: r.size,
      imageUrl: r.imageUrl,
      imageAlt: r.imageAlt ?? r.name,
      priceCents: r.priceCents,
      quantity: r.quantity,
      allowed,
      lineMax: lineMax(allowed, productTotal, r.quantity),
      issue: lineIssue(allowed, productTotal),
      stock: stockState(r),
      stockQuantity: r.stockQuantity,
      stockDetail: r.stockDetail,
    };
  });

  const payable = lines.filter((l) => l.issue !== "sold_out");
  return {
    lines,
    itemCount: lines.reduce((n, l) => n + l.quantity, 0),
    payableCount: payable.reduce((n, l) => n + l.quantity, 0),
    subtotalCents: subtotalCents(payable),
    hasIssues: lines.some((l) => l.issue),
  };
}

/** Live stock and category for a product the browser named by slug. */
export async function findProductForBag(slug: string) {
  const [row] = await db
    .select({
      id: products.id,
      name: products.name,
      stockQuantity: products.stockQuantity,
      madeToOrder: products.madeToOrder,
      categorySlug: categories.slug,
    })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(eq(products.slug, slug))
    .limit(1);
  return row ?? null;
}

/** Quantities this user holds of one product, per size. */
export async function productLines(userId: string, productId: string) {
  return db
    .select({ size: cartItems.size, quantity: cartItems.quantity })
    .from(cartItems)
    .where(and(eq(cartItems.userId, userId), eq(cartItems.productId, productId)));
}

// ponytail: the stock check and the write are two HTTP round trips (neon-http has no transactions), so two
// simultaneous adds from the same user can overshoot by one. The bag page flags it (over_stock) and checkout
// will re-check; move to a single conditional statement if that ever matters.
export async function addLine(userId: string, productId: string, size: string, quantity: number) {
  await db
    .insert(cartItems)
    .values({ userId, productId, size, quantity })
    .onConflictDoUpdate({
      target: [cartItems.userId, cartItems.productId, cartItems.size],
      set: { quantity: sql`${cartItems.quantity} + ${quantity}`, updatedAt: new Date() },
    });
}

/** Returns false when the user has no such line. */
export async function setLineQuantity(userId: string, productId: string, size: string, quantity: number) {
  const updated = await db
    .update(cartItems)
    .set({ quantity })
    .where(and(eq(cartItems.userId, userId), eq(cartItems.productId, productId), eq(cartItems.size, size)))
    .returning({ quantity: cartItems.quantity });
  return updated.length > 0;
}

export async function removeLine(userId: string, productId: string, size: string) {
  await db
    .delete(cartItems)
    .where(and(eq(cartItems.userId, userId), eq(cartItems.productId, productId), eq(cartItems.size, size)));
}
