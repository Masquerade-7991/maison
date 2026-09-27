// Catalogue display only: rounds to whole dollars. Anything derived from cents that must
// match a payment (bag, checkout, receipts) needs an exact formatter instead.
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export const currency = (dollars: number) => usd.format(dollars);

// Exact money from integer cents, for the bag (and later checkout and receipts): $1,450 or $99.99, never rounded.
export const formatCents = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
