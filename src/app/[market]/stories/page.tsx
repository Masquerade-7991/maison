import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { StoryCard } from "@/components/story-card";
import { serif } from "@/lib/serif";
import { formatStoryDate, readingMinutes, stories } from "@/lib/stories";

const intro = "Notes from the workshops: how our pieces are made, the people who make them, and how to keep them for life.";

export const metadata: Metadata = { title: "Stories | Maison", description: intro };

export default function StoriesPage() {
  const [cover, ...rest] = stories;

  return (
    <>
      <section className="container-page pt-12 text-center md:pt-20">
        <p className="label text-muted">The journal</p>
        <h1 className={`${serif.className} mt-4 text-display-lg font-light`}>Stories</h1>
        <p className="mx-auto mt-5 max-w-xl text-muted">{intro}</p>
      </section>

      {/* Cover story: the newest, as a full-width split like the About chapters. */}
      <section className="mt-12 grid bg-surface md:mt-16 md:grid-cols-2">
        <Link href={`/stories/${cover.slug}`} className="group relative block aspect-product md:aspect-auto md:min-h-168">
          <Image src={cover.image.src} alt={cover.image.alt} fill preload sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
        </Link>
        <div className="flex flex-col justify-center px-gutter py-16 md:px-[max(var(--spacing-gutter),6vw)] md:py-section">
          <p className="label text-muted">
            Cover story <span aria-hidden>·</span> {cover.topic}
          </p>
          <h2 className={`${serif.className} mt-4 text-display font-light`}>
            <Link href={`/stories/${cover.slug}`} className="decoration-1 underline-offset-8 hover:underline">{cover.title}</Link>
          </h2>
          <p className="mt-6 max-w-md text-muted">{cover.dek}</p>
          <p className="label mt-8 text-muted">
            {cover.author} <span aria-hidden>·</span> {formatStoryDate(cover.published)} <span aria-hidden>·</span> {readingMinutes(cover)} min read
          </p>
          <Link href={`/stories/${cover.slug}`} className="btn btn-primary mt-10 self-start sm:px-10">Read the story</Link>
        </div>
      </section>

      {/* Then two larger features and a row of three, newest first; each card names its topic. */}
      <section className="container-page pt-section">
        <h2 className="label border-b border-line pb-4">Latest stories</h2>
        <ul className="mt-10 grid gap-x-10 gap-y-16 sm:grid-cols-2 lg:grid-cols-6">
          {rest.map((story, i) => (
            <li key={story.slug} className={`reveal ${i < 2 ? "lg:col-span-3" : "lg:col-span-2"}`}>
              <StoryCard story={story} sizes={i < 2 ? "(min-width: 640px) 50vw, 100vw" : "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"} />
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-section bg-surface">
        <div className="container-page section reveal text-center">
          <h2 className={`${serif.className} mx-auto max-w-2xl text-display font-light`}>Everything we make can come home to be repaired.</h2>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/about" className="btn btn-primary sm:w-auto sm:px-10">About the house</Link>
            <Link href="/contact" className="btn btn-secondary sm:w-auto sm:px-10">Write to us</Link>
          </div>
        </div>
      </section>
    </>
  );
}
