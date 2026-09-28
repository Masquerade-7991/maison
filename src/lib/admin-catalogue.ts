// Admin reads and writes of the catalogue: the counterpart of src/lib/products.ts, which stays the
// storefront's read-only view. Every exported function checks the role itself rather than trusting
// its caller (enforced by src/app/admin/admin-guard.check.mjs).
import { and, asc, count, desc, eq, ilike, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { categories, productImages, products } from "@/db/schema";
import type { CategoryErrors, CategoryInput, FieldErrors, ProductInput } from "@/lib/admin-rules";
import { assertAdmin } from "@/lib/session";

// ponytail: unpaginated, like listUsers; add limit/offset once the catalogue passes a few hundred products.
export async function listAdminProducts({ categoryId, q }: { categoryId?: string; q?: string } = {}) {
  await assertAdmin();
  const where: SQL[] = [];
  if (categoryId) where.push(eq(products.categoryId, categoryId));
  if (q) where.push(ilike(products.name, `%${q.replace(/[\\%_]/g, "\\$&")}%`));
  return db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      categoryName: categories.name,
      department: products.department,
      colour: products.colour,
      priceCents: products.priceCents,
      compareAtCents: products.compareAtCents,
      stockQuantity: products.stockQuantity,
      madeToOrder: products.madeToOrder,
      updatedAt: products.updatedAt,
      imageUrl: productImages.url,
      imageAlt: productImages.alt,
    })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(productImages, and(eq(productImages.productId, products.id), eq(productImages.position, 0)))
    .where(and(...where))
    .orderBy(desc(products.createdAt));
}

export async function listCategoryOptions() {
  await assertAdmin();
  return db.select({ id: categories.id, name: categories.name, slug: categories.slug }).from(categories).orderBy(asc(categories.position), asc(categories.name));
}

/** A product with its packshot (position 0), by id. Other gallery images are left alone by edits. */
export async function getAdminProduct(id: string) {
  await assertAdmin();
  const [row] = await db
    .select({ product: products, categorySlug: categories.slug, imageUrl: productImages.url, imageAlt: productImages.alt })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(productImages, and(eq(productImages.productId, products.id), eq(productImages.position, 0)))
    .where(eq(products.id, id))
    .limit(1);
  return row ? { ...row.product, categorySlug: row.categorySlug, imageUrl: row.imageUrl, imageAlt: row.imageAlt } : null;
}

export type SaveResult = { ok: true; id: string; slug: string } | { ok: false; errors?: FieldErrors; error?: string; currentStock?: number };

const pgCode = (e: unknown) => {
  const err = e as { code?: string; cause?: { code?: string } };
  return err.cause?.code ?? err.code;
};

async function categoryExists(id: string) {
  const [c] = await db.select({ id: categories.id }).from(categories).where(eq(categories.id, id)).limit(1);
  return !!c;
}

export async function createProduct(input: ProductInput): Promise<SaveResult> {
  await assertAdmin();
  if (!(await categoryExists(input.categoryId))) return { ok: false, errors: { categoryId: "That category no longer exists." } };
  const id = crypto.randomUUID();
  const { imageUrl, imageAlt, ...fields } = input;
  try {
    // db.batch is one transaction on neon-http: the product and its packshot land together or not at all.
    await db.batch([
      db.insert(products).values({ id, ...fields }),
      db.insert(productImages).values({ productId: id, url: imageUrl, alt: imageAlt, position: 0 }),
    ]);
  } catch (e) {
    if (pgCode(e) === "23505") return { ok: false, errors: { slug: "Another product already uses this slug." } };
    throw e;
  }
  return { ok: true, id, slug: input.slug };
}

/**
 * Saves an edit. `expectedStock` is the quantity the form was loaded with. If the admin left the
 * quantity alone, stock isn't written at all; if they changed it, the update only applies while stock
 * is still that number. Either way a sale (the webhook decrements stock) made while the form was open
 * is never silently overwritten. Product fields and the packshot
 * are written in ONE statement, so a refused update changes nothing.
 */
