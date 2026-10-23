// Email rules with no I/O: threading, carrier tracking links, and which addresses never get real mail.
// Pure, so src/lib/emails/rules.check.mjs runs it directly in Node.

/** Every email about one order shares this subject: Gmail only threads messages whose subjects match. */
export const orderSubject = (reference: string) => `Your Maison order ${reference}`;

/**
 * Thread headers for an order email. The confirmation has a fixed Message-ID; every later email about the
 * same order replies to it, so mail apps that thread by References (Apple Mail, Outlook) and by subject
 * (Gmail) show confirmed → shipped → delivered as one conversation. Later emails get a unique id each:
 * a repeated Message-ID (a second refund, a resend) is dropped as a duplicate by some providers, Gmail
 * included, so a resent confirmation replies to the original instead of reusing its id.
 */
export function orderThreadHeaders(orderId: string, kind: string, host: string, resend = false, unique = `${Date.now()}`): Record<string, string> {
  const domain = host.replace(/:\d+$/, ""); // "localhost:3100" isn't a valid Message-ID domain
  const root = `<order.${orderId}.confirmed@${domain}>`;
  if (kind === "confirmed" && !resend) return { "Message-ID": root };
  return { "Message-ID": `<order.${orderId}.${kind}.${unique}@${domain}>`, "In-Reply-To": root, References: root };
}

// Public tracking pages that take the number in the URL. Matched loosely on the admin's free-text carrier.
const CARRIERS: [RegExp, (n: string) => string][] = [
  [/\bups\b/i, (n) => `https://www.ups.com/track?tracknum=${n}`],
  [/fed\s?ex/i, (n) => `https://www.fedex.com/fedextrack/?trknbr=${n}`],
  [/\bdhl\b/i, (n) => `https://www.dhl.com/global-en/home/tracking/tracking-express.html?tracking-id=${n}`],
  [/\busps\b|postal service/i, (n) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`],
  [/royal\s?mail/i, (n) => `https://www.royalmail.com/track-your-item#/tracking-results/${n}`],
  [/japan\s?post/i, (n) => `https://trackings.post.japanpost.jp/services/srv/search/direct?reqCodeNo1=${n}&locale=en`],
  [/india\s?post/i, (n) => `https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx?consignment=${n}`],
  [/blue\s?dart/i, (n) => `https://www.bluedart.com/web/guest/trackdartresultthirdparty?trackFor=0&trackNo=${n}`],
  [/australia\s?post|auspost/i, (n) => `https://auspost.com.au/mypost/track/details/${n}`],
  [/canada\s?post/i, (n) => `https://www.canadapost-postescanada.ca/track-reperage/en#/search?searchFor=${n}`],
];

/** A tracking page for a known carrier, or null (the email then shows the number only). */
export function trackingUrl(carrier: string | null | undefined, number: string | null | undefined): string | null {
  if (!carrier || !number) return null;
  const hit = CARRIERS.find(([re]) => re.test(carrier));
  return hit ? hit[1](encodeURIComponent(number.trim())) : null;
}

/**
 * Addresses that never receive real mail: the e2e accounts (qa.…@example.com) and the RFC 2606 example
 * domains. Mailing them only bounces, and bounces get a new sending address flagged as spam.
 */
export const isSuppressed = (address: string) => /@(?:[\w-]+\.)*example\.(?:com|org|net)$/i.test(address.trim());

/**
 * Worth sending again? Gmail answers a burst from a new mailbox with "421 4.4.5 Server busy, try again
 * later", and networks drop connections. A wrong password or a refused address (5xx) is final.
 */
export function isTransient(e: unknown) {
  const err = e as { responseCode?: number; code?: string; message?: string };
  if (err.responseCode) return err.responseCode >= 400 && err.responseCode < 500;
  return ["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "ECONNRESET"].includes(err.code ?? "") || /greeting|try again/i.test(err.message ?? "");
}

/** The bare address out of `Name <address>` (or the string itself). */
export const addressOf = (from: string) => from.match(/<([^>]+)>/)?.[1] ?? from.trim();
