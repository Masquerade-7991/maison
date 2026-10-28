"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useSyncExternalStore } from "react";
import type { AnalyticsEvents, EventName } from "@/lib/analytics-events";
import { analyticsAvailable, getConsent, identify, subscribeConsent, track, trackCharged } from "@/lib/analytics";
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
  const { data } = authClient.useSession();
  const user = data?.user;

  useEffect(() => {
    if (consented) track("page_view", { event_target: search ? `${pathname}?${search}` : pathname, market: market(), non_interactive: true });
  }, [consented, pathname, search]);

  useEffect(() => {
    if (consented && user) identify({ id: user.id, email: user.email, name: user.name }, market());
  }, [consented, user]);

  return null;
}

/** One event when a server-rendered page mounts (or its properties change on client navigation). */
export function TrackEvent<K extends EventName>({ name, properties }: { name: K; properties: AnalyticsEvents[K] }) {
  const consented = useConsented();
  const key = JSON.stringify(properties);
  useEffect(() => {
    if (consented) track(name, JSON.parse(key));
  }, [consented, name, key]);
  return null;
}

/** The purchase, from the confirmation page once the order is paid: recorded once per order. */
export function TrackCharged({ order, items }: { order: AnalyticsEvents["Order Completed"]; items: string[] }) {
  const consented = useConsented();
  const key = JSON.stringify(order);
  useEffect(() => {
    if (consented) trackCharged(JSON.parse(key), items);
  }, [consented, key, items]);
  return null;
}
