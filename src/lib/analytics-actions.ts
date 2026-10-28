"use server";

// Server Actions are public endpoints: the signed-in customer is checked here, and only their own order counts.
import { headers } from "next/headers";
import { isUuid } from "@/lib/admin-rules";
import { claimAnalyticsCharged, lastShippingFor } from "@/lib/orders";
import { getSession } from "@/lib/session";

/**
 * Mark the customer's paid order as counted in analytics. True only for the first call per order, so only
 * that browser sends Charged (src/lib/analytics.ts trackCharged).
 */
export async function claimChargedEvent(orderId: string): Promise<boolean> {
  if (typeof orderId !== "string" || !isUuid(orderId)) return false;
  const session = await getSession();
  if (!session) return false;
  return claimAnalyticsCharged(orderId, session.user.id);
}

/**
 * Profile facts the browser doesn't have, for the signed-in customer's Helo profile: the mobile number from
 * their latest delivery details (UPI checkout asks for it) and an approximate location from Vercel's
 * IP geolocation (city level; no browser permission prompt). Nulls when unknown, e.g. locally.
 */
export async function analyticsProfileFacts(): Promise<{ phone: string | null; latitude: number | null; longitude: number | null }> {
  const session = await getSession();
  if (!session) return { phone: null, latitude: null, longitude: null };
  const [shipping, h] = await Promise.all([lastShippingFor(session.user.id), headers()]);
  const coord = (name: string, limit: number) => {
    const n = Number.parseFloat(h.get(name) ?? "");
    return Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
  };
  const latitude = coord("x-vercel-ip-latitude", 90);
  const longitude = coord("x-vercel-ip-longitude", 180);
  const located = latitude !== null && longitude !== null;
  return { phone: shipping?.phone ?? null, latitude: located ? latitude : null, longitude: located ? longitude : null };
}
