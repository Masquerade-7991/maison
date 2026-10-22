// Exchange rates: read for pricing, refreshed once a day by /api/cron/fx from the ECB's reference rates.
import { sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { fxRates } from "@/db/schema";
import { formatMoney } from "@/lib/format";
import { fallbackRates, localPrice, marketById, markets, PEGGED, type Market, type Rates } from "@/lib/markets";

/** Units per USD for every market currency: stored rates over the fallbacks. One read per request. */
export const getRates = cache(async (): Promise<Rates> => {
  const rows = await db.select({ currency: fxRates.currency, perUsd: fxRates.perUsd }).from(fxRates);
  return { ...fallbackRates(), ...Object.fromEntries(rows.map((r) => [r.currency, r.perUsd])), ...PEGGED };
});

const SOURCE = "https://api.frankfurter.dev/v1/latest"; // ECB reference rates, no key
const MAX_DAILY_MOVE = 0.1; // a bigger jump is more likely a bad feed than the market
const excluded = (col: string) => sql.raw(`excluded.${col}`);

/**
 * Fetches today's rates and stores the sane ones. A failed fetch changes nothing; a rate that moved more
 * than 10% since the stored one is skipped and reported. Returns what happened, for the cron log.
 */
export async function refreshRates(): Promise<{ updated: string[]; skipped: string[] }> {
  const wanted = [...new Set(markets.map((m) => m.currency))].filter((c) => !(c in PEGGED));
  const res = await fetch(`${SOURCE}?base=USD&symbols=${wanted.join(",")}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`rates fetch failed: HTTP ${res.status}`);
  const body = (await res.json()) as { date?: string; rates?: Record<string, number> };
  const current = await getRates();

  const updated: string[] = [];
  const skipped: string[] = [];
  const rows = [];
  for (const c of wanted) {
    const rate = body.rates?.[c];
    const before = current[c];
    if (!(typeof rate === "number" && rate > 0) || (before && Math.abs(rate / before - 1) > MAX_DAILY_MOVE)) {
      skipped.push(`${c}: ${rate} (was ${before})`);
      continue;
    }
    rows.push({ currency: c, perUsd: rate, source: `ECB ${body.date ?? ""}`.trim(), fetchedAt: new Date() });
    updated.push(c);
  }
  if (rows.length) {
    await db
      .insert(fxRates)
      .values(rows)
      .onConflictDoUpdate({ target: fxRates.currency, set: { perUsd: excluded("per_usd"), source: excluded("source"), fetchedAt: excluded("fetched_at") } });
  }
  return { updated, skipped };
}

export type Pricing = {
  market: Market;
  /** A USD-cents amount in the market's minor units (the rounded local price). */
  at: (usdCents: number) => number;
  /** A USD-cents amount written as local money, e.g. a price-band threshold. */
  fmt: (usdCents: number) => string;
};

/** What a page needs to price things in a market. */
export async function getPricing(marketId: string): Promise<Pricing> {
  const market = marketById(marketId);
  const rates = await getRates();
  const at = (usdCents: number) => localPrice(usdCents, market, rates);
  return { market, at, fmt: (usdCents) => formatMoney(at(usdCents), market.currency) };
}
