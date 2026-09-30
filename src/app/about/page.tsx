import type { Metadata } from "next";
import localFont from "next/font/local";
import Image from "next/image";
import Link from "next/link";
import { atelier, hero } from "@/lib/sample-data";

export const metadata: Metadata = {
  title: "About | Maison",
  description: "Made slowly, since 1987: the story of Maison, from a two-room Florentine atelier to a circle of family workshops across Italy.",
};

// The About page's display serif only; the rest of the site stays in Geist. Self-hosted (Latin, light
// only, SIL OFL): next/font/google under Turbopack fails the Vercel build when Google answers with
// `&`-bearing font URLs (vercel/next.js#99114). Every serif use on this page is font-light.
const serif = localFont({
  src: [
    { path: "./fonts/cormorant-garamond-300.woff2", weight: "300", style: "normal" },
    { path: "./fonts/cormorant-garamond-300-italic.woff2", weight: "300", style: "italic" },
  ],
});

// Photos the site already uses (images.unsplash.com is the only host next.config.ts allows).
const photo = (id: string) => `https://images.unsplash.com/photo-${id}?ar=4:5&fit=crop&w=1600&q=80`;

const chapters = [
  {
    year: "1987",
    title: "Two rooms on Via dei Serragli",
    body: [
      "Elena Marchetti grew up in her father's cutting room, where hides were chosen by hand and patterns were kept in pencil. At twenty-six she rented two rooms on a Florentine side street, bought a secondhand skiving machine, and made twelve bags a season.",
      "Each was numbered by hand on the inside of the flap. The first, a red top handle bag, is still in the family; the numbering has never stopped.",
    ],
    img: { src: photo("1584917865442-de89df76afd3"), alt: "Red leather top-handle bag on a white plinth" },
  },
  {
    year: "1998",
    title: "A circle of workshops",
    body: [
      "Demand came slowly and then all at once. Rather than build a factory, Elena went looking for other families like her own: a knitter in Biella, a shoemaker in the Marche, a weaver of straw and wicker outside Siena.",
      "Maison became a circle rather than a company, each workshop keeping its name, its pace and its apprentices. Today there are twelve of them, and thirty-eight artisans.",
    ],
    img: { src: photo("1590874103328-eac38a683ce7"), alt: "Tan leather and wicker top-handle bag in a shop window" },
  },
  {
    year: "Today",
    title: "Slowness, on purpose",
    body: [
      "We still make in small runs, in undyed and naturally finished materials, and we still sign what we make. No logos on the outside: the piece should be recognised by how it is made, not by what it says.",
      "Everything we sell can come home to be repaired, for as long as it is loved.",
    ],
    img: atelier,
  },
];

const numbers = [
  { figure: "1987", label: "The first twelve bags" },
  { figure: "38", label: "Artisans in the circle" },
  { figure: "12", label: "Family workshops across Italy" },
  { figure: "For life", label: "Repairs on everything we make" },
];

const craft = [
  { title: "Materials", body: "Full grain leathers, undyed cashmere and linen, brass that is meant to age. Chosen by hand, in person, every season." },
  { title: "The hand", body: "A bag passes through six pairs of hands before it is signed. Edges are painted, not sealed; stitches are counted, not guessed." },
  { title: "Repair", body: "Send any piece home and our workshops will restitch, recondition or rebuild it. Free for the first year, at cost after that." },
];

export default function AboutPage() {
  return (
    <>
      {/* Opening: full-height image and one line, like the homepage hero. */}
      <section className="media-hero h-[calc(100svh-var(--spacing-header))] min-h-128 w-full">
        <Image
          src={hero.src}
          alt={hero.alt}
          fill
          preload
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/20 to-transparent" />
        <div className="container-page absolute inset-x-0 bottom-0 pb-12 text-white md:pb-20">
          <p className="label">The house</p>
          <h1 className={`${serif.className} mt-5 max-w-4xl text-display-lg font-light`}>
            Made slowly, <em className="font-light">since 1987</em>.
          </h1>
        </div>
      </section>

      {/* Overture */}
      <section className="container-page section text-center">
        <p className={`${serif.className} reveal mx-auto max-w-3xl text-display-sm leading-snug font-light md:text-display`}>
          Maison began with one woman, two rooms and a simple rule: make fewer things, and make them to be kept.
        </p>
      </section>

      {/* Chapters: alternating image and text, like the homepage editorial split. */}
      {chapters.map((c, i) => (
        <section key={c.year} className="grid bg-surface md:grid-cols-2 [&+&]:mt-px">
          <div className={`relative aspect-product md:aspect-auto md:min-h-168 ${i % 2 ? "md:order-2" : ""}`}>
            <Image src={c.img.src} alt={c.img.alt} fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
          </div>
          <div className="reveal flex flex-col justify-center px-gutter py-16 md:px-[max(var(--spacing-gutter),6vw)] md:py-section">
            <p className="label text-muted">{c.year}</p>
            <h2 className={`${serif.className} mt-4 text-display font-light`}>{c.title}</h2>
            {c.body.map((p) => (
              <p key={p.slice(0, 20)} className="mt-6 max-w-md text-muted">{p}</p>
            ))}
          </div>
        </section>
      ))}

      {/* Pull quote */}
      <section className="container-page section">
        <figure className="reveal mx-auto max-w-4xl text-center">
          <blockquote className={`${serif.className} text-display leading-tight font-light italic`}>
            &ldquo;A thing made well should outlive the fashion it was made in, and ideally the person who bought it.&rdquo;
          </blockquote>
          <figcaption className="label mt-8 text-muted">Elena Marchetti, founder</figcaption>
        </figure>
      </section>

      {/* The house in numbers */}
      <section className="border-y border-line">
        <dl className="container-page grid grid-cols-2 gap-y-12 py-16 md:grid-cols-4 md:py-20">
          {numbers.map((n) => (
            <div key={n.label} className="reveal flex flex-col-reverse text-center">
              <dt className="label mt-3 text-muted">{n.label}</dt>
              <dd className={`${serif.className} text-display font-light`}>{n.figure}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Craft */}
      <section className="container-page section">
        <p className="label text-muted">How we work</p>
        <h2 className={`${serif.className} mt-4 max-w-2xl text-display font-light`}>Three things we will not hurry</h2>
        <ol className="mt-12 grid gap-12 md:grid-cols-3 md:gap-10">
          {craft.map((c, i) => (
            <li key={c.title} className="reveal rule pt-6">
              <p className={`${serif.className} text-display-sm font-light text-muted`}>0{i + 1}</p>
              <h3 className="mt-4 font-medium">{c.title}</h3>
              <p className="mt-3 text-muted">{c.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Close */}
      <section className="bg-surface">
        <div className="container-page section reveal text-center">
          <h2 className={`${serif.className} mx-auto max-w-2xl text-display font-light`}>Twelve bags a season, still signed by hand.</h2>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/new-arrivals" className="btn btn-primary sm:w-auto sm:px-10">Discover the collections</Link>
            <Link href="/contact" className="btn btn-secondary sm:w-auto sm:px-10">Write to us</Link>
          </div>
        </div>
      </section>
    </>
  );
}
