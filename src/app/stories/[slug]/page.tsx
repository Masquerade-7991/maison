import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductCard } from "@/components/product-card";
import { StoryCard } from "@/components/story-card";
import { getProductBySlug } from "@/lib/products";
import { serif } from "@/lib/serif";
import { formatStoryDate, getStory, readingMinutes, stories } from "@/lib/stories";

// Static like product pages; "Shop the story" reads live products, refreshed on the same schedule.
export const revalidate = 300;
export const dynamicParams = false; // only the stories in src/lib/stories.ts; anything else is a 404

export function generateStaticParams() {
  return stories.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: PageProps<"/stories/[slug]">): Promise<Metadata> {
  const s = getStory((await params).slug);
  return s
    ? {
        title: `${s.title} | Stories | Maison`,
        description: s.dek,
        openGraph: { type: "article", title: s.title, description: s.dek, images: [s.image.src], publishedTime: s.published, authors: [s.author] },
      }
    : {};
}

export default async function StoryPage({ params }: PageProps<"/stories/[slug]">) {
  const s = getStory((await params).slug);
  if (!s) notFound();

  const products = (await Promise.all(s.shop.products.map((slug) => getProductBySlug(slug)))).filter((p) => p !== null);
  const more = stories.filter((o) => o.slug !== s.slug).slice(0, 3);

  return (
    <article>
      <header className="container-page pt-6 md:pt-10">
        <nav aria-label="Breadcrumb">
          <ol className="label flex flex-wrap gap-2 text-muted">
            <li>
              <Link href="/stories" className="link-nav hover:text-ink">Stories</Link>
            </li>
            <li aria-hidden>/</li>
            <li>{s.topic}</li>
          </ol>
        </nav>
        <div className="mx-auto max-w-3xl pt-12 text-center md:pt-16">
          <h1 className={`${serif.className} text-display-lg font-light`}>{s.title}</h1>
          <p className="mx-auto mt-6 max-w-2xl text-base text-muted md:text-lg">{s.dek}</p>
          <p className="label mt-8 text-muted">
            {s.author} <span aria-hidden>·</span> <time dateTime={s.published}>{formatStoryDate(s.published)}</time> <span aria-hidden>·</span> {readingMinutes(s)} min read
          </p>
        </div>
      </header>

      <div className="container-page mt-12 md:mt-16">
        <div className="relative mx-auto aspect-product max-w-5xl md:aspect-[3/2]">
          <Image src={s.image.src} alt={s.image.alt} fill preload sizes="(min-width: 1024px) 64rem, 100vw" className="object-cover" />
        </div>
      </div>

      <div className="container-page pt-section">
        <div className="mx-auto max-w-2xl">
          {s.body.map((b, i) =>
            b.kind === "h2" ? (
              <h2 key={i} className={`${serif.className} mt-14 text-display-sm font-light first:mt-0`}>{b.text}</h2>
            ) : b.kind === "quote" ? (
              <figure key={i} className="reveal -mx-gutter my-14 border-y border-line px-gutter py-10 text-center md:-mx-16 md:px-16">
                <blockquote className={`${serif.className} text-display-sm leading-snug font-light italic`}>&ldquo;{b.text}&rdquo;</blockquote>
                <figcaption className="label mt-6 text-muted">{b.by}</figcaption>
              </figure>
            ) : (
              <p key={i} className="mt-6 text-base leading-relaxed first:mt-0 md:text-lg">{b.text}</p>
            ),
          )}
        </div>
      </div>

      {products.length > 0 && (
        <section className="container-page pt-section">
          <div className="flex items-end justify-between gap-6 border-b border-line pb-4">
            <h2 className="label">Shop the story</h2>
            <Link href={s.shop.href} className="label link">{s.shop.label}</Link>
          </div>
          <ul className="grid-products mt-8">
            {products.map((p) => (
              <li key={p.slug}>
                <ProductCard product={p} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="container-page pt-section">
        <div className="flex items-end justify-between gap-6 border-b border-line pb-4">
          <h2 className="label">More stories</h2>
          <Link href="/stories" className="label link">All stories</Link>
        </div>
        <ul className="mt-10 grid gap-x-10 gap-y-16 sm:grid-cols-2 lg:grid-cols-3">
          {more.map((o, i) => (
            <li key={o.slug} className={i === 2 ? "sm:max-lg:hidden" : undefined}>
              <StoryCard story={o} sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" />
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