export async function updateProduct(id: string, input: Omit<ProductInput, "slug">, expectedStock: number): Promise<SaveResult> {
  await assertAdmin();
  if (!(await categoryExists(input.categoryId))) return { ok: false, errors: { categoryId: "That category no longer exists." } };
  const stockChanged = input.stockQuantity !== expectedStock;
  const result = await db.execute<{ slug: string }>(sql`
    with p as (
      update products set
        name = ${input.name}, description = ${input.description}, category_id = ${input.categoryId},
        department = ${input.department}::department, colour = ${input.colour},
        price_cents = ${input.priceCents}, compare_at_cents = ${input.compareAtCents},
        -- Untouched stock field: keep whatever the database has now, so a sale made meanwhile survives.
        stock_quantity = case when ${stockChanged} then ${input.stockQuantity} else stock_quantity end,
        made_to_order = ${input.madeToOrder},
        stock_detail = ${input.stockDetail}, is_gift = ${input.isGift}, updated_at = now()
      where id = ${id} and (not ${stockChanged} or stock_quantity = ${expectedStock})
      returning id, slug
    ),
    img as (
      insert into product_images (product_id, url, alt, position)
      select id, ${input.imageUrl}, ${input.imageAlt}, 0 from p
      on conflict (product_id, position) do update set url = excluded.url, alt = excluded.alt
    )
    select slug from p
  `);
  const slug = result.rows[0]?.slug;
  if (slug) return { ok: true, id, slug };

  const [now] = await db.select({ stock: products.stockQuantity }).from(products).where(eq(products.id, id));
  if (!now) return { ok: false, error: "This product no longer exists." };
  return {
    ok: false,
    currentStock: now.stock,
    errors: { stockQuantity: `Stock changed to ${now.stock} while you were editing (probably a sale). Nothing was saved: check the number and save again.` },
  };
}

export type StockResult = { ok: true; stock: number } | { ok: false; error: string; currentStock?: number };

/**
 * The stock editor's write: the same guard as updateProduct, in one statement. It only applies while
 * stock still equals `expected` (the number the form loaded), so a sale made meanwhile is never overwritten.
 */
export async function updateStock(id: string, expected: number, next: number): Promise<StockResult> {
  await assertAdmin();
  const [row] = await db
    .update(products)
    .set({ stockQuantity: next })
    .where(and(eq(products.id, id), eq(products.stockQuantity, expected)))
    .returning({ stock: products.stockQuantity });
  if (row) return { ok: true, stock: row.stock };

  const [now] = await db.select({ stock: products.stockQuantity }).from(products).where(eq(products.id, id));
  if (!now) return { ok: false, error: "This product no longer exists." };
  return { ok: false, currentStock: now.stock, error: `Stock changed to ${now.stock} meanwhile (probably a sale). Nothing was saved: check the number and save again.` };
}

// Piece counts are counted from products, never stored.
export async function listAdminCategories() {
  await assertAdmin();
  return db
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      position: categories.position,
      imageUrl: categories.imageUrl,
      productCount: count(products.id),
    })
    .from(categories)
    .leftJoin(products, eq(products.categoryId, categories.id))
    .groupBy(categories.id)
    .orderBy(asc(categories.position), asc(categories.name));
}

export async function getAdminCategory(id: string) {
  await assertAdmin();
  const [row] = await db
    .select({ category: categories, productCount: count(products.id) })
    .from(categories)
    .leftJoin(products, eq(products.categoryId, categories.id))
    .where(eq(categories.id, id))
    .groupBy(categories.id);
  return row ? { ...row.category, productCount: row.productCount } : null;
}

export type CategoryResult = { ok: true; id: string } | { ok: false; errors?: CategoryErrors; error?: string };

const DUPLICATE_CATEGORY: CategoryResult = { ok: false, errors: { name: "Another category already uses this name's URL. Choose a different name." } };

export async function createCategory(input: CategoryInput): Promise<CategoryResult> {
  await assertAdmin();
  try {
    const [row] = await db.insert(categories).values(input).returning({ id: categories.id });
    return { ok: true, id: row.id };
  } catch (e) {
    if (pgCode(e) === "23505") return DUPLICATE_CATEGORY;
    throw e;
  }
}

/** The slug is never written on edit: every /collections/<slug> link depends on it. */
export async function updateCategory(id: string, input: Omit<CategoryInput, "slug">): Promise<CategoryResult> {
  await assertAdmin();
  const { name, description, imageUrl, imageAlt, position } = input;
  const [row] = await db
    .update(categories)
    .set({ name, description, imageUrl, imageAlt, position })
    .where(eq(categories.id, id))
    .returning({ id: categories.id });
  return row ? { ok: true, id } : { ok: false, error: "This category no longer exists." };
}

/** Deletes only an empty category, in one statement. Products restrict the delete anyway (23503). */
export async function deleteCategory(id: string): Promise<CategoryResult> {
  await assertAdmin();
  const hasProducts = "It still has products. Move them to another category first.";
  try {
    const [row] = await db
      .delete(categories)
      .where(and(eq(categories.id, id), sql`not exists (select 1 from products where category_id = ${id})`))
      .returning({ id: categories.id });
    if (row) return { ok: true, id };
  } catch (e) {
    if (pgCode(e) === "23503") return { ok: false, error: hasProducts };
    throw e;
  }
  const [still] = await db.select({ id: categories.id }).from(categories).where(eq(categories.id, id));
  return { ok: false, error: still ? hasProducts : "This category no longer exists." };
}
