"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BAG_CHANGED } from "@/lib/cart-rules";

/**
 * The header's Bag link with the number of pieces in the bag. The server renders plain "Bag" (so the
 * static routes stay static); the count is fetched after load, on every navigation, and whenever
 * something announces a bag change.
 */
export function BagLink() {
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let live = true;
    const load = () =>
      fetch("/api/bag/count", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { count: 0 }))
        .then((d: { count?: number }) => live && setCount(Number.isInteger(d.count) ? d.count! : 0))
        .catch(() => {}); // keep the last number on a network blip
    load();
    window.addEventListener(BAG_CHANGED, load);
    return () => {
      live = false;
      window.removeEventListener(BAG_CHANGED, load);
    };
  }, [pathname]);

  return (
    <Link href="/bag" className="label link-nav" aria-label={count ? `Bag, ${count} ${count === 1 ? "item" : "items"}` : "Bag"}>
      Bag{count > 0 && <span className="tabular-nums"> ({count})</span>}
    </Link>
  );
}
