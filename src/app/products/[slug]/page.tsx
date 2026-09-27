import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductCard } from "@/components/product-card";
import { currency } from "@/lib/format";
import { colourSwatch } from "@/lib/listing";
import { getProductBySlug, getProductSlugs, getRelated } from "@/lib/products";
import { detailsFor } from "@/lib/sample-data";
import { isBuyable, stockCopy, stockState, stockTone } from "@/lib/stock";

export const revalidate = 300;

export async function generateMetadata({ params }: PageProps<"/products/[slug]">): Promise<Metadata> {
  const p = await getProductBySlug((await params).slug);
  return p ? { title: `${p.name} | Maison`, description: p.description } : {};
}

export async function generateStaticParams() {
  return (await getProductSlugs()).map((slug) => ({ slug }));
}

export default async function ProductPage({ params }: PageProps<"/products/[slug]">) {
  const p = await getProductBySlug((await params).slug);
  if (!p) notFound();

  const state = stockState(p);
  const buyable = isBuyable(state);
  const { details, sizes } = detailsFor(p.category.slug);
  const related = await getRelated(p);
  const department = p.department === "men" ? { href: "/men", label: "Men" } : { href: "/women", label: "Women" };

  return (
    <>
      <div className="container-page pt-6 md:pt-10">
        <nav aria-label="Breadcrumb">
          <ol className="label flex flex-wrap gap-2 text-muted">
            <li>
              <Link href={department.href} className="link-nav hover:text-ink">{department.label}</Link>
            </li>
            <li aria-hidden>/</li>
            <li>
              <Link href={`/collections/${p.category.slug}`} className="link-nav hover:text-ink">
                {p.category.name}
              </Link>
            </li>
          </ol>
        </nav>

        <div className="mt-6 grid gap-8 md:grid-cols-12 md:gap-10 lg:gap-16">
          {/* Gallery: swipe row on phones, stacked on tablet, lead + pair on desktop */}
          <ul className="-mx-gutter flex snap-x snap-mandatory scroll-px-gutter gap-2 overflow-x-auto px-gutter [scrollbar-width:none] md:col-span-7 md:mx-0 md:grid md:overflow-visible md:px-0 lg:col-span-8 lg:grid-cols-2">
            {p.images.map((im, i) => (
              <li key={im.url} className={`w-[88%] shrink-0 snap-start md:w-auto ${i === 0 ? "lg:col-span-2" : ""}`}>
                <div className="media-product">
                  <Image
                    src={im.url}
                    alt={im.alt}
                    fill
                    preload={i === 0}
                    sizes={i === 0 ? "(min-width: 1024px) 66vw, (min-width: 768px) 58vw, 88vw" : "(min-width: 1024px) 33vw, (min-width: 768px) 58vw, 88vw"}
                  />
                </div>
              </li>
            ))}
          </ul>

          {/* Info: sticks beside the gallery on tablet and up */}
          <div className="self-start md:sticky md:top-[calc(var(--spacing-header)+2rem)] md:col-span-5 lg:col-span-4">
            <p className="label text-muted">{p.category.name}</p>
            <h1 className="mt-3 text-display-sm">{p.name}</h1>
            <p className="mt-3 flex gap-3 text-base tabular-nums">
              {p.compareAt !== null && (
                <s className="text-muted">
                  <span className="sr-only">Was </span>
                  {currency(p.compareAt)}
                </s>
              )}
              {currency(p.price)}
            </p>

            <p className="label mt-6 flex items-center gap-2" role="status">
              <span aria-hidden className={`size-1.5 rounded-full ${stockTone[state]}`} />
              {stockCopy(state, p.stockQuantity)}
            </p>
            {p.stockDetail && <p className="mt-2 text-muted">{p.stockDetail}</p>}

            <div className="rule mt-6 flex items-center gap-3 pt-6">
              <span className="label text-muted">Colour</span>
              <span className="size-3.5 rounded-full border border-line" style={{ background: colourSwatch[p.colour] }} />
              <span>{p.colour}</span>
            </div>

            {/* ponytail: posts to /bag, which does not exist yet; wire to a cart action when one does. */}
            <form action="/bag" className="mt-6">
              <input type="hidden" name="product" value={p.slug} />
              {sizes.length > 0 ? (
                <fieldset disabled={!buyable}>
                  <legend className="label text-muted">Size</legend>
                  <div className={`mt-3 grid gap-1 ${sizes.length > 5 ? "grid-cols-4" : "grid-cols-5"}`}>
                    {sizes.map((s) => (
                      <label
                        key={s}
                        className="flex h-11 cursor-pointer items-center justify-center border border-line text-sm transition-colors hover:border-ink has-checked:border-ink has-checked:bg-ink has-checked:text-paper has-focus-visible:outline has-focus-visible:outline-offset-2 has-disabled:cursor-not-allowed has-disabled:text-muted has-disabled:hover:border-line"
                      >
                        <input type="radio" name="size" value={s} required className="sr-only" />
                        {s}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : (
                <p className="text-muted">One size</p>
              )}

              <button type="submit" disabled={!buyable} className="btn btn-primary mt-6 sm:w-full">
                {buyable ? "Add to bag" : "Sold out"}
              </button>
            </form>

            <p className="mt-4 text-muted">Complimentary shipping and returns within 30 days.</p>

            <div className="mt-8 border-b border-line">
              {[
                { title: "Description", body: <p>{p.description}</p>, open: true },
                {
                  title: "Details & care",
                  body: (
                    <ul className="list-disc space-y-1 pl-4">
                      {details.map((d) => <li key={d}>{d}</li>)}
                    </ul>
                  ),
                },
                {
                  title: "Shipping & returns",
                  body: <p>Free express delivery in 2–4 business days. Return unworn pieces in their original packaging within 30 days for a full refund.</p>,
                },
              ].map((s) => (
                <details key={s.title} open={s.open} className="group rule">
                  <summary className="label flex cursor-pointer list-none items-center justify-between py-5 [&::-webkit-details-marker]:hidden">
                    {s.title}
                    <span aria-hidden className="transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <div className="pb-6 text-muted">{s.body}</div>
                </details>
              ))}
            </div>
          </div>
        </div>
      </div>

      <section className="container-page pt-section">
        <h2 className="text-display-sm">You may also like</h2>
        <ul className="grid-products mt-8">
          {related.map((r, i) => (
            // 3-col tablet grid shows 3 so there is no orphan
            <li key={r.slug} className={i === 3 ? "md:max-xl:hidden" : undefined}>
              <ProductCard product={r} />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
