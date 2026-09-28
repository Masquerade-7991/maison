import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BagLineControls } from "@/components/bag-line-controls";
import { CheckoutButton } from "@/components/checkout-button";
import { ProductCard } from "@/components/product-card";
import { getBag } from "@/lib/cart";
import { lineTotalCents, type BagLine } from "@/lib/cart-rules";
import { formatCents } from "@/lib/format";
import { getNewArrivals } from "@/lib/products";
import { services } from "@/lib/sample-data";
import { requireUser } from "@/lib/session";
import { stockCopy, stockTone } from "@/lib/stock";

export const metadata: Metadata = { title: "Your bag | Maison" };

const pieces = (n: number) => `${n} ${n === 1 ? "piece" : "pieces"}`;

export default async function BagPage({ searchParams }: PageProps<"/bag">) {
  const { user } = await requireUser("/bag");
  const cancelled = (await searchParams).checkout === "cancelled";
  const bag = await getBag(user.id);
  const empty = bag.lines.length === 0;
  const suggestions = empty ? await getNewArrivals(4) : [];

  return (
    <section className="container-page py-12 md:py-20">
      <header className="flex items-end justify-between gap-6 border-b border-line pb-8 md:pb-10">
        <div>
          <p className="label text-muted">Shopping bag</p>
          <h1 className="mt-3 text-display-sm">{empty ? "Your bag" : `Your bag (${bag.itemCount})`}</h1>
        </div>
        {!empty && <Link href="/new-arrivals" className="label link hidden sm:inline">Continue shopping</Link>}
      </header>

      {empty ? (
        <>
          <div className="mx-auto max-w-md py-16 text-center md:py-24">
            <p className="text-display-sm">Your bag is empty</p>
            <p className="mt-4 text-muted">
              Pieces you add will wait here for you, with prices and availability kept up to date.
            </p>
            <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/new-arrivals" className="btn btn-primary">Shop new arrivals</Link>
              <Link href="/gifts" className="btn btn-secondary">Explore gifts</Link>
            </div>
          </div>
          {suggestions.length > 0 && (
            <div className="rule pt-10 md:pt-14">
              <h2 className="label">Just in</h2>
              <ul className="grid-products mt-6 md:mt-8">
                {suggestions.map((p, i) => (
                  // 3-col tablet grid shows 3 so there is no orphan
                  <li key={p.slug} className={i === 3 ? "md:max-xl:hidden" : undefined}>
                    <ProductCard product={p} showNew={false} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-8">
            {cancelled && (
              <p role="status" className="mt-8 border-l-2 border-ink pl-4">
                Checkout was cancelled and nothing was charged. Your bag is saved.
              </p>
            )}
            {bag.hasIssues && (
              <p role="status" className="mt-8 border-l-2 border-danger pl-4 text-danger">
                Availability has changed for some pieces since you added them. Please review the items marked below.
              </p>
            )}
            <ul>
              {bag.lines.map((l) => (
                <BagItem key={`${l.slug}-${l.size}`} line={l} />
              ))}
            </ul>
          </div>

          {/* Beside the lines from desktop up; below them (right-aligned on tablet) otherwise. */}
          <aside className="self-start md:ml-auto md:w-full md:max-w-md lg:sticky lg:top-[calc(var(--spacing-header)+2rem)] lg:col-span-4 lg:mt-8 lg:max-w-none">
            <div className="bg-surface p-6 md:p-8">
              <h2 className="label">Order summary</h2>
              <dl className="mt-6 space-y-3">
                <div className="flex justify-between gap-4">
                  <dt>Subtotal <span className="text-muted">({pieces(bag.payableCount)})</span></dt>
                  <dd className="tabular-nums">{formatCents(bag.subtotalCents)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Shipping</dt>
                  <dd className="text-muted">Complimentary</dd>
                </div>
                <div className="rule flex items-baseline justify-between gap-4 pt-5 mt-5">
                  <dt className="label">Total</dt>
                  <dd className="text-display-sm tabular-nums">{formatCents(bag.subtotalCents)}</dd>
                </div>
              </dl>
              {bag.payableCount < bag.itemCount && <p className="mt-2 text-right text-muted">Excludes sold-out pieces.</p>}
              <CheckoutButton blocked={bag.hasIssues} />
              <p id="checkout-note" className="mt-3 text-center text-muted">
                {bag.hasIssues ? "Review the marked pieces before checking out." : "Secure payment by Stripe. You'll add delivery details next."}
              </p>
            </div>
            <ul className="mt-8 space-y-5 px-1">
              {services.slice(0, 3).map((s) => (
                <li key={s.title}>
                  <h3 className="label">{s.title}</h3>
                  <p className="mt-1 text-muted">{s.body}</p>
                </li>
              ))}
            </ul>
            <Link href="/new-arrivals" className="label link mt-8 inline-block px-1 sm:hidden">Continue shopping</Link>
          </aside>
        </div>
      )}
    </section>
  );
}

const issueCopy = {
  sold_out: "This piece has sold out and can't be ordered. Please remove it.",
  over_stock: "Fewer are available than you have in your bag.",
};

function BagItem({ line: l }: { line: BagLine }) {
  const soldOut = l.issue === "sold_out";
  // Quiet by default: only mention stock when it's worth knowing (low, made to order) or a problem.
  const showStock = !l.issue && (l.stock === "low_stock" || l.stock === "made_to_order");

  return (
    <li className="grid grid-cols-[7rem_1fr] gap-5 border-b border-line py-8 sm:grid-cols-[9rem_1fr] sm:gap-8 lg:grid-cols-[10rem_1fr]">
      <Link href={`/products/${l.slug}`} className={`media-product block transition-opacity ${soldOut ? "opacity-40 grayscale" : "hover:opacity-90"}`}>
        {l.imageUrl && <Image src={l.imageUrl} alt={l.imageAlt} fill sizes="(min-width: 1024px) 10rem, (min-width: 640px) 9rem, 7rem" />}
      </Link>

      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-8">
          <div className="min-w-0">
            <p className="label text-muted">{l.categoryName}</p>
            <Link href={`/products/${l.slug}`} className="link-nav mt-2 inline-block text-base">{l.name}</Link>
            <p className="mt-2 text-muted">{[l.colour, l.size && `Size ${l.size}`].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="shrink-0 sm:text-right">
            <p className={`tabular-nums ${soldOut ? "text-muted line-through" : ""}`}>{formatCents(lineTotalCents(l.priceCents, l.quantity))}</p>
            {l.quantity > 1 && <p className="mt-1 text-muted tabular-nums">{formatCents(l.priceCents)} each</p>}
          </div>
        </div>

        {showStock && (
          <div>
            <p className="label flex items-center gap-2">
              <span aria-hidden className={`size-1.5 rounded-full ${stockTone[l.stock]}`} />
              {stockCopy(l.stock, l.stockQuantity)}
            </p>
            {l.stockDetail && <p className="mt-1 text-muted">{l.stockDetail}</p>}
          </div>
        )}
        {l.issue && (
          <p className="flex items-baseline gap-2 text-danger">
            <span aria-hidden className="size-1.5 shrink-0 translate-y-[-0.15em] rounded-full bg-danger" />
            {issueCopy[l.issue]}
          </p>
        )}

        <div className="mt-auto">
          <BagLineControls slug={l.slug} size={l.size} quantity={l.quantity} max={l.lineMax} name={l.name} issue={l.issue} />
        </div>
      </div>
    </li>
  );
}
