# Maison tracking plan (Helo)

The human-readable source for every analytics event the site sends to Helo (helo-sdk, project set by `NEXT_PUBLIC_HELO_PROJECT_ID`). The type in `src/lib/analytics-events.ts` is the machine-readable twin; `src/lib/analytics-guard.check.mjs` (`npm run check`) fails when the two list different events, or when an event is never sent.

Change an event: update the catalogue, this table and its changelog, and `scripts/e2e/analytics.e2e.mjs` together, in the same commit. The `analytics-steward` agent (`.claude/agents/analytics-steward.md`) does this work and the regular audits.

## Rules

- **Consent first.** Nothing is sent until the visitor accepts the banner; Decline stops everything and removes what the SDK stored. Admin pages and automated browsers send nothing.
- **No personal data in event properties.** No email, phone, street address or message text (`cleanProps` strips them). Email and first name go only to the Helo profile, through `identify`, after sign-in.
- **Money** is in major units (`toMajor`): ₹1,800 is `1800`, $19.50 is `19.5`, ¥17,000 is `17000`, always with `currency` (ISO 4217) and `market` (`src/lib/markets.ts` id).
- **Product ids are slugs.** Orders are referenced as `MSN-XXXXXXXX` (`orderReference`), never by the database id.
- **Client only.** Events are sent from client components and `<TrackEvent>`; server code never imports the wrapper.

## Events

| Event | When | Properties | Sent from |
|---|---|---|---|
| `page_view` | Every route change after consent, and a return from the back/forward cache. Not repeated for the same URL in a row | `event_target` (path + query), `market`, `non_interactive` | `src/components/analytics.tsx` |
| `Product List Viewed` | A listing renders (women, men, gifts, new arrivals, a collection) | `list`, `filters`, `sort`, `result_count`, `market` | `src/components/product-listing.tsx` |
| `Products Searched` | Search results render for a query | `query`, `result_count`, `market` | `src/app/[market]/search/page.tsx` |
| `Product Viewed` | A product page renders | `product_id`, `name`, `category`, `department`, `price`, `currency`, `market`, `stock_state`, `is_gift` | `src/app/[market]/products/[slug]/page.tsx` |
| `Product Added` | The server confirms an add to the bag | `product_id`, `price`, `currency`, `market`, `size`, `qty` | `src/components/add-to-bag-form.tsx` |
| `Product Removed` | A bag line is removed | `product_id`, `size` | `src/components/bag-line-controls.tsx` |
| `Bag Quantity Changed` | The server confirms a quantity change | `product_id`, `size`, `qty` | `src/components/bag-line-controls.tsx` |
| `Cart Viewed` | The bag page renders with items | `items_count`, `value`, `currency`, `market`, `has_issues` | `src/app/bag/page.tsx` |
| `Checkout Started` | "Checkout"/"Pay by card" submitted, or "Pay by UPI" chosen; flushed before leaving | `method` (`card`/`upi`), `gateway` (`stripe`/`razorpay`), `value`, `currency`, `market`, `items` | `src/components/checkout-button.tsx` |
| `Delivery Details Submitted` | The UPI delivery form is accepted | `state`, `city` | `src/components/upi-checkout-form.tsx` |
| `Payment Window Closed` | Razorpay's window is closed without paying | `gateway`, `order_ref` | `src/components/upi-checkout-form.tsx` |
| `Order Completed` | With `Charged`, once per paid order (server claim). From the order page or orders list only within 7 days of payment and not cancelled | `order_id`, `gateway`, `method`, `total`, `currency`, `market`, `items_count`, `transaction` | `src/components/analytics.tsx` (`<TrackCharged>`) |
| `Payment Failed` | The confirmation page shows a failed payment | `gateway`, `order_ref` | `src/app/checkout/success/page.tsx` |
| `Order Expired` | The confirmation page shows an expired order | `gateway`, `order_ref` | `src/app/checkout/success/page.tsx` |
| `Signed Up` | Sign-up succeeds | `method` | `src/components/auth-form.tsx` |
| `Signed In` | Sign-in succeeds | `method` | `src/components/auth-form.tsx` |
| `Signed Out` | Sign-out: sent inside `logout(user, "Signed Out")` after the customer is identified, just before the Helo logout | (none) | `src/components/sign-out-button.tsx` |
| `Password Reset Requested` | The forgot-password request is sent | (none) | `src/components/password-reset-forms.tsx` |
| `Back In Stock Requested` | "Notify me" is saved | `product_id` | `src/components/stock-alert.tsx` |
| `Alert Cancelled` | "Notify me" is undone | `product_id` | `src/components/stock-alert.tsx` |
| `Contact Message Sent` | The contact form is sent | `topic` (never the message or sender) | `src/components/contact-modal.tsx` |
| `Market Changed` | Another market is chosen in the footer; flushed before the reload | `from`, `to` | `src/components/market-selector.tsx` |
| `Story Read` | A story page renders | `story`, `topic` | `src/app/[market]/stories/[slug]/page.tsx` |
| `Account Deletion Requested` | Deletion is scheduled; then the Helo logout | (none) | `src/components/delete-account.tsx` |
| `Account Deletion Cancelled` | "Keep my account" actually cancelled a scheduled deletion | (none) | `src/components/delete-account.tsx` |

`Charged` (Helo's purchase event, `recordChargedEvent(order_id, total, currency, item slugs)`) is sent with `Order Completed` and isn't a catalogue key, because the SDK names it.

## Identity

- **Sign-in:** `identify(account id, { email })`, then `setFirstName` and the `market` attribute. The SDK keeps the customer in memory only, so this repeats on every page load while signed in.
- **Sign-out and account deletion:** `logout(user)`. If this page hadn't identified the customer yet, it identifies first, so Helo always receives the logout.
- **Another customer on the same page:** `reset()`, then identify.

## Funnels

- **Purchase:** `Product Viewed` → `Product Added` → `Cart Viewed` → `Checkout Started` → `Charged`, split by `gateway` and `market`.
- **UPI:** `Checkout Started` (method `upi`) → `Delivery Details Submitted` → `Charged`. `Payment Window Closed` marks the drop-off.
- **Discovery:** `Product List Viewed` / `Products Searched` / `Story Read` → `Product Viewed`.

## Known limits

- The SDK has no server API, so `Charged` comes from the browser: the confirmation page, the order page or the orders list, whichever loads first after payment. A customer who never comes back after paying, or never consents, isn't counted. Fixing that needs a server-side events endpoint from Helo.
- A visitor who declines is invisible to analytics, by design.

## Changelog

- **2026-10-28 (audit fixes):** Decline keeps wiping what the live SDK re-saves, and unconsented loads wipe before anything starts. Purchases are claimed only by a working SDK, a failed claim stays claimable, late purchases are limited to 7 days and never cancelled, and the orders list sends item slugs. "Signed Out" is sent from `logout()` after identifying. "Account Deletion Cancelled" fires only when one was cancelled. The person-name keys are blocked, and the privacy note now covers search terms and the UPI city and state.
- **2026-10-28:** First release: 25 events. Purchases are claimed server-side (`orders.analytics_charged_at`). The race fixes cover identify/logout ordering, account switches, consent across tabs, Decline wiping SDK storage, back/forward cache, dev double effects, and flushing before checkout and market changes.
