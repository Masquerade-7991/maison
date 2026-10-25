// Razorpay (UPI in India) over its REST API with plain fetch: no SDK. Like Stripe, it's only needed by UPI
// checkout, its return route and its webhook; the rest of the store builds and runs without the keys.
import { createHmac, timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import { upiDeviceReady, type UpiMethods } from "@/lib/address-rules";

const API = "https://api.razorpay.com/v1";

export const razorpayConfigured = () => Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

/**
 * Which UPI flows the account has, from Razorpay's own method list (cached for an hour), or null when
 * Razorpay isn't configured or can't be reached. `upi` is the QR code a computer needs; Razorpay's support
 * switches it on (there is no Dashboard toggle). `intent` (open the UPI app) is on by default, phones only.
 * Which of them this visitor can use is upiDeviceReady() in address-rules.ts.
 */
/** Can this visitor pay by UPI right now? Gates the bag button, /checkout/upi and the checkout action. */
export async function razorpayUpiReady() {
  return upiDeviceReady((await headers()).get("user-agent") ?? "", await razorpayUpiMethods());
}

export async function razorpayUpiMethods(): Promise<UpiMethods | null> {
  if (!razorpayConfigured()) return null;
  try {
    const res = await fetch(`${API}/methods`, {
      headers: { authorization: `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:`).toString("base64")}` },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const m = await res.json();
    return { upi: m.upi === true, intent: m.upi_intent === true };
  } catch {
    return null;
  }
}

/** A payment as Razorpay reports it. `amount` and `amount_refunded` are paise; `amount_refunded` is cumulative. */
export type RazorpayPayment = {
  id: string;
  amount: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  order_id: string | null;
  amount_refunded: number;
  email: string | null;
  contact: string | null;
};

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const id = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!id || !secret) throw new Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set (Razorpay Dashboard → Settings → API Keys).");
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Razorpay ${method} ${path} ${res.status}: ${data?.error?.description ?? res.statusText}`);
  return data as T;
}

/** A Razorpay order for our order's total. The receipt is our order id, so the dashboard links back to it. */
export const createRazorpayOrder = (orderId: string, amountPaise: number) =>
  call<{ id: string; status: string }>("POST", "/orders", { amount: amountPaise, currency: "INR", receipt: orderId, notes: { order_id: orderId } });

export const fetchOrderPayments = async (razorpayOrderId: string) =>
  (await call<{ items: RazorpayPayment[] }>("GET", `/orders/${encodeURIComponent(razorpayOrderId)}/payments`)).items;

export const fetchPayment = (id: string) => call<RazorpayPayment>("GET", `/payments/${encodeURIComponent(id)}`);

function sameHmac(secret: string, payload: string, signature: string) {
  const expected = Buffer.from(createHmac("sha256", secret).update(payload).digest("hex"));
  const given = Buffer.from(signature);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** The checkout's success signature. Pass OUR stored razorpay_order_id, never the one the browser posted. */
export function verifyCheckoutSignature(razorpayOrderId: string, paymentId: string, signature: string) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  return Boolean(secret) && sameHmac(secret!, `${razorpayOrderId}|${paymentId}`, signature);
}

/** X-Razorpay-Signature over the raw body. Throws when the secret is missing (our misconfiguration, not a bad request). */
export function verifyWebhookSignature(rawBody: string, signature: string) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) throw new Error("RAZORPAY_WEBHOOK_SECRET is not set. Use the secret of the webhook in Razorpay Dashboard → Settings → Webhooks.");
  return sameHmac(secret, rawBody, signature);
}
