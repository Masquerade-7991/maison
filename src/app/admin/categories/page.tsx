import type { Metadata } from "next";
import Link from "next/link";
import { listAdminCategories } from "@/lib/admin-catalogue";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Categories | Admin | Maison" };

export default async function AdminCategoriesPage({ searchParams }: PageProps<"/admin/categories">) {
  await requireAdmin("/admin/categories");
  const [categories, sp] = await Promise.all([listAdminCategories(), searchParams]);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="label">Categories ({categories.length})</h2>
        <Link href="/admin/categories/new" className="btn btn-primary w-auto px-8">New category</Link>
      </div>

      {sp.deleted === "1" && <p role="status" className="mt-6 border-l-2 border-ink pl-4">Category deleted.</p>}

      {categories.length === 0 ? (
        <div className="rule mt-8 py-10">
          <p>There are no categories yet.</p>
          <Link href="/admin/categories/new" className="btn btn-primary mt-6 w-auto px-8">Create the first category</Link>
        </div>
      ) : (
        <ul className="mt-8 border-b border-line">
          <li aria-hidden className="label hidden grid-cols-[1fr_12rem_6rem_6rem_6rem] gap-6 border-t border-line py-3 text-muted lg:grid">
            <span>Category</span><span>URL</span><span className="text-right">Position</span><span className="text-right">Products</span><span>Image</span>
          </li>
          {categories.map((c) => (
            <li key={c.id} className="rule">
              <Link
                href={`/admin/categories/${c.id}`}
                className="group grid grid-cols-[1fr_auto] items-center gap-x-5 gap-y-1 py-4 lg:grid-cols-[1fr_12rem_6rem_6rem_6rem] lg:gap-x-6"
              >
                <span className="min-w-0">
                  <span className="block truncate group-hover:underline group-hover:underline-offset-4">{c.name}</span>
                  <span className="block truncate text-muted lg:hidden">/collections/{c.slug} · position {c.position} · {c.imageUrl ? "image" : "no image"}</span>
                </span>
                <span className="hidden truncate text-muted lg:block">/collections/{c.slug}</span>
                <span className="hidden text-right tabular-nums lg:block">{c.position}</span>
                <span className="text-right tabular-nums">
                  {c.productCount}
                  <span className="text-muted lg:hidden"> {c.productCount === 1 ? "product" : "products"}</span>
                </span>
                <span className="hidden text-muted lg:block">{c.imageUrl ? "Yes" : "No"}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
