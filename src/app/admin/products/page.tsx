import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { listAdminProducts, listCategoryOptions } from "@/lib/admin-catalogue";
import { isUuid } from "@/lib/admin-rules";
import { formatCents } from "@/lib/format";
import { requireAdmin } from "@/lib/session";
import { stockCopy, stockState, stockTone } from "@/lib/stock";

export const metadata: Metadata = { title: "Products | Admin | Maison" };

export default async function AdminProductsPage({ searchParams }: PageProps<"/admin/products">) {
  await requireAdmin("/admin/products");
  const sp = await searchParams;
  const categoryId = typeof sp.category === "string" && isUuid(sp.category) ? sp.category : undefined;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const [products, categories] = await Promise.all([listAdminProducts({ categoryId, q: q || undefined }), listCategoryOptions()]);
  const filtered = Boolean(categoryId || q);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="label">Products ({products.length})</h2>
        <Link href="/admin/products/new" className="btn btn-primary w-auto px-8">New product</Link>
      </div>

      <form role="search" className="mt-6 grid gap-4 sm:grid-cols-[1fr_14rem_auto] sm:items-end">
        <div>
          <label htmlFor="q" className="label text-muted">Name</label>
          <input id="q" name="q" type="search" defaultValue={q} placeholder="Search products" className="field" />
        </div>
        <div>
          <label htmlFor="category" className="label text-muted">Category</label>
          <select id="category" name="category" defaultValue={categoryId ?? ""} className="field">
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-5">
          <button type="submit" className="btn btn-secondary w-auto px-8">Filter</button>
          {filtered && <Link href="/admin/products" className="label link">Clear</Link>}
        </div>
      </form>

      {products.length === 0 ? (
        <div className="rule mt-8 py-10">
          <p>{filtered ? "No products match these filters." : "There are no products yet."}</p>
          {!filtered && <Link href="/admin/products/new" className="btn btn-primary mt-6 w-auto px-8">Create the first product</Link>}
        </div>
      ) : (
        <ul className="mt-8 border-b border-line">
          <li aria-hidden className="label hidden grid-cols-[3.5rem_1fr_10rem_8rem_10rem] gap-6 border-t border-line py-3 text-muted lg:grid">
            <span /><span>Product</span><span>Category</span><span className="text-right">Price</span><span>Availability</span>
          </li>
          {products.map((p) => {
            const s = stockState(p);
            return (
              <li key={p.id} className="rule">
                <Link
                  href={`/admin/products/${p.id}`}
                  className="group grid grid-cols-[3.5rem_1fr_auto] items-center gap-x-5 gap-y-1 py-4 lg:grid-cols-[3.5rem_1fr_10rem_8rem_10rem] lg:gap-x-6"
                >
                  <span className="media-product row-span-2 block bg-surface lg:row-span-1">
                    {p.imageUrl && <Image src={p.imageUrl} alt="" fill sizes="3.5rem" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate group-hover:underline group-hover:underline-offset-4">{p.name}</span>
                    <span className="block truncate text-muted">{p.colour}<span className="lg:hidden"> · {p.categoryName}</span></span>
                  </span>
                  <span className="hidden text-muted lg:block"><span className="text-ink">{p.categoryName}</span><span className="block capitalize">{p.department}</span></span>
                  <span className="text-right tabular-nums">
                    {formatCents(p.priceCents)}
                    {p.compareAtCents && <span className="block text-muted line-through">{formatCents(p.compareAtCents)}</span>}
                  </span>
                  <span className="label col-start-2 col-end-4 flex items-center gap-2 lg:col-auto">
                    <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${stockTone[s]}`} />
                    {stockCopy(s, p.stockQuantity)}
                    {s === "in_stock" && <span className="text-muted tabular-nums">· {p.stockQuantity}</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
