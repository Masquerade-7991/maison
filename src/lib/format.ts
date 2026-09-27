// Catalogue display only: rounds to whole dollars. Anything derived from cents that must
// match a payment (bag, checkout, receipts) needs an exact formatter instead.
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export const currency = (dollars: number) => usd.format(dollars);
