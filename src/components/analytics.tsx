"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useSyncExternalStore } from "react";
import { claimChargedEvent } from "@/lib/analytics-actions";
import type { AnalyticsEvents, EventName } from "@/lib/analytics-events";
import { analyticsAvailable, getConsent, identify, identityKnown, subscribeConsent, track, trackCharged, trackPageView } from "@/lib/analytics";
import { authClient } from "@/lib/auth-client";
import { MARKET_COOKIE } from "@/lib/markets";

const market = () => document.cookie.split("; ").find((c) => c.startsWith(`${MARKET_COOKIE}=`))?.split("=")[1] ?? "us";

/** True once the visitor has accepted the banner (and analytics can run here); follows later answers. */
const useConsented = () =>
  useSyncExternalStore(subscribeConsent, () => analyticsAvailable() && getConsent() === "granted", () => false);

/** Page views on every route change, and the signed-in customer's identity. Mounted once in the root layout. */
export function Analytics() {
  return (
    // useSearchParams needs a Suspense boundary, or every static page would render on the client.
    <Suspense>
      <PageViews />
    </Suspense>
  );
}

function PageViews() {
  const consented = useConsented();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const { data, isPending } = authClient.useSession();
  const user = data?.user;
  const target = search ? `${pathname}?${search}` : pathname;

  useEffect(() => {
    if (consented) trackPageView(target, market());
  }, [consented, target]);

  // The back/forward cache restores a page without running effects: count the return as a view.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) trackPageView(location.pathname + location.search, market(), true);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  useEffect(() => {
    if (!consented || isPending) return;
    if (user) identify({ id: user.id, email: user.email, name: user.name }, market());
    else identityKnown(); // signed out: the page's events can go now
  }, [consented, isPending, user]);

  return null;
}

/** One event when a server-rendered page mounts, or when its properties change on client navigation. */
export function TrackEvent<K extends EventName>({ name, properties }: { name: K; properties: AnalyticsEvents[K] }) {
  const consented = useConsented();
  const key = JSON.stringify(properties);
  const sent = useRef<string | null>(null); // effects run twice in development; the event mustn't
  useEffect(() => {
    if (!consented || sent.current === `${name}${key}`) return;
    sent.current = `${name}${key}`;
    track(name, JSON.parse(key));
  }, [consented, name, key]);
  return null;
}

/**
 * A paid order's purchase: the confirmation page, the order page and the orders list all render it, and the
 * server claim (claimChargedEvent) lets only the first of them, in any tab or device, send it.
 */
export function TrackCharged({ orderId, order, items }: { orderId: string; order: AnalyticsEvents["Order Completed"]; items: string[] }) {
  const consented = useConsented();
  const sent = useRef(false);
  const key = JSON.stringify([order, items]);
  useEffect(() => {
    if (!consented || sent.current) return;
    sent.current = true;
    const [o, i] = JSON.parse(key);
    void trackCharged(o, i, () => claimChargedEvent(orderId));
  }, [consented, orderId, key]);
  return null;
}
