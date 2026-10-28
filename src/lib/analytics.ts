// Event analytics through the Helo Web SDK (helo-sdk): the only module that touches it. Browser only;
// call from client components (effects and handlers), never during render.
//
// Off (every call does nothing) when NEXT_PUBLIC_HELO_API_KEY or NEXT_PUBLIC_HELO_PROJECT_ID is unset, on
// /admin, in automated browsers (navigator.webdriver: the e2e runs) unless a test sets
// window.__HELO_TEST__, and until the visitor accepts the consent banner (cookie maison-consent=granted).
// Consent is also enforced by the SDK itself (requireConsent + optIn). Calls never throw.
import type { HeloSDK } from "helo-sdk";
import { cleanProps, validEventName, type AnalyticsEvents, type EventName } from "@/lib/analytics-events";

const API_KEY = process.env.NEXT_PUBLIC_HELO_API_KEY;
const PROJECT_ID = process.env.NEXT_PUBLIC_HELO_PROJECT_ID;
const ENVIRONMENT = process.env.NEXT_PUBLIC_HELO_ENV === "staging" ? "staging" : "production";

export const CONSENT_COOKIE = "maison-consent";
/** Fired on window when the visitor answers the banner, and to reopen it from the footer. */
export const CONSENT_CHANGED = "consent:changed";
export const CONSENT_OPEN = "consent:open";

type Consent = "granted" | "denied" | null;

export function getConsent(): Consent {
  if (typeof document === "undefined") return null;
  const v = document.cookie.split("; ").find((c) => c.startsWith(`${CONSENT_COOKIE}=`))?.split("=")[1];
  return v === "granted" || v === "denied" ? v : null;
}

/** For useSyncExternalStore: re-read consent whenever the banner is answered. */
export function subscribeConsent(onChange: () => void) {
  window.addEventListener(CONSENT_CHANGED, onChange);
  return () => window.removeEventListener(CONSENT_CHANGED, onChange);
}

/** Analytics can run here at all (configured, not admin, not an unflagged automated browser). */
export function analyticsAvailable() {
  if (!API_KEY || !PROJECT_ID || typeof window === "undefined") return false;
  if (location.pathname.startsWith("/admin")) return false;
  return !navigator.webdriver || Boolean((window as { __HELO_TEST__?: boolean }).__HELO_TEST__);
}

let sdk: Promise<HeloSDK | null> | null = null;

/** The SDK, initialised once per page load, or null when analytics is off or not consented to. */
function ready(): Promise<HeloSDK | null> | null {
  if (!analyticsAvailable() || getConsent() !== "granted") return null;
  sdk ??= import("helo-sdk")
    .then(({ HELO_SDK }) => {
      HELO_SDK.init({
        apiKey: API_KEY!,
        projectId: PROJECT_ID!,
        environment: ENVIRONMENT,
        requireConsent: true,
        captureClicks: false,
        debugLevel: process.env.NODE_ENV === "development" ? 2 : 0,
        onError: (e) => {
          if (process.env.NODE_ENV === "development" || navigator.webdriver) console.warn(`[analytics] ${e.code}: ${e.message}`);
        },
      });
      HELO_SDK.optIn(); // only reached with consent granted
      return HELO_SDK;
    })
    .catch(() => null);
  return sdk;
}

function run(fn: (s: HeloSDK) => unknown) {
  void ready()?.then((s) => {
    if (!s) return;
    try {
      void Promise.resolve(fn(s)).catch(() => {});
    } catch {
      // analytics must never break the page
    }
  });
}

export function track<K extends EventName>(name: K, properties: AnalyticsEvents[K]) {
  if (!validEventName(name)) return;
  const { props, removed } = cleanProps(properties as Record<string, unknown>);
  if (removed.length && process.env.NODE_ENV === "development") console.warn(`[analytics] ${name}: dropped personal keys ${removed.join(", ")}`);
  run((s) => (props.transaction === true ? s.trackTransaction(name, props) : s.track(name, props)));
}

/**
 * A paid order, once per order per browser (a reload of the confirmation page doesn't count it again),
 * then flushed straight away: the customer may close the tab next.
 */
export function trackCharged(order: AnalyticsEvents["Order Completed"], items: string[]) {
  const key = `helo-charged-${order.order_id}`;
  try {
    if (localStorage.getItem(key)) return;
  } catch {}
  if (!ready()) return;
  try {
    localStorage.setItem(key, "1");
  } catch {}
  run((s) => s.recordChargedEvent(order.order_id, order.total, order.currency.toUpperCase(), items));
  track("Order Completed", order);
  run((s) => s.flush());
}

let identified: string | null = null;
let identifying: Promise<unknown> | undefined; // logout waits for it: the SDK skips logout before identify lands

/** Link this browser to the signed-in customer; the SDK keeps it in memory only, so it runs on every page load. */
export function identify(user: { id: string; email: string; name: string }, market: string) {
  if (identified === user.id) return;
  identified = user.id;
  identifying = ready()
    ?.then(async (s) => {
      if (!s || !(await s.identify(user.id, { email: user.email }))) return;
      await s.setFirstName(user.name.split(" ")[0] || null);
      await s.setUserAttribute("market", market);
    })
    .catch(() => {});
}

/**
 * Tell Helo the customer signed out (new session, no customer id). Waits briefly, never blocks sign-out long.
 * ponytail: the SDK only logs out a customer identified on this page load, so a sign-out clicked before the
 * session has even loaded isn't reported; the next page load starts anonymous anyway.
 */
export async function logout() {
  identified = null;
  const s = await ready();
  if (!s) return;
  const done = Promise.resolve(identifying).then(() => s.logout()).catch(() => false);
  await Promise.race([done, new Promise((r) => setTimeout(r, 2500))]);
}

/** Store the banner answer for a year and tell the SDK; Decline stops everything. */
export function setConsent(granted: boolean) {
  document.cookie = `${CONSENT_COOKIE}=${granted ? "granted" : "denied"}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  if (!granted) void sdk?.then((s) => s?.optOut());
  else ready();
  window.dispatchEvent(new Event(CONSENT_CHANGED));
}
