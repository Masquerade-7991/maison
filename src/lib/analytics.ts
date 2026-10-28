// Event analytics through the Helo Web SDK (helo-sdk): the only module that touches it. Browser only;
// call from client components (effects and handlers), never during render.
//
// Off (every call does nothing) when NEXT_PUBLIC_HELO_API_KEY or NEXT_PUBLIC_HELO_PROJECT_ID is unset, on
// /admin, in automated browsers (navigator.webdriver: the e2e runs) unless a test sets
// window.__HELO_TEST__, and until the visitor accepts the consent banner (cookie maison-consent=granted).
// Consent is also enforced by the SDK itself (requireConsent + optIn). Calls never throw.
//
// Race rules (see CLAUDE.md, Analytics): identity steps carry a generation and stop once a logout, reset or
// Decline bumps it; logout waits for a pending identify, and identifies first if this page never did (the
// SDK only logs out a customer it identified on this page load); a different customer resets first; a
// purchase is claimed on the server before Charged is sent, so tabs, devices and reloads count it once.
import type { HeloSDK } from "helo-sdk";
import { cleanProps, validEventName, type AnalyticsEvents, type EventName } from "@/lib/analytics-events";

const API_KEY = process.env.NEXT_PUBLIC_HELO_API_KEY;
const PROJECT_ID = process.env.NEXT_PUBLIC_HELO_PROJECT_ID;
const ENVIRONMENT = process.env.NEXT_PUBLIC_HELO_ENV === "staging" ? "staging" : "production";

export const CONSENT_COOKIE = "maison-consent";
/** Fired on window when the visitor answers the banner (in this tab or another), and to reopen it. */
export const CONSENT_CHANGED = "consent:changed";
export const CONSENT_OPEN = "consent:open";
// Written on every answer so other open tabs hear it (a cookie change fires no event).
const CONSENT_SYNC = "maison-consent-sync";
// What the SDK keeps in the browser; removed on Decline.
const SDK_STORAGE = ["helo_sdk_offline_queue:", "helo_sdk_pending_writes:", "helo_anonymous_id"];
// Set before the reload that follows Accept-after-Decline: the next load wipes what the old page saved.
const WIPE_ON_LOAD = "maison-helo-wipe";

type Consent = "granted" | "denied" | null;
type User = { id: string; email: string; name: string };

export function getConsent(): Consent {
  if (typeof document === "undefined") return null;
  const v = document.cookie.split("; ").find((c) => c.startsWith(`${CONSENT_COOKIE}=`))?.split("=")[1];
  return v === "granted" || v === "denied" ? v : null;
}

/** For useSyncExternalStore: re-read consent whenever the banner is answered, here or in another tab. */
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
let declinedLive = false; // Decline after this page started the SDK: its memory still holds earlier events

