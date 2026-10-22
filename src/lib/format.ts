import { currencyDigits, localeFor } from "./markets.ts";

/**
 * Exact money from integer minor units (cents, paise; whole yen and won), never rounded: $1,450, $99.99,
 * ₹10,000, ¥17,000. Whole amounts drop the decimals. Written the way the currency's market writes it.
 */
export function formatMoney(minor: number, currency = "USD") {
  const code = currency.toUpperCase();
  const digits = currencyDigits(code);
  const unit = 10 ** digits;
  return new Intl.NumberFormat(localeFor(code), {
    style: "currency",
    currency: code,
    minimumFractionDigits: minor % unit === 0 ? 0 : digits,
    maximumFractionDigits: digits,
  }).format(minor / unit);
}
