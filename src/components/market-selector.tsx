"use client";

import { useRef, useSyncExternalStore, useTransition } from "react";
import { setMarketAction } from "@/lib/market-actions";
import { INTERNATIONAL, MARKET_COOKIE, marketById, markets } from "@/lib/markets";

const readMarket = () => document.cookie.split("; ").find((c) => c.startsWith(`${MARKET_COOKIE}=`))?.split("=")[1] ?? null;
const noSubscribe = () => () => {}; // the cookie only changes with a reload

/**
 * "Delivering to: India (INR)" in the footer, and the list of markets in a native <dialog>. The market
 * comes from the cookie src/proxy.ts sets, read after load so the layout stays static. Choosing one stores
 * it on the server and reloads, so every price on the page (and the bag) is re-priced in the new currency.
 */
export function MarketSelector() {
  const dialog = useRef<HTMLDialogElement>(null);
  const current = useSyncExternalStore(noSubscribe, readMarket, () => null); // null while server rendering
  const [pending, start] = useTransition();

  const m = current ? marketById(current) : null;
  const choose = (id: string) =>
    start(async () => {
      await setMarketAction(id);
      window.location.reload();
    });

  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className="link-nav cursor-pointer text-left uppercase hover:text-ink">
        {m ? `Delivering to: ${m.name} (${m.currency})` : "Delivery country"}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="market-title"
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto border border-line bg-paper p-0 text-body font-normal tracking-normal text-ink normal-case backdrop:bg-black/60"
      >
        <div className="flex items-start justify-between gap-6 border-b border-line px-6 py-5 md:px-8">
          <div>
            <p className="label text-muted">Delivery country</p>
            <h2 id="market-title" className="mt-2 text-display-sm">Where should we deliver?</h2>
          </div>
          <button type="button" onClick={() => dialog.current?.close()} aria-label="Close" className="label link-nav mt-1 text-muted hover:text-ink">
            Close
          </button>
        </div>
        <div className="px-6 py-6 md:px-8">
          <p className="text-muted">Prices and payment follow the country we deliver to.</p>
          <ul className="mt-6 grid gap-1 sm:grid-cols-2" aria-busy={pending}>
            {markets.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => choose(o.id)}
                  aria-current={o.id === current ? "true" : undefined}
                  className={`flex w-full items-center justify-between gap-4 border px-4 py-3 text-left transition-colors disabled:cursor-wait ${
                    o.id === current ? "border-ink" : "border-line hover:border-ink"
                  }`}
                >
                  <span>{o.id === INTERNATIONAL ? "Other countries" : o.name}</span>
                  <span className="label text-muted">{o.currency}</span>
                </button>
              </li>
            ))}
          </ul>
          {m?.id === INTERNATIONAL && (
            <p role="status" className="mt-6 border-l-2 border-line pl-4 text-muted">
              We don&apos;t deliver to your country yet. Prices are in US dollars, for delivery within the United States.
            </p>
          )}
        </div>
      </dialog>
    </>
  );
}
