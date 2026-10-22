// The visitor's market for per-request server code (bag, checkout). src/proxy.ts decides it on every request
// and passes it in a header it always overwrites, so this never trusts a cookie the browser could edit.
import { headers } from "next/headers";
import { DEFAULT_MARKET, isMarketId, MARKET_HEADER, marketById, type Market } from "@/lib/markets";

export async function getMarket(): Promise<Market> {
  const id = (await headers()).get(MARKET_HEADER);
  return marketById(isMarketId(id) ? id : DEFAULT_MARKET);
}
