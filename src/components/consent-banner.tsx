"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { CONSENT_OPEN, analyticsAvailable, getConsent, setConsent, subscribeConsent } from "@/lib/analytics";

const noSubscribe = () => () => {}; // availability never changes after load
const useAvailable = () => useSyncExternalStore(noSubscribe, analyticsAvailable, () => false);

/**
 * Asks once whether Maison may record analytics (Helo). Nothing is sent until Accept; Decline stops it.
 * Shown only where analytics can run at all, and reopened from the footer's "Cookie preferences".
 */
export function ConsentBanner() {
  const available = useAvailable();
  const unanswered = useSyncExternalStore(subscribeConsent, () => getConsent() === null, () => false);
  const [reopened, setReopened] = useState(false);
  useEffect(() => {
    const reopen = () => setReopened(true);
    window.addEventListener(CONSENT_OPEN, reopen);
    return () => window.removeEventListener(CONSENT_OPEN, reopen);
  }, []);
  if (!available || !(unanswered || reopened)) return null;

  const answer = (granted: boolean) => {
    setReopened(false);
    setConsent(granted);
  };
  return (
    <section aria-label="Cookie preferences" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper">
      <div className="container-page flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-muted">
          We use analytics to understand how Maison is used and to improve it. Nothing is recorded unless you accept.{" "}
          <Link href="/about#privacy" className="link text-ink">Privacy</Link>
        </p>
        <div className="flex shrink-0 gap-3">
          <button type="button" onClick={() => answer(false)} className="btn btn-secondary w-auto px-6">Decline</button>
          <button type="button" onClick={() => answer(true)} className="btn btn-primary w-auto px-6">Accept</button>
        </div>
      </div>
    </section>
  );
}

/** The footer link that reopens the banner, so a visitor can change their answer. */
export function CookiePreferencesLink() {
  if (!useAvailable()) return null;
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(CONSENT_OPEN))} className="link-nav cursor-pointer text-left uppercase hover:text-ink">
      Cookie preferences
    </button>
  );
}
