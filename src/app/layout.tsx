import type { Metadata } from "next";
import Link from "next/link";
// Self-hosted (next/font/local inside the package): no Google Fonts request at build time, see CLAUDE.md.
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { BagLink } from "@/components/bag-link";
import { InlineScript } from "@/components/inline-script";
import { MarketSelector } from "@/components/market-selector";
import { Menu } from "@/components/menu";
import { ThemeToggle, themeScript } from "@/components/theme-toggle";
import { footer, nav } from "@/lib/sample-data";
import "./globals.css";

export const metadata: Metadata = {
  title: "Maison",
  description: "Ready-to-wear, bags and accessories.",
};

function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-paper">
      <div className="container-page grid h-header grid-cols-[1fr_auto_1fr] items-center">
        {/* Compact menu below 1280px (the links + logo + utilities need the room): native <details>, which
            Menu also closes on navigation, Esc and outside clicks. */}
        <Menu className="group xl:hidden">
          <summary className="label cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Menu</span>
            <span className="hidden group-open:inline">Close</span>
          </summary>
          <nav className="absolute inset-x-0 top-full border-b border-line bg-paper">
            <ul className="container-page flex flex-col py-4">
              {nav.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="block py-3 text-display-sm">
                    {item.label}
                  </Link>
                </li>
              ))}
              <li className="rule mt-4 flex gap-8 pt-6 sm:hidden">
                <Link href="/search" className="label">Search</Link>
                <Link href="/account" className="label">Account</Link>
              </li>
            </ul>
          </nav>
        </Menu>

        <nav className="hidden xl:block" aria-label="Main">
          <ul className="flex gap-8">
            {nav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="label link-nav">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Toggle hangs off the logo's right edge so the logo stays centred. */}
        <div className="relative">
          <Link href="/" className="text-xl tracking-[0.35em] uppercase">
            Maison
          </Link>
          <ThemeToggle className="absolute top-1/2 left-full -translate-y-1/2" />
        </div>

        <ul className="flex justify-end gap-5 md:gap-8">
          <li className="hidden sm:block">
            <Link href="/search" className="label link-nav">Search</Link>
          </li>
          <li className="hidden sm:block">
            <Link href="/account" className="label link-nav">Account</Link>
          </li>
          <li>
            <BagLink />
          </li>
        </ul>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-section border-t border-line">
      <div className="container-page grid gap-10 py-16 sm:grid-cols-3">
        <div>
          <p className="text-xl tracking-[0.35em] uppercase">Maison</p>
          <p className="mt-4 max-w-xs text-muted">
            Considered design, made to last. Complimentary shipping and returns on every order.
          </p>
        </div>
        {footer.map((col) => (
          <div key={col.title}>
            <h2 className="label">{col.title}</h2>
            <ul className="mt-5 space-y-3">
              {col.links.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="link-nav text-muted hover:text-ink">{l.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="container-page rule flex flex-col gap-2 py-6 text-label text-muted uppercase sm:flex-row sm:justify-between">
        {/* A div, not a p: the selector's <dialog> holds headings and a list, which a paragraph can't contain. */}
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <p>© {new Date().getFullYear()} Maison</p>
          <MarketSelector />
        </div>
        <p>Imagery courtesy of Unsplash</p>
      </div>
    </footer>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
      suppressHydrationWarning // themeScript may set data-theme before React hydrates
    >
      <head>
        {/* Next's "Preventing flash before hydration" pattern: sets data-theme before first paint. */}
        <InlineScript html={themeScript} />
      </head>
      <body className="min-h-full flex flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
