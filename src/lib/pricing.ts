// Price points. Pure: no imports, so the check script and the one-off scripts run it directly in Node.
// Amounts are minor units (cents, paise; yen and won have none) of a currency with `digits` decimals.

/** The step that keeps two significant figures of a whole-unit amount: 76 → 1, 273 → 10, 6437 → 100. */
const sigStep = (major: number) => 10 ** Math.max(0, Math.floor(Math.log10(Math.max(major, 1))) - 1);

/**
 * A clean price point: whole units, two significant figures (76.27 → 76, 273.40 → 270, 6437 → 6400).
 * Takes and returns minor units; `digits` is the currency's decimals (2 for USD, 0 for JPY).
 */
export function pricePoint(minor: number, digits = 2): number {
  const unit = 10 ** digits;
  const major = minor / unit;
  const step = sigStep(major);
  return Math.max(1, Math.round(major / step)) * step * unit;
}

/**
 * A price and its optional "was" price, both as price points. If rounding makes the "was" price
 * no higher than the price, it moves up one step, so a reduction never disappears.
 */
export function pricePair(priceMinor: number, compareAtMinor: number | null, digits = 2) {
  const price = pricePoint(priceMinor, digits);
  if (compareAtMinor === null) return { price, compareAt: null };
  let compareAt = pricePoint(compareAtMinor, digits);
  if (compareAt <= price) compareAt = price + sigStep(price / 10 ** digits) * 10 ** digits;
  return { price, compareAt };
}
