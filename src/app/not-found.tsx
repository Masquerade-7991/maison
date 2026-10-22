import Link from "next/link";
import { nav } from "@/lib/sample-data";

// No database reads: this page must render even when the catalogue can't be reached.
export default function NotFound() {
  return (
    <section className="container-page mx-auto max-w-2xl py-section text-center">
      <p className="label text-muted">Page not found</p>
      <h1 className="mt-4 text-display-sm">We couldn&apos;t find that page</h1>
      <p className="mt-4 text-muted">The piece may have sold through, or the link may have changed. Try a search instead.</p>

      <form action="/search" role="search" className="mx-auto mt-10 flex max-w-md flex-col gap-4 sm:flex-row sm:items-end">
        <label htmlFor="nf-q" className="sr-only">Search products</label>
        <input id="nf-q" name="q" type="search" placeholder="Name, colour or category" enterKeyHint="search" className="field" />
        <button type="submit" className="btn btn-primary shrink-0">Search</button>
      </form>

      <nav aria-label="Shop" className="rule mt-12 pt-6">
        <ul className="flex flex-wrap justify-center gap-x-7 gap-y-3">
          {[{ label: "New arrivals", href: "/new-arrivals" }, ...nav].map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="label link-nav">{item.label}</Link>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  );
}
