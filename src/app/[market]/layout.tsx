import { notFound } from "next/navigation";
import { DEFAULT_MARKET, isMarketId } from "@/lib/markets";

// Every storefront page lives under /[market]; src/proxy.ts maps /women to /<visitor's market>/women, so the
// market never shows in a URL. Each market's pages are cached separately; only the default one is pre-built.
export function generateStaticParams() {
  return [{ market: DEFAULT_MARKET }];
}

export default async function MarketLayout({ children, params }: LayoutProps<"/[market]">) {
  if (!isMarketId((await params).market)) notFound();
  return children;
}