/** The SDK, initialised once per page load, or null when analytics is off or not consented to. */
function ready(): Promise<HeloSDK | null> | null {
  if (!analyticsAvailable() || getConsent() !== "granted" || declinedLive) return null;
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

// Events wait (at most IDENTITY_WAIT_MS) until the page knows who is signed in: the SDK stamps each event
// with the customer it knows at that moment, and on a fresh page load identify() only lands after the first
// page view, which would leave a signed-in customer's events "unknown". Released by identify() once Helo
// acknowledges the customer, or by identityKnown() when nobody is signed in.
const IDENTITY_WAIT_MS = 8000; // a cold session check on the server can take several seconds
let releaseIdentity: () => void = () => {};
let identityGate = new Promise<void>((r) => (releaseIdentity = r));
const identityResolved = () => Promise.race([identityGate, new Promise<void>((r) => setTimeout(r, IDENTITY_WAIT_MS))]);

// The customer this browser last identified, so the next page load identifies at once instead of waiting
// for the server's session check (slow when cold). The session check still confirms or corrects it.
const KNOWN_CUSTOMER = "maison-helo-customer";

function rememberCustomer(user: User | null) {
  try {
    if (user) localStorage.setItem(KNOWN_CUSTOMER, JSON.stringify({ id: user.id, email: user.email, name: user.name }));
    else localStorage.removeItem(KNOWN_CUSTOMER);
  } catch {}
}

/** Who this browser last identified, if anyone (cleared on sign-out and Decline). */
export function rememberedCustomer(): User | null {
  try {
    const u = JSON.parse(localStorage.getItem(KNOWN_CUSTOMER) ?? "null");
    return u && typeof u.id === "string" && typeof u.email === "string" ? { id: u.id, email: u.email, name: String(u.name ?? "") } : null;
  } catch {
    return null;
  }
}

/** Nobody is signed in on this page (the session check finished): events needn't wait. */
export function identityKnown() {
  releaseIdentity();
}

function run(fn: (s: HeloSDK) => unknown) {
  void ready()?.then(async (s) => {
    if (!s) return;
    await identityResolved();
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

/** Send what's queued now: before a redirect or reload that could lose it (the SDK also flushes on pagehide). */
export function flushNow() {
  run((s) => s.flush());
}

let lastView: string | null = null;

/** One page view per distinct URL in a row: effects that run twice (dev) or re-render don't repeat it. */
export function trackPageView(target: string, market: string, force = false) {
  if (!force && lastView === target) return;
  if (!ready()) return;
  lastView = target;
  track("page_view", { event_target: target, market, non_interactive: true });
}

/**
 * A paid order. `claim` asks the server to mark it counted (orders.analytics_charged_at): only the first
 * browser to claim sends Charged, so two tabs, a second device or a reload never count it twice. The local
 * key only saves a round trip. Then flushed straight away: the customer may close the tab next.
 */
export async function trackCharged(order: AnalyticsEvents["Order Completed"], items: string[], claim: () => Promise<boolean>) {
  const key = `helo-charged-${order.order_id}`;
  try {
    if (localStorage.getItem(key)) return;
  } catch {}
  // Only claim with a working SDK (consented, initialised): a claim used up without sending loses the purchase.
  if (!(await ready())) return;
  const mine = await claim().catch(() => null);
  if (mine === null) return; // the request failed: another page or visit may claim it
  try {
    localStorage.setItem(key, "1");
  } catch {}
  if (!mine) return;
  run((s) => s.recordChargedEvent(order.order_id, order.total, order.currency.toUpperCase(), items));
  track("Order Completed", order);
  flushNow();
}

let generation = 0; // bumped by logout, reset and Decline: identity steps from before it stop
let requested: string | null = null; // the customer identify() was last asked for on this page
let confirmed: string | null = null; // the customer the SDK acknowledged on this page
let signedOut: string | null = null; // just signed out here: a late session read mustn't re-identify them
let identifying: Promise<unknown> = Promise.resolve();

/** Link this browser to the signed-in customer; the SDK keeps it in memory only, so it runs on every page load. */
export function identify(user: User, market: string) {
  if (requested === user.id || signedOut === user.id) return;
  requested = user.id;
  const gen = generation;
  identifying = identifying
    .then(async () => {
      const s = await ready();
      if (!s || gen !== generation) return;
      // Another customer on this page (account switch without a reload): start clean, or the SDK refuses.
      if (confirmed && confirmed !== user.id) {
        await s.reset();
        confirmed = null;
      }
      if (gen !== generation || !(await s.identify(user.id, { email: user.email }))) {
        if (gen === generation) requested = null; // failed: a later page view may try again
        return;
      }
      confirmed = user.id;
      rememberCustomer(user);
      releaseIdentity(); // the waiting events now carry the customer
      if (gen !== generation) return;
      await s.setFirstName(user.name.split(" ")[0] || null);
      if (gen === generation) await s.setUserAttribute("market", market);
    })
    .catch(() => {})
    .finally(() => releaseIdentity()); // failed or superseded: don't hold events any longer
}

/** A successful sign-in on this page lifts the guard left by an earlier sign-out. */
export function signedIn() {
  signedOut = null;
  // The next events wait for this customer's identify, as on a fresh page load.
  identityGate = new Promise<void>((r) => (releaseIdentity = r));
}

/**
 * Tell Helo the customer signed out (new session, no customer id). `user` is who is signing out: if this page
 * never identified them (sign-out clicked before the session loaded), they're identified first so the logout
 * reaches Helo. `event` ("Signed Out") is sent as theirs just before. Waits at most 2.5 seconds.
 */
export async function logout(user?: User | null, event?: "Signed Out") {
  generation++;
  rememberCustomer(null);
  signedOut = user?.id ?? confirmed ?? requested;
  requested = null;
  const s = await ready();
  if (!s) return;
  const work = identifying
    .then(async () => {
      if (!confirmed && user && (await s.identify(user.id, { email: user.email }))) confirmed = user.id;
      if (event) s.track(event, {}); // after identifying, so it belongs to the customer; logout flushes it
      if (confirmed) await s.logout();
      confirmed = null;
    })
    .catch(() => {});
  identifying = work;
  await Promise.race([work, new Promise((r) => setTimeout(r, 2500))]);
}

/** Remove everything the SDK stored in this browser: its offline queues and the anonymous id. */
function wipeSdkStorage() {
  try {
    for (const k of Object.keys(localStorage)) if (SDK_STORAGE.some((p) => k.startsWith(p))) localStorage.removeItem(k);
  } catch {}
  document.cookie = "helo_anonymous_id=; path=/; max-age=0";
}

/** Apply an answer given in this tab or another: Decline stops the SDK and removes what it stored. */
function applyConsent(granted: boolean) {
  if (granted) {
    // The SDK on this page still holds events from before a Decline; a fresh page load starts clean.
    if (declinedLive) {
      try {
        sessionStorage.setItem(WIPE_ON_LOAD, "1");
      } catch {}
      location.reload();
    }
    else ready();
  } else {
    generation++;
    requested = confirmed = null;
    rememberCustomer(null);
    lastView = null;
    if (sdk && !declinedLive) {
      declinedLive = true;
      void sdk.then((s) => s?.optOut());
      // optOut() only stops sending: the SDK still saves its in-memory queue to storage on its 10-second
      // timer and when the page hides. Wipe after each (these listeners run after the SDK's own).
      window.addEventListener("pagehide", wipeSdkStorage);
      document.addEventListener("visibilitychange", wipeSdkStorage);
      setInterval(wipeSdkStorage, 5000);
    }
    wipeSdkStorage();
  }
  window.dispatchEvent(new Event(CONSENT_CHANGED));
}

/** Store the banner answer for a year, tell the SDK, and tell the visitor's other open tabs. */
export function setConsent(granted: boolean) {
  document.cookie = `${CONSENT_COOKIE}=${granted ? "granted" : "denied"}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  try {
    localStorage.setItem(CONSENT_SYNC, `${granted ? "granted" : "denied"}:${Date.now()}`);
  } catch {}
  applyConsent(granted);
}

/**
 * A page restored from the back/forward cache, or a tab coming back, missed storage events: if the visitor
 * declined meanwhile (in another tab) while this page's SDK runs, stop it now.
 */
function resyncConsent() {
  if (sdk && !declinedLive && getConsent() !== "granted") applyConsent(false);
}

if (typeof window !== "undefined") {
  // Before any SDK starts: nothing may survive from a page that declined, or wasn't consented to.
  let wipe = getConsent() !== "granted";
  try {
    wipe ||= sessionStorage.getItem(WIPE_ON_LOAD) === "1";
    sessionStorage.removeItem(WIPE_ON_LOAD);
  } catch {}
  if (wipe) wipeSdkStorage();
  // Leaving before identity resolved: let the held events into the SDK (it saves them as the page goes),
  // unattributed rather than lost.
  window.addEventListener("pagehide", () => releaseIdentity());
  window.addEventListener("storage", (e) => {
    if (e.key === CONSENT_SYNC && e.newValue) applyConsent(e.newValue.startsWith("granted"));
  });
  window.addEventListener("pageshow", (e) => e.persisted && resyncConsent());
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && resyncConsent());
}
