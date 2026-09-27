import Image from "next/image";
import Link from "next/link";
import { currency } from "@/lib/format";
import type { Product } from "@/lib/products";
import { stockState } from "@/lib/stock";

export function ProductCard({
  product: p,
  preload,
  showNew = true,
}: {
  product: Product;
  preload?: boolean;
  /** Off where every card is new anyway, e.g. the homepage New arrivals grid. */
  showNew?: boolean;
}) {
  const image = p.images[0];
  const tag = stockState(p) === "sold_out" ? "Sold out" : showNew && p.isNew ? "New" : null;

  return (
    <Link href={`/products/${p.slug}`} className="group block">
      <div className="media-product">
        {image && (
          <Image
            src={image.url}
            alt={image.alt}
            fill
            preload={preload}
            sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 50vw"
          />
        )}
        {tag && <span className="label absolute top-3 left-3 bg-paper px-2 py-1">{tag}</span>}
      </div>
      <div className="mt-3 flex flex-col gap-1 md:mt-4 md:flex-row md:justify-between md:gap-4">
        <h3 className="decoration-1 underline-offset-4 group-hover:underline">{p.name}</h3>
        <p className="flex gap-2 tabular-nums md:shrink-0">
          {p.compareAt !== null && (
            <s className="text-muted">
              <span className="sr-only">Was </span>
              {currency(p.compareAt)}
            </s>
          )}
          <span className={p.compareAt !== null ? "text-ink" : "text-muted"}>{currency(p.price)}</span>
        </p>
      </div>
    </Link>
  );
}
