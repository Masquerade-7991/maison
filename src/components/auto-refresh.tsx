"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Re-renders the (server) page every few seconds while it waits for something the server learns
// asynchronously, e.g. the Stripe webhook confirming an order. Gives up after `maxTries`.
export function AutoRefresh({ everyMs = 2000, maxTries = 15 }: { everyMs?: number; maxTries?: number }) {
  const router = useRouter();
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (tries >= maxTries) return;
    const t = setTimeout(() => {
      router.refresh();
      setTries((n) => n + 1);
    }, everyMs);
    return () => clearTimeout(t);
  }, [tries, maxTries, everyMs, router]);
  return tries >= maxTries ? (
    <p className="mt-4 text-muted">
      This is taking longer than usual. Refresh this page in a minute: your order updates as soon as payment is confirmed.
    </p>
  ) : null;
}
