import type { Metadata } from "next";
import Link from "next/link";
import { ProductCard } from "@/components/product-card";
import { getCategories, listProducts } from "@/lib/products";

export const metadata: Metadata = { title: "Search | Maison" };

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const raw = (await searchParams).q;
  const q = ((Array.isArray(raw) ? raw[0] : raw) ?? "").trim().slice(0, 100);
  const [results, categories] = await Promise.all([q ? listProducts({ search: q }) : [], getCategories()]);

  const browse = (
    <nav aria-label="Collections" className="rule mt-10 pt-6">
      <h2 className="label text-muted">Browse the collections</h2>
      <ul className="mt-5 flex flex-wrap gap-x-7 gap-y-3">
        {categories.map((c) => (
          <li key={c.slug}>
            <Link href={`/collections/${c.slug}`} className="label link-nav">{c.name}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );

  return (
    <section className="container-page pt-12 md:pt-20">
      <h1 className="text-display">Search</h1>

      {/* Plain GET form: works without JS, and every search is a shareable URL. */}
      <form action="/search" role="search" className="mt-8 flex max-w-2xl flex-col gap-4 sm:flex-row sm:items-end md:mt-12 md:gap-6">
        <label htmlFor="q" className="sr-only">Search products</label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Name, colour or category"
          autoFocus={!q}
          enterKeyHint="search"
          className="field"
        />
        <button type="submit" className="btn btn-primary shrink-0">Search</button>
      </form>

      {!q ? (
        browse
      ) : results.length > 0 ? (
        <>
          <p className="label mt-10 text-muted" aria-live="polite">
            {results.length} {results.length === 1 ? "piece" : "pieces"} for “{q}”
          </p>
          <ul className="grid-products mt-6">
            {results.map((p, i) => (
              <li key={p.slug}>
                <ProductCard product={p} preload={i < 2} />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <div className="py-section text-center">
            <p className="text-display-sm">Nothing matches “{q}”.</p>
            <p className="mt-3 text-muted">Try a colour, a piece such as “coat”, or a category.</p>
          </div>
          {browse}
        </>
      )}
    </section>
  );
}
