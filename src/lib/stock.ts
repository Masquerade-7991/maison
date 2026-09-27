// The only place stock becomes a state. The database stores a quantity and a flag, never a state.

export type StockState = "in_stock" | "low_stock" | "made_to_order" | "sold_out";

export const LOW_STOCK_THRESHOLD = 3;

export function stockState(p: { stockQuantity: number; madeToOrder: boolean }): StockState {
  if (p.stockQuantity > LOW_STOCK_THRESHOLD) return "in_stock";
  if (p.stockQuantity > 0) return "low_stock";
  return p.madeToOrder ? "made_to_order" : "sold_out";
}

export const isBuyable = (s: StockState) => s !== "sold_out";

export function stockCopy(s: StockState, quantity: number) {
  switch (s) {
    case "in_stock":
      return "In stock";
    case "low_stock":
      return `Only ${quantity} left`;
    case "made_to_order":
      return "Made to order";
    case "sold_out":
      return "Sold out";
  }
}

// Background class for the small status dot.
export const stockTone: Record<StockState, string> = {
  in_stock: "bg-success",
  low_stock: "bg-danger",
  made_to_order: "bg-ink",
  sold_out: "bg-muted",
};
