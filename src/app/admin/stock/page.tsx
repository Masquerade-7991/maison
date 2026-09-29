import type { Metadata } from "next";
import Link from "next/link";
import { StockForm } from "@/components/admin/stock-form";
import { listAdminProducts } from "@/lib/admin-catalogue";
import { requireAdmin } from "@/lib/session";
import { type StockState, stockCopy, stockState, stockTone } from "@/lib/stock";

export const metadata: Metadata = { title: "Stock | Admin | Maison" };

// The states worth filtering on; "in stock" is what "All" is for.
const FILTERS: [StockState, string][] = [
  ["low_stock", "Low stock"],
  ["sold_out", "Sold out"],
  ["made_to_order", "Made to order"],
];

export default async function AdminStockPage({ searchParams }: PageProps<"/admin/stock">) {
  await requireAdmin("/admin/stock");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const state = FILTERS.find(([s]) => s === sp.state)?.[0];
  // ponytail: states filtered in memory with the storefront's own stockState(), so admin and shop can't
  // disagree; fine for a few hundred products, move into the SQL where after that (like src/lib/listing.ts).
  const all = (await listAdminProducts({ q: q || undefined })).map((p) => ({ ...p, state: stockState(p) }));
  const products = state ? all.filter((p) => p.state === state) : all;
  const low = all.filter((p) => p.state === "low_stock").length;
  const soldOut = all.filter((p) => p.state === "sold_out").length;

  return (
    <>
      <h2 className="label">
        Stock ({all.length})
        {low > 0 && <span className="text-muted"> · {low} low</span>}
        {soldOut > 0 && <span className="text-danger"> · {soldOut} sold out</span>}
      </h2>
      <p className="mt-2 text-muted">A save only applies while stock is still the number shown, so a sale made meanwhile is never overwritten.</p>

      <form role="search" className="mt-6 grid gap-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
        <div>
          <label htmlFor="q" className="label text-muted">Name</label>
          <input id="q" name="q" type="search" defaultValue={q} placeholder="Search products" className="field" />
        </div>
        <div>
          <label htmlFor="state" className="label text-muted">Availability</label>
          <select id="state" name="state" defaultValue={state ?? ""} className="field">
            <option value="">All</option>
            {FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-5">
          <button type="submit" className="btn btn-secondary w-auto px-8">Filter</button>
          {(q || state) && <Link href="/admin/stock" className="label link">Clear</Link>}
        </div>
      </form>

      {products.length === 0 ? (
        <p className="rule mt-8 py-10">{q || state ? "No products match these filters." : "There are no products yet."}</p>
      ) : (
        <ul className="mt-8 border-b border-line">
          <li aria-hidden className="label hidden grid-cols-[1fr_10rem_12rem_16rem] gap-6 border-t border-line py-3 text-muted lg:grid">
            <span>Product</span><span>Category</span><span>Availability</span><span>Units in stock</span>
          </li>
          {products.map((p) => {
            const s = p.state;
            return (
              <li key={p.id} className="rule grid gap-x-6 gap-y-3 py-4 lg:grid-cols-[1fr_10rem_12rem_16rem] lg:items-start">
                <span className="min-w-0 lg:pt-2">
                  <Link href={`/admin/products/${p.id}`} className="block truncate hover:underline hover:underline-offset-4">{p.name}</Link>
                  <span className="block truncate text-muted lg:hidden">{p.categoryName}</span>
                </span>
                <span className="hidden pt-2 text-muted lg:block">{p.categoryName}</span>
                <span className="label flex flex-wrap items-center gap-x-2 lg:pt-2">
                  <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${stockTone[s]}`} />
                  {stockCopy(s, p.stockQuantity)}
                  {p.madeToOrder && s !== "made_to_order" && <span className="text-muted">· made to order</span>}
                </span>
                <StockForm productId={p.id} name={p.name} stock={p.stockQuantity} />
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
