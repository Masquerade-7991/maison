import Image from "next/image";
import Link from "next/link";
import { ProductCard } from "@/components/product-card";
import { getCollections, getNewArrivals } from "@/lib/products";
import { atelier, hero, services } from "@/lib/sample-data";

export const revalidate = 300;

export default async function Home() {
  const [collections, newArrivals] = await Promise.all([getCollections(), getNewArrivals(8)]);

  return (
    <>
      {/* Hero: full viewport, headline left, actions right on desktop */}
      <section className="media-hero h-[calc(100svh-var(--spacing-header))] min-h-128 w-full">
        <Image
          src={hero.src}
          alt={hero.alt}
          fill
          preload
          sizes="100vw"
          className="object-[center_25%]"
        />
        <div className="absolute inset-0 bg-linear-to-t from-black/65 via-black/15 to-transparent" />
        <div className="container-page absolute inset-x-0 bottom-0 flex flex-col gap-8 pb-10 text-white md:flex-row md:items-end md:justify-between md:pb-16">
          <div>
            <p className="label">Autumn–Winter 2026</p>
            <h1 className="mt-4 text-display-lg">The Quiet Season</h1>
            <p className="mt-5 max-w-md text-white/85">
              Soft tailoring, heavy wool and pale blues for the colder months.
            </p>
          </div>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center md:shrink-0">
            <Link href="/women" className="btn btn-inverse">Shop the collection</Link>
            <Link href="/men" className="label link self-center">Shop men</Link>
          </div>
        </div>
      </section>

      {/* Collections: categories with an image, from the database. Lead + two stacked on desktop, swipe row on phones */}
      <section className="container-page pt-section">
        <h2 className="label">The collections</h2>
        <ul className="-mx-gutter mt-6 flex snap-x snap-mandatory scroll-px-gutter gap-2 overflow-x-auto px-gutter scrollbar-none md:mx-0 md:grid md:grid-cols-12 md:grid-rows-2 md:gap-4 md:overflow-visible md:px-0">
          {collections.map((c, i) => (
            <li
              key={c.slug}
              className={`w-[82%] shrink-0 snap-start md:w-auto ${i === 0 ? "md:col-span-7 md:row-span-2" : "md:col-span-5"}`}
            >
              <Link href={`/collections/${c.slug}`} className="group relative block h-full">
                <div className={`relative overflow-hidden bg-surface ${i === 0 ? "aspect-product md:aspect-square xl:aspect-5/4" : "aspect-product md:aspect-auto md:h-full"}`}>
                  <Image
                    src={c.imageUrl}
                    alt={c.imageAlt}
                    fill
                    sizes={i === 0 ? "(min-width: 768px) 58vw, 82vw" : "(min-width: 768px) 42vw, 82vw"}
                    className="object-cover transition-transform duration-700 ease-out-soft group-hover:scale-[1.03]"
                  />
                  <div className="absolute inset-0 bg-linear-to-t from-black/50 to-transparent to-50%" />
                  <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-5 text-white md:p-8">
                    <div>
                      <h3 className={i === 0 ? "text-display" : "text-display-sm"}>{c.name}</h3>
                      <p className="label mt-2 text-white/80">
                        {c.pieceCount} {c.pieceCount === 1 ? "piece" : "pieces"}
                      </p>
                    </div>
                    <span className="label link-nav group-hover:decoration-current">Discover</span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* New arrivals */}
      <section className="container-page pt-section">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-display">New arrivals</h2>
          <Link href="/new-arrivals" className="label link hidden sm:inline">View all</Link>
        </div>
        <ul className="grid-products mt-8 md:mt-12">
          {newArrivals.map((p, i) => (
            // 3-col tablet grid shows 6 so the last row is never an orphan
            <li key={p.slug} className={i >= 6 ? "md:max-xl:hidden" : undefined}>
              <ProductCard product={p} showNew={false} />
            </li>
          ))}
        </ul>
        <Link href="/new-arrivals" className="btn btn-secondary mt-12 sm:hidden">View all</Link>
      </section>

      {/* Editorial split */}
      <section className="mt-section grid bg-surface md:grid-cols-2">
        <div className="relative aspect-product md:aspect-square">
          <Image
            src={atelier.src}
            alt={atelier.alt}
            fill
            sizes="(min-width: 768px) 50vw, 100vw"
            className="object-cover"
          />
        </div>
        <div className="flex flex-col justify-center px-gutter py-16 md:px-[max(var(--spacing-gutter),6vw)] md:py-section">
          <p className="label text-muted">The edit</p>
          <h2 className="mt-4 text-display">Knitwear, softly</h2>
          <p className="mt-6 max-w-sm text-muted">
            Cashmere, merino and bouclé in undyed tones. Pieces designed to layer through the
            colder months and wear for years after.
          </p>
          <div className="mt-10">
            <Link href="/collections/ready-to-wear" className="btn btn-primary">Discover the edit</Link>
          </div>
        </div>
      </section>

      {/* Services: quiet strip that hands off to the footer */}
      <section className="container-page pt-section">
        <h2 className="sr-only">Our services</h2>
        <ul className="grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((s) => (
            <li key={s.title} className="rule pt-5">
              <h3 className="label">{s.title}</h3>
              <p className="mt-2 max-w-xs text-muted">{s.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
