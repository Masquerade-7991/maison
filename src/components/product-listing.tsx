import Link from "next/link";
import { ProductCard } from "@/components/product-card";
import { colourSwatch, filterProducts, priceBands, sorts, type Filters } from "@/lib/listing";
import type { Product } from "@/lib/products";

export type ListingTabs = {
  /** Which URL param the tabs set: category tabs on department views, department tabs on a collection. */
  param: "category" | "department";
  label: string;
  options: { value: string; label: string }[];
};

type SearchParams = Record<string, string | string[] | undefined>;

export const categoryTabs = (categories: { slug: string; name: string }[]): ListingTabs => ({
  param: "category",
  label: "Category",
  options: categories.map((c) => ({ value: c.slug, label: c.name })),
});

export const departmentTabs: ListingTabs = {
  param: "department",
  label: "Department",
  options: [
    { value: "women", label: "Women" },
    { value: "men", label: "Men" },
  ],
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// Build "?a=b" from current filters plus a patch; undefined removes a key, defaults are dropped.
function qs(current: Filters, patch: Partial<Filters>) {
  const next = { ...current, ...patch };
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) if (v && !(k === "sort" && v === "featured")) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : "?";
}

// Listing body shared by /women, /men, /gifts, /new-arrivals and /collections/[slug].
// Filters live in the URL and run over the view's products (see filterProducts).
export function ProductListing({
  title,
  intro,
  products,
  searchParams: sp,
  tabs,
}: {
  title: string;
  intro: string;
  products: Product[];
  searchParams: SearchParams;
  tabs?: ListingTabs;
}) {
  const filters: Filters = {
    category: first(sp.category),
    department: first(sp.department),
    colour: first(sp.colour),
    price: first(sp.price),
    sort: first(sp.sort),
  };

  const tab = tabs ? filters[tabs.param] : undefined;
  const tabOptions = tabs?.options.filter((o) => filterProducts(products, { [tabs.param]: o.value }).length > 0) ?? [];
  const inTab = tabs ? filterProducts(products, { [tabs.param]: tab }) : products;
  const colours = Object.keys(colourSwatch).filter((c) => inTab.some((p) => p.colour === c));
  const results = filterProducts(products, filters);

  const band = priceBands.find((b) => b.slug === filters.price);
  const activeSort = sorts.find((s) => s.slug === filters.sort) ?? sorts[0];
  const active = [
    filters.colour && { label: filters.colour, href: qs(filters, { colour: undefined }) },
    band && { label: band.label, href: qs(filters, { price: undefined }) },
  ].filter(Boolean) as { label: string; href: string }[];

  return (
    <>
      <section className="container-page pt-12 md:pt-20">
        <h1 className="text-display">{title}</h1>
        <p className="mt-3 max-w-md text-muted">{intro}</p>

        {tabs && tabOptions.length > 1 && (
          <nav aria-label={tabs.label} className="-mx-gutter mt-8 overflow-x-auto px-gutter [scrollbar-width:none] md:mt-12">
            <ul className="flex gap-7 whitespace-nowrap">
              {[{ value: undefined, label: "All" }, ...tabOptions].map((o) => (
                <li key={o.value ?? "all"}>
                  <Link
                    href={qs({ sort: filters.sort }, { [tabs.param]: o.value })}
                    scroll={false}
                    aria-current={tab === o.value ? "page" : undefined}
                    className={`label link-nav ${tab === o.value ? "" : "text-muted hover:text-ink"}`}
                  >
                    {o.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </section>

      {/* Toolbar: sticks under the header, stays one quiet line. Menus drop full-width on phones. */}
      <div className="sticky top-header z-40 mt-6 border-y border-line bg-paper">
        <div className="container-page relative flex h-12 items-center justify-between gap-4">
          <p className="label text-muted" aria-live="polite">
            {results.length} {results.length === 1 ? "piece" : "pieces"}
          </p>

          <div className="flex items-center gap-8">
            <details className="group sm:relative">
              <summary className="label cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                Filter{active.length > 0 && ` (${active.length})`}
                <span aria-hidden className="ml-2 inline-block transition-transform group-open:rotate-45">+</span>
              </summary>
              <div className="absolute inset-x-0 top-full border-b border-line bg-paper p-6 sm:inset-x-auto sm:top-[calc(100%+0.9rem)] sm:right-0 sm:w-96 sm:border">
                <fieldset>
                  <legend className="label text-muted">Colour</legend>
                  <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                    {colours.map((c) => {
                      const on = filters.colour === c;
                      return (
                        <li key={c}>
                          <Link
                            href={qs(filters, { colour: on ? undefined : c })}
                            scroll={false}
                            aria-pressed={on}
                            className={`flex items-center gap-3 ${on ? "underline underline-offset-4" : "text-muted hover:text-ink"}`}
                          >
                            <span
                              className={`size-3.5 shrink-0 rounded-full border ${on ? "border-ink" : "border-line"}`}
                              style={{ background: colourSwatch[c] }}
                            />
                            {c}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>
                <fieldset className="rule mt-6 pt-6">
                  <legend className="label float-left w-full text-muted">Price</legend>
                  <ul className="clear-both space-y-3 pt-4">
                    {priceBands.map((b) => {
                      const on = filters.price === b.slug;
                      return (
                        <li key={b.slug}>
                          <Link
                            href={qs(filters, { price: on ? undefined : b.slug })}
                            scroll={false}
                            aria-pressed={on}
                            className={on ? "underline underline-offset-4" : "text-muted hover:text-ink"}
                          >
                            {b.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>
                {active.length > 0 && (
                  <Link href={qs(filters, { colour: undefined, price: undefined })} scroll={false} className="label link mt-6 inline-block">
                    Clear filters
                  </Link>
                )}
              </div>
            </details>

            {/* key remounts the menu closed after each choice */}
            <details key={activeSort.slug} className="group sm:relative">
              <summary className="label cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                <span className="hidden sm:inline">Sort: </span>
                {activeSort.label}
              </summary>
              <ul className="absolute inset-x-0 top-full space-y-3 border-b border-line bg-paper p-6 sm:inset-x-auto sm:top-[calc(100%+0.9rem)] sm:right-0 sm:w-60 sm:border">
                {sorts.map((s) => (
                  <li key={s.slug}>
                    <Link
                      href={qs(filters, { sort: s.slug })}
                      scroll={false}
                      aria-current={s.slug === activeSort.slug ? "true" : undefined}
                      className={s.slug === activeSort.slug ? "underline underline-offset-4" : "text-muted hover:text-ink"}
                    >
                      {s.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        </div>
      </div>

      <section className="container-page pt-6 md:pt-8">
        <h2 className="sr-only">Products</h2>
        {active.length > 0 && (
          <ul className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2">
            {active.map((a) => (
              <li key={a.label}>
                <Link href={a.href} scroll={false} className="label link-nav">
                  {a.label} <span aria-hidden>×</span>
                  <span className="sr-only">Remove filter</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {results.length > 0 ? (
          <ul className="grid-products">
            {results.map((p, i) => (
              <li key={p.slug}>
                <ProductCard product={p} preload={i < 2} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="py-section text-center">
            <p className="text-display-sm">Nothing matches those filters.</p>
            <Link href={tabs ? qs({}, { [tabs.param]: tab }) : "?"} className="btn btn-secondary mt-8">
              Clear filters
            </Link>
          </div>
        )}
      </section>
    </>
  );
}
