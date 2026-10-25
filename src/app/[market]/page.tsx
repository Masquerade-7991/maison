import Image from "next/image";
import Link from "next/link";
import { ProductCard } from "@/components/product-card";
import { StoryCard } from "@/components/story-card";
import { getPricing } from "@/lib/fx";
import { homeVariantFor, type HomeSection, type HomeVariant } from "@/lib/home-variants";
import { priceBands } from "@/lib/listing";
import { getCollections, getNewArrivals, getProductBySlug, type Product } from "@/lib/products";
import { services } from "@/lib/sample-data";
import { isBuyable, stockState } from "@/lib/stock";
import { stories } from "@/lib/stories";

export const revalidate = 300;

// One homepage, shaped per region by src/lib/home-variants.ts: the hero, then that region's sections in order.
export default async function Home({ params }: PageProps<"/[market]">) {
  const { market } = await params;
  const variant = homeVariantFor(market);

  return (
    <>
      <Hero hero={variant.hero} />
      {variant.sections.map((s, i) => (
        <Section key={i} section={s} market={market} />
      ))}
    </>
  );
}

async function Section({ section: s, market }: { section: HomeSection; market: string }) {
  switch (s.kind) {
    case "collections":
      return <Collections lead={s.lead} />;
    case "new-arrivals":
      return <ProductRow title="New arrivals" products={await getNewArrivals(8, market)} link={{ href: "/new-arrivals", label: "View all" }} />;
    case "products": {
      const found = await Promise.all(s.slugs.map((slug) => getProductBySlug(slug, market)));
      const inStock = found.filter((p): p is Product => p !== null && isBuyable(stockState(p)));
      const products = inStock.slice(0, inStock.length >= 8 ? 8 : 4); // full rows only
      return products.length > 0 && <ProductRow title={s.title} products={products} link={s.link} />;
    }
    case "editorial":
      return <Editorial section={s} />;
    case "stories":
      return <StoryRow title={s.title} slugs={s.slugs} />;
    case "gift-prices":
      return <GiftPrices market={market} />;
    case "services":
      return <Services lead={s.lead} />;
  }
}

/* Hero: full viewport, headline left, actions right on desktop */
function Hero({ hero }: { hero: HomeVariant["hero"] }) {
  return (
    <section className="media-hero h-[calc(100svh-var(--spacing-header))] min-h-128 w-full">
      <Image src={hero.src} alt={hero.alt} fill preload sizes="100vw" style={{ objectPosition: hero.position }} />
      <div className="absolute inset-0 bg-linear-to-t from-black/65 via-black/15 to-transparent" />
      <div className="container-page absolute inset-x-0 bottom-0 flex flex-col gap-8 pb-10 text-white md:flex-row md:items-end md:justify-between md:pb-16">
        <div>
          <p className="label">{hero.label}</p>
          <h1 className="mt-4 text-display-lg">{hero.title}</h1>
          <p className="mt-5 max-w-md text-white/85">{hero.body}</p>
        </div>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center md:shrink-0">
          <Link href={hero.primary.href} className="btn btn-inverse">{hero.primary.label}</Link>
          <Link href={hero.secondary.href} className="label link self-center">{hero.secondary.label}</Link>
        </div>
      </div>
    </section>
  );
}

/* Collections: categories with an image, from the database. Lead + two stacked on desktop, swipe row on phones */
async function Collections({ lead = [] }: { lead?: string[] }) {
  const rank = (slug: string) => (lead.includes(slug) ? lead.indexOf(slug) : lead.length);
  const collections = (await getCollections()).sort((a, b) => rank(a.slug) - rank(b.slug)); // stable: the rest keep their order

  return (
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
  );
}

/* A row of products: new arrivals or a region's hand-picked edit */
function ProductRow({ title, products, link }: { title: string; products: Product[]; link: { href: string; label: string } }) {
  return (
    <section className="container-page pt-section">
      <div className="flex items-end justify-between gap-4">
        <h2 className="text-display">{title}</h2>
        <Link href={link.href} className="label link hidden sm:inline">{link.label}</Link>
      </div>
      <ul className="grid-products mt-8 md:mt-12">
        {products.map((p, i) => (
          // 3-col tablet grid shows 6 so the last row is never an orphan
          <li key={p.slug} className={i >= 6 ? "md:max-xl:hidden" : undefined}>
            <ProductCard product={p} showNew={false} />
          </li>
        ))}
      </ul>
      <Link href={link.href} className="btn btn-secondary mt-12 sm:hidden">{link.label}</Link>
    </section>
  );
}

/* Editorial split */
function Editorial({ section: s }: { section: Extract<HomeSection, { kind: "editorial" }> }) {
  return (
    <section className="mt-section grid bg-surface md:grid-cols-2">
      <div className="relative aspect-product md:aspect-square">
        <Image src={s.image.src} alt={s.image.alt} fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
      </div>
      <div className="flex flex-col justify-center px-gutter py-16 md:px-[max(var(--spacing-gutter),6vw)] md:py-section">
        <p className="label text-muted">{s.label}</p>
        <h2 className="mt-4 text-display">{s.title}</h2>
        <p className="mt-6 max-w-sm text-muted">{s.body}</p>
        <div className="mt-10">
          <Link href={s.cta.href} className="btn btn-primary">{s.cta.label}</Link>
        </div>
      </div>
    </section>
  );
}

/* Stories from the journal */
function StoryRow({ title, slugs }: { title: string; slugs: string[] }) {
  const picked = slugs.map((slug) => stories.find((s) => s.slug === slug)).filter((s) => s !== undefined);
  return (
    <section className="container-page pt-section">
      <div className="flex items-end justify-between gap-4">
        <h2 className="text-display">{title}</h2>
        <Link href="/stories" className="label link">All stories</Link>
      </div>
      <ul className="mt-8 grid gap-x-4 gap-y-12 md:mt-12 md:grid-cols-3">
        {picked.map((s) => (
          <li key={s.slug}>
            <StoryCard story={s} sizes="(min-width: 768px) 33vw, 100vw" />
          </li>
        ))}
      </ul>
    </section>
  );
}

/* Gifts by price: the gifts listing's own price bands, in the visitor's currency */
async function GiftPrices({ market }: { market: string }) {
  const pricing = await getPricing(market);
  return (
    <section className="container-page pt-section">
      <h2 className="label">Gifts by price</h2>
      <ul className="mt-6 grid gap-2 sm:grid-cols-3 md:gap-4">
        {priceBands.map((b) => (
          <li key={b.slug}>
            <Link href={`/gifts?price=${b.slug}`} className="group flex items-center justify-between bg-surface px-6 py-8 md:px-8 md:py-10">
              <span className="text-display-sm">{b.label(pricing.fmt)}</span>
              <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-1">→</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* Services: quiet strip that hands off to the footer */
function Services({ lead = [] }: { lead?: string[] }) {
  const rank = (title: string) => (lead.includes(title) ? lead.indexOf(title) : lead.length);
  return (
    <section className="container-page pt-section">
      <h2 className="sr-only">Our services</h2>
      <ul className="grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
        {[...services].sort((a, b) => rank(a.title) - rank(b.title)).map((s) => (
          <li key={s.title} className="rule pt-5">
            <h3 className="label">{s.title}</h3>
            <p className="mt-2 max-w-xs text-muted">{s.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
