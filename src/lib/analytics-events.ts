// The analytics event catalogue: every event name the site sends to Helo and its properties, so a wrong
// name or a missing property is a type error. Pure (.ts imports), so analytics-events.check.mjs runs it in
// Node. Sending lives in analytics.ts; this file only names and shapes.
import { currencyDigits } from "./markets.ts";

type Money = { currency: string; market: string };
type Product = Money & { product_id: string; price: number };

export type AnalyticsEvents = {
  page_view: { event_target: string; market: string; non_interactive: true };
  "Product List Viewed": { list: string; filters: string; sort: string; result_count: number; market: string };
  "Products Searched": { query: string; result_count: number; market: string };
  "Product Viewed": Product & { name: string; category: string; department: string; stock_state: string; is_gift: boolean };
  "Product Added": Product & { size: string | null; qty: number };
  "Product Removed": { product_id: string; size: string | null };
  "Bag Quantity Changed": { product_id: string; size: string | null; qty: number };
  "Cart Viewed": Money & { items_count: number; value: number; has_issues: boolean };
  "Checkout Started": Money & { method: "card" | "upi"; gateway: "stripe" | "razorpay"; value: number; items: string[] };
  "Delivery Details Submitted": { state: string; city: string };
  "Payment Window Closed": { gateway: "razorpay"; order_ref: string };
  "Order Completed": Money & { order_id: string; gateway: string; method: string; total: number; items_count: number; transaction: true };
  "Payment Failed": { gateway: string; order_ref: string };
  "Order Expired": { gateway: string; order_ref: string };
  "Signed Up": { method: "email" };
  "Signed In": { method: "email" };
  "Signed Out": Record<string, never>;
  "Password Reset Requested": Record<string, never>;
  "Back In Stock Requested": { product_id: string };
  "Alert Cancelled": { product_id: string };
  "Contact Message Sent": { topic: string };
  "Market Changed": { from: string; to: string };
  "Story Read": { story: string; topic: string };
  "Account Deletion Requested": Record<string, never>;
};
export type EventName = keyof AnalyticsEvents;

/** Our integer minor units (paise, cents; yen and won have none) as the decimal amount Helo records. */
export const toMajor = (minor: number, currency: string) => minor / 10 ** currencyDigits(currency.toUpperCase());

/** Helo accepts names of 1 to 128 characters. */
export const validEventName = (name: string) => name.length >= 1 && name.length <= 128;

// Personal details only ever go to the Helo profile after consent and sign-in, never into event properties.
const PERSONAL = /^(email|e_mail|phone|mobile|contact|address|line1|line2|postal_code|message|password)$/i;

/**
 * Properties as Helo takes them: undefined dropped, personal keys removed (and reported, so a mistake shows
 * up in development instead of in Helo's data).
 */
export function cleanProps(props: Record<string, unknown>): { props: Record<string, string | number | boolean | null | string[]>; removed: string[] } {
  const out: Record<string, string | number | boolean | null | string[]> = {};
  const removed: string[] = [];
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined) continue;
    if (PERSONAL.test(k)) removed.push(k);
    else out[k] = v as string | number | boolean | null | string[];
  }
  return { props: out, removed };
}
