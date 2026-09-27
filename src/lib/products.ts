// The only module that reads the catalogue from the database. Pages call these and get the
// mapped Product type: dollars instead of cents, images ordered, isNew derived.
import { cache } from "react";
import { count, desc, eq, isNotNull, sql, type AnyColumn } from "drizzle-orm";
import { db } from "@/db";
import { categories, products, type department } from "@/db/schema";

// "New" = among the 12 most recently added products. Derived, never stored.
export const NEW_COUNT = 12;

type Department = (typeof department.enumValues)[number];

export type Product = {
  slug: string;
  name: string;
  description: string;
  price: number;
  compareAt: number | null;
  category: { slug: string; name: string };
  department: Department;
  colour: string;
  isGift: boolean;
  isNew: boolean;
  stockQuantity: number;
  madeToOrder: boolean;
  stockDetail: string | null;
  createdAt: Date;
  images: { url: string; alt: string }[];
};

type Row = typeof products.$inferSelect & {
  isNew: boolean;
  category: { slug: string; name: string };
  images: { url: string; alt: string }[];
};

// The only place cents become dollars.
function mapProduct(r: Row): Product {
  return {
    slug: r.slug,
    name: r.name,
    description: r.description,
    price: r.priceCents / 100,
    compareAt: r.compareAtCents === null ? null : r.compareAtCents / 100,
    category: { slug: r.category.slug, name: r.category.name },
    department: r.department,
    colour: r.colour,
    isGift: r.isGift,
    isNew: r.isNew,
    stockQuantity: r.stockQuantity,
    madeToOrder: r.madeToOrder,
    stockDetail: r.stockDetail,
    createdAt: r.createdAt,
    images: r.images.map((i) => ({ url: i.url, alt: i.alt })),
  };
}

// Relational queries alias the outer table, so the subquery uses its own alias.
const isNewExtra = (t: { createdAt: AnyColumn }) =>
  sql<boolean>`coalesce(${t.createdAt} >= (select p2.created_at from products p2 order by p2.created_at desc offset ${NEW_COUNT - 1} limit 1), true)`.as(
    "is_new",
  );

export type ListScope =
  | { category: string }
  | { department: Exclude<Department, "unisex"> }
  | { gift: true }
  | { newest: number }
  | { search: string };

// ponytail: substring ILIKE per word with a naive plural stem ("jackets" -> "jacket"). Fine for a small
// catalogue; move to Postgres full-text search (tsvector + GIN index) once it outgrows a sequential scan.
const searchTerms = (q: string) =>
  q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .map((w) => `%${(w.length > 3 ? w.replace(/s$/, "") : w).replace(/[\\%_]/g, "\\$&")}%`);

// One view's products, newest first, packshot only.
export async function listProducts(scope: ListScope): Promise<Product[]> {
  const rows = await db.query.products.findMany({
    where: (p, { and, eq, ilike, inArray, or }) =>
      "category" in scope
        ? inArray(p.categoryId, db.select({ id: categories.id }).from(categories).where(eq(categories.slug, scope.category)))
        : "department" in scope
          ? inArray(p.department, [scope.department, "unisex"])
          : "gift" in scope
            ? and(eq(p.isGift, true))
            : "search" in scope
              ? // Every word must match somewhere: name, colour, description or category name.
                and(
                  ...searchTerms(scope.search).map((like) =>
                    or(
                      ilike(p.name, like),
                      ilike(p.colour, like),
                      ilike(p.description, like),
                      inArray(p.categoryId, db.select({ id: categories.id }).from(categories).where(ilike(categories.name, like))),
                    ),
                  ),
                )
              : undefined,
    orderBy: (p, { desc }) => [desc(p.createdAt)],
    limit: "newest" in scope ? scope.newest : undefined,
    extras: (p) => ({ isNew: isNewExtra(p) }),
    with: {
      category: { columns: { slug: true, name: true } },
      images: { columns: { url: true, alt: true }, orderBy: (i, { asc }) => [asc(i.position)], limit: 1 },
    },
  });
  return rows.map(mapProduct);
}

export const getNewArrivals = (limit: number) => listProducts({ newest: limit });

// Cached per request so generateMetadata and the page share one query.
export const getProductBySlug = cache(async (slug: string): Promise<Product | null> => {
  const row = await db.query.products.findFirst({
    where: (p, { eq }) => eq(p.slug, slug),
    extras: (p) => ({ isNew: isNewExtra(p) }),
    with: {
      category: { columns: { slug: true, name: true } },
      images: { columns: { url: true, alt: true }, orderBy: (i, { asc }) => [asc(i.position)] },
    },
  });
  return row ? mapProduct(row) : null;
});

// Same category first, then same department, then newest.
export async function getRelated(product: Product, n = 4): Promise<Product[]> {
  const rows = await db.query.products.findMany({
    where: (p, { ne }) => ne(p.slug, product.slug),
    orderBy: (p, { desc }) => [
      desc(sql`${p.categoryId} = (select id from categories where slug = ${product.category.slug})`),
      desc(sql`${p.department} = ${product.department}`),
      desc(p.createdAt),
    ],
    limit: n,
    extras: (p) => ({ isNew: isNewExtra(p) }),
    with: {
      category: { columns: { slug: true, name: true } },
      images: { columns: { url: true, alt: true }, orderBy: (i, { asc }) => [asc(i.position)], limit: 1 },
    },
  });
  return rows.map(mapProduct);
}

export const getCategoryBySlug = cache(async (slug: string) => {
  return (await db.query.categories.findFirst({ where: (c, { eq }) => eq(c.slug, slug) })) ?? null;
});

export const getCategories = () => db.query.categories.findMany({ orderBy: (c, { asc }) => [asc(c.position)] });

// Homepage Collections strip: categories with an image; piece counts are counted, never stored.
export async function getCollections() {
  return db
    .select({
      slug: categories.slug,
      name: categories.name,
      imageUrl: sql<string>`${categories.imageUrl}`,
      imageAlt: sql<string>`coalesce(${categories.imageAlt}, ${categories.name})`,
      pieceCount: count(products.id),
    })
    .from(categories)
    .leftJoin(products, eq(products.categoryId, categories.id))
    .where(isNotNull(categories.imageUrl))
    .groupBy(categories.id)
    .orderBy(categories.position);
}

export async function getProductSlugs() {
  return (await db.select({ slug: products.slug }).from(products).orderBy(desc(products.createdAt))).map((r) => r.slug);
}

export async function getCategorySlugs() {
  return (await db.select({ slug: categories.slug }).from(categories)).map((r) => r.slug);
}
