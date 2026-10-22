// Markets: a currency, the countries we deliver to in it, and how money is written there. Pure: no imports
// beyond pricing.ts, so proxy.ts, client components and markets.check.mjs can all use it.
import { pricePair, pricePoint } from "./pricing.ts"; // .ts extension: the check script runs this file in Node

export type Market = {
  id: string; // cookie value and the internal route segment, so it must not collide with a top-level route
  name: string;
  currency: string; // ISO 4217
  locale: string; // for Intl number formatting (en-IN writes ₹1,10,000)
  countries: string[]; // ISO 3166 alpha-2; the delivery addresses checkout accepts
  fallbackRate: number; // units per USD if fx_rates has no row yet (ECB, 2026-10-22)
};

const EUROZONE = ["AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK"];

export const markets: Market[] = [
  { id: "us", name: "United States", currency: "USD", locale: "en-US", countries: ["US", "PR"], fallbackRate: 1 },
  { id: "ca", name: "Canada", currency: "CAD", locale: "en-CA", countries: ["CA"], fallbackRate: 1.4034 },
  { id: "gb", name: "United Kingdom", currency: "GBP", locale: "en-GB", countries: ["GB"], fallbackRate: 0.74761 },
  { id: "eu", name: "Europe", currency: "EUR", locale: "en-IE", countries: EUROZONE, fallbackRate: 0.89246 },
  { id: "ch", name: "Switzerland", currency: "CHF", locale: "en-CH", countries: ["CH", "LI"], fallbackRate: 0.82204 },
  { id: "in", name: "India", currency: "INR", locale: "en-IN", countries: ["IN"], fallbackRate: 94.82 },
  { id: "jp", name: "Japan", currency: "JPY", locale: "en-JP", countries: ["JP"], fallbackRate: 157.05 },
  { id: "kr", name: "South Korea", currency: "KRW", locale: "en-KR", countries: ["KR"], fallbackRate: 1324.63 },
  { id: "au", name: "Australia", currency: "AUD", locale: "en-AU", countries: ["AU"], fallbackRate: 1.4261 },
  { id: "sg", name: "Singapore", currency: "SGD", locale: "en-SG", countries: ["SG"], fallbackRate: 1.2776 },
  { id: "hk", name: "Hong Kong", currency: "HKD", locale: "en-HK", countries: ["HK"], fallbackRate: 7.8398 },
  // ECB publishes no AED rate; the dirham has been pegged at 3.6725 per dollar since 1997.
  { id: "ae", name: "United Arab Emirates", currency: "AED", locale: "en-AE", countries: ["AE"], fallbackRate: 3.6725 },
  // Everyone else: dollar prices, delivery to the US only (the selector says so).
  { id: "intl", name: "International", currency: "USD", locale: "en-US", countries: ["US"], fallbackRate: 1 },
];

export const DEFAULT_MARKET = "us";
export const INTERNATIONAL = "intl";
/** The market in effect, for display only (the footer); set by src/proxy.ts. */
export const MARKET_COOKIE = "market";
/** The visitor's own choice from the footer selector; beats their detected country. */
export const MARKET_CHOICE_COOKIE = "market-choice";
/** Request header src/proxy.ts sets (always overwriting) for server code. */
export const MARKET_HEADER = "x-maison-market";
/** Currencies with a fixed rate, never fetched. */
export const PEGGED: Record<string, number> = { USD: 1, AED: 3.6725 };

const byId = new Map(markets.map((m) => [m.id, m]));

export const isMarketId = (id: unknown): id is string => typeof id === "string" && byId.has(id);
export const marketById = (id: string | undefined | null): Market => byId.get(id ?? "") ?? byId.get(DEFAULT_MARKET)!;

/** The market for a visitor's country (Vercel's x-vercel-ip-country); unknown or missing → International, or US locally. */
export function marketForCountry(country: string | null | undefined): Market {
  if (!country) return byId.get(DEFAULT_MARKET)!;
  const cc = country.toUpperCase();
  return markets.find((m) => m.id !== INTERNATIONAL && m.countries.includes(cc)) ?? byId.get(INTERNATIONAL)!;
}

/** Decimal places of a currency's minor unit: 2 for USD, 0 for JPY and KRW. */
export const currencyDigits = (currency: string) =>
  new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;

/** Units of `currency` per US dollar. */
export type Rates = Record<string, number>;

export const fallbackRates = (): Rates => Object.fromEntries(markets.map((m) => [m.currency, m.fallbackRate]));

/**
 * A USD price (cents) in a market's currency (minor units). Dollar markets keep the exact stored price;
 * every other currency is converted and rounded to a price point, so it is always whole units.
 */
export function localPrice(usdCents: number, market: Market, rates: Rates): number {
  if (market.currency === "USD") return usdCents;
  const digits = currencyDigits(market.currency);
  const rate = rates[market.currency] ?? market.fallbackRate;
  return pricePoint((usdCents / 100) * rate * 10 ** digits, digits);
}

/** localPrice for a price and its "was" price, keeping the "was" price above the price. */
export function localPair(usdCents: number, compareAtUsdCents: number | null, market: Market, rates: Rates) {
  if (market.currency === "USD") return { price: usdCents, compareAt: compareAtUsdCents };
  const digits = currencyDigits(market.currency);
  const rate = rates[market.currency] ?? market.fallbackRate;
  const toMinor = (c: number) => (c / 100) * rate * 10 ** digits;
  return pricePair(toMinor(usdCents), compareAtUsdCents === null ? null : toMinor(compareAtUsdCents), digits);
}

/** The locale that writes a currency the way its market does (₹1,10,000 for INR). */
export const localeFor = (currency: string) => markets.find((m) => m.currency === currency.toUpperCase())?.locale ?? "en-US";

/** An amount in an order's currency back in US cents, at the rate the order was priced with (admin reporting). */
export const toUsdCents = (minor: number, currency: string, usdRate: number) =>
  Math.round((minor / 10 ** currencyDigits(currency.toUpperCase()) / usdRate) * 100);
