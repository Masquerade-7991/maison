# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev          # Next dev server (it rewrites the agent rules block in AGENTS.md; commit that block with your work)
npm run build        # Production build, and the only full typecheck
npm run lint
npm run check        # every src/**/*.check.mjs: the pure rules and the admin guard

npm run db:generate  # SQL migration from src/db/schema.ts into drizzle/ (read it before applying)
npm run db:migrate
npm run db:push      # dev escape hatch only, no migration file
npm run db:studio
npm run db:seed      # wipes and rewrites the live catalogue, see Database
npm run auth:set-role -- <email> <customer|admin>
```

pnpm only: `pnpm add`, never `npm install` (`packageManager` pins pnpm). pnpm refuses to run anything unless `allowBuilds` in `pnpm-workspace.yaml` holds real `true`/`false` values. `npm run <script>` still works.

Env lives in `.env` (from `.env.example`). You can't read or write `.env` (permissions), so the user pastes secrets. `BETTER_AUTH_URL` must be the app's exact origin or verification links break. Stripe needs a restricted `rk_` key with *Checkout Sessions: write*; locally the webhook secret comes from `stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired,charge.refunded --forward-to localhost:3000/api/stripe/webhook` (current CLIs refuse to start without `--events`; the secret is stable per machine, see `stripe listen --print-secret`). The storefront builds and runs without Stripe or email settings; only checkout, the webhook and email need them. Email is SMTP from the shop's own Gmail: `SMTP_URL` (`smtps://<address, @ as %40>:<app password>@smtp.gmail.com:465`) and `EMAIL_FROM` (`Maison <address>`). `CONTACT_TO` is the business inbox: contact messages, new-order alerts and the Reply-To on customer emails (optional; unset means the server log).

## Verification

There is no test runner.

- `npm run check`: the pure rules, run by Node 23+ (which strips TS types). That's why pure modules import each other as `./x.ts` and `tsconfig.json` sets `allowImportingTsExtensions`.
- `npm run check:payment` and `npm run e2e:checkout | e2e:customer-flow | e2e:password-reset | e2e:contact | e2e:admin-stock | e2e:admin-flow | e2e:markets | e2e:alerts | e2e:account-deletion | e2e:upi | e2e:analytics` work on the shared production database and clean up after themselves. Test accounts are always `qa.…@example.com` and test products `qa-…`.
- The e2e runs drive an installed Edge through `playwright-core` (`BROWSER_CHANNEL=chrome` for Chrome) against `npm run build` then `EMAIL_OFF=true EMAIL_LINKS_ON_PAGE=true BETTER_AUTH_URL=http://localhost:3100 npx next start -p 3100` (`EMAIL_OFF` keeps a local `SMTP_URL` from sending). Set `BASE=<url>` to target another server, such as the live site. Production mode allows 3 sign ups a minute, so leave a minute between runs. `e2e:customer-flow` needs `chain-shoulder-bag` to have 2 to 9 in stock.
- After an interrupted run: `npx tsx scripts/e2e/db.mts cleanup:stale` lists leftover test accounts, and `cleanup <email…>` removes them and puts their paid stock back.

## Architecture

Next.js 16 App Router, React 19, Tailwind v4 (PostCSS plugin only, no `tailwind.config`; the theme lives in `src/app/globals.css`), TypeScript strict, `@/*` → `src/*`.

### Database

**One environment, by choice.** Local dev, migrations, seeding, the tests and the deployed test site all use Neon project `flat-frost-80736700`, branch **`production`**. The repo is linked through the gitignored `.neon`; link with `--no-env-pull`, because the default pull writes into `.env`. Get the URL with `neon connection-string production --pooled`: it must be the **pooled** string, and `npm run build` needs it too (product pages prebuild from the database). `db:seed` wipes and rewrites the live catalogue and empties every bag, so stop using it once real data matters, or seed a throwaway branch instead.

- `drizzle-orm/neon-http` has **no interactive transactions**: anything that must be atomic is one `db.batch()` or one SQL statement with CTEs.
- `casing: "snake_case"` must be set in **both** `drizzle.config.ts` and the `drizzle()` call, or migrations and queries disagree on column names.
- `src/db/schema.ts` is the single schema file; every application table goes there. Application tables use `uuid` keys, and `slug` is the public identifier routes and React keys use.
- The Better Auth block in the schema is CLI output kept verbatim; renaming its columns breaks auth. To change it, run `npx auth@<better-auth version> generate --config src/lib/auth.ts --output <scratch file>` and paste the result in (the old `@better-auth/cli` stopped at 1.4). Never point `--output` at `schema.ts`: it overwrites the catalogue.
- Drizzle relational queries: write the `with` block inline at each call site (a shared `as const` config breaks result inference); raw subqueries inside `extras`/`orderBy` need their own alias (`from products p2`); type the `extras` parameter as `{ col: AnyColumn }`.

### Catalogue

- **Money is integer minor units, and the catalogue is priced in USD.** `products.price_cents` is the master US price admins edit. Each visitor sees it in their **market** (`src/lib/markets.ts`: a currency, the countries it delivers to, a fallback rate): `mapProduct()` in `src/lib/products.ts` and `getBag()` in `src/lib/cart.ts` are the only places a USD price becomes a local one, both through `localPrice()`/`localPair()`. Dollar markets keep the exact stored price; every other currency is converted at the `fx_rates` rate and rounded by `pricePoint()` (`src/lib/pricing.ts`, two significant figures, whole units: ₹6,400, ¥17,000), so pages, bag, checkout and Stripe all agree. Format every amount with `formatMoney(minor, currency)` from `src/lib/format.ts` (it knows JPY and KRW have no minor unit and writes INR as ₹1,10,000).
- **Markets and the proxy.** `src/proxy.ts` picks the market (the footer choice in the `market-choice` cookie, else Vercel's `x-vercel-ip-country`, else International/US) and rewrites storefront URLs to `src/app/[market]/…`, so `/women` serves `/in/women` to India without the market ever showing in a URL; each market's pages cache separately and only `us` is pre-built. Routes outside `[market]` (bag, account, admin, auth, about, contact, checkout) are listed in `OUTSIDE` in the proxy and read the market from the `x-maison-market` header through `getMarket()` (`src/lib/market-server.ts`); the proxy always overwrites that header, and nothing trusts the display-only `market` cookie. A new top-level route that isn't a storefront page must be added to `OUTSIDE`. Locally there is no country header, so you get the US market; tests send `x-vercel-ip-country` themselves.
- **Exchange rates** live in `fx_rates` (units per USD), refreshed on weekdays by Vercel Cron calling `/api/cron/fx` (`src/lib/fx.ts`, ECB rates from api.frankfurter.dev). It needs `CRON_SECRET` set, refuses everyone without it, keeps the old rate when the fetch fails or a rate moves more than 10% in a day, and revalidates the cached pages after an update. AED is pegged in code; a currency with no row uses its market's `fallbackRate`.
- **Stock is a quantity plus a `madeToOrder` flag, never a stored state.** `stockState()` in `src/lib/stock.ts` is the only place it becomes a state, and every surface uses it. Made to order with pieces on hand counts as in stock, never "Only N left", because the bag allows 10 of it.
- **Stock is per product.** Sizes are a display list per category from `categoryDetails` in `src/lib/sample-data.ts`, not stocked; a category created in the admin is one size until that file lists it.
- "New", the homepage order and category piece counts are all derived (from `createdAt` and counts), never stored.
- `product_images.alt` belongs to the row, not the image (the same URL is reused with different copy). Position 0 is the packshot.
- Pages never touch `db` directly; they call `src/lib/products.ts`. Listing filters run in memory over one view: a deliberate ceiling, move them into SQL once a view holds a few hundred products.
- Categories are product types; department (`women`/`men`/`unisex`) is an enum and `isGift` a flag.
- Admin image URLs must be on `images.unsplash.com`, the only host `next.config.ts` allows. `next/image` uses a custom loader (`src/lib/image-loader.ts`) that asks Unsplash's own CDN for the size and format, so images skip Vercel's optimizer.
- "Notify me when it's back" on sold-out product pages is for signed-in customers (`src/components/stock-alert.tsx`, `stockAlertAction`, the `stock_alerts` table). `src/lib/alerts.ts` owns that table: after every admin product or stock save, `sendBackInStock()` runs in `after()` and, if the product is buyable, claims the waiting alerts (sets `notified_at`) in the same statement that reads them, so each request is emailed once. Each email carries a signed one-click stop link (`/api/alerts/stop`). A stock change made outside the admin (the test helper, SQL) sends nothing.

### Contact and About

- `/contact` opens the contact form in a native `<dialog>`. `sendContactAction` (`src/lib/contact-actions.ts`) is a public Server Action: `parseContactForm` (`contact-rules.ts`) validates every field, a hidden `website` trap field is thanked but never sent, and **nothing is stored**. It mails `CONTACT_TO` through `sendEmail`; without `CONTACT_TO`, or while email is off, the message goes to the server log. The form has no rate limiting yet (add it if spam appears).
- React 19 resets a form after its action and restores inputs from `defaultValue`, but not a `<select>`: key a select on each server reply (as the contact topic does) or it silently falls back to its first option.
- `/about` is a static editorial page with an invented brand story, and `/stories` is the house journal in the same voice: its stories live in code (`src/lib/stories.ts`), each page is static, and "Shop the story" reads live products by slug (a missing slug just drops out). Only these two use the serif (Cormorant Garamond, light only, `serif` from `src/lib/serif.ts`, files in `src/fonts/`); everywhere else stays in Geist (self-hosted through the `geist` package). Don't add fonts through `next/font/google`: Turbopack fails the Vercel build when Google returns font URLs containing `&` (vercel/next.js#99114), even though local builds pass. The `reveal` utility in `globals.css` fades blocks in with scroll driven CSS and does nothing under reduced motion. Every `next/image` `fill` image also gets a scroll-driven parallax drift from one unlayered rule in `globals.css` (`img[data-nimg="fill"]`); it needs the image's frame to be `overflow: clip`, never `hidden` (a hidden frame is a scroll container, so `view()` would track it instead of the page). The rule sets that itself; don't override it, and use `fill` for new images to get the effect.

### Caching

The homepage differs by region: `src/lib/home-variants.ts` holds six variants (India and International keep the default "Quiet Season"; US/CA, UK/EU/CH, JP/KR/HK, AU/SG and AE each get their own hero, section order and hand-picked pieces), written for the current season, so seasonal and campaign changes are edits there. Featured rows list backups: the first 8 pieces in stock show, or 4. Only the home page, product pages and story pages are static, per market (ISR, `revalidate = 300`); every listing reads `searchParams` and renders per request. Every admin catalogue write and every paid order calls `revalidatePath("/", "layout")`. Next throws on that during a page render, so there it is swallowed and the webhook covers it. Keep `headers()` out of the root layout, or the static routes turn dynamic. `/api/bag/count` answers 0 without a database read when there is no session cookie. That's why the header's "Bag (n)" is `BagLink`, a client component that fetches `/api/bag/count` after load, on every navigation, and on the `bag:changed` window event (`announceBagChange()` in `cart-rules.ts`); anything new that changes the bag must fire that event.

### Auth and access

- Sign in, sign up and sign out run from client components through `auth-client` and `/api/auth/[...all]`, **not** Server Actions calling `auth.api.*`: Better Auth's rate limiting only runs in its HTTP router. Rate limits are stored in Postgres and apply in production only.
- Email verification is required. Email is "off" when `EMAIL_OFF=true`, or `SMTP_URL` is missing **and** the app is in development or has `EMAIL_LINKS_ON_PAGE=true`: emails only go to the server log, the verification link shows on the page (so anyone can verify any unverified address; with email on it still shows for `example.com` test addresses only, which are never mailed), and the pages stop promising receipts. In production without that switch, a missing key throws. Never set it for a real launch.
- **Password reset links are never shown on a page**, not even with `EMAIL_LINKS_ON_PAGE`: that would let anyone reset any account, admins included. While email is off they only reach the server log. A reset link works once, expires in an hour, and saving the new password signs the account out everywhere; the forgot password reply is the same whether or not the account exists.
- Server code reads the session only through `src/lib/session.ts`. Every protected page calls `requireUser`/`requireAdmin`, and every admin Server Action and admin data function (`src/lib/admin-*.ts`, `src/lib/users.ts`) starts with `await assertAdmin()`. Never rely on a layout for access: layouts don't render again on client navigation. `src/app/admin/admin-guard.check.mjs` enforces this. Customers get a plain 404 from admin routes.
- `src/proxy.ts` matches everything except `/api/**`, `/_next/**` and files with an extension. Keep `/api/**` out of it: Stripe sends no cookie.
- `user.role` has `input: false`. Only `auth:set-role` (how the first admin is made; it refuses unverified emails) and `/admin/accounts` change it. An admin can't change their own role, and a role change deletes that user's sessions. `?next=` redirects go through `safeNext()`.

### Account deletion

Customers delete their own account from `/account` (`src/components/delete-account.tsx`): a separate red section, then a `<dialog>` that only enables "Delete my account" once the account's email is typed (Enter submits), and says deletion completes automatically within 14 days. `src/lib/account-deletion.ts` owns `account_deletions`:

- **Requesting** stores `scheduled_for` (now + `DELETION_DAYS`), deletes every session (signed out everywhere) and emails the date. Refused for admins (an admin could lock the shop out) and while an order is in progress (pending, processing, or paid and not yet delivered or cancelled).
- **Signing back in** shows a banner with the date and "Keep my account" (`cancelDeletion`, emailed). Signing in alone doesn't cancel.
- **Completing** runs nightly (`/api/cron/account-deletions`, `CRON_SECRET`): accounts without orders are deleted (sessions, logins, bag, alerts cascade); accounts with orders are **anonymised** (`orders.user_id` is `restrict`): the user row becomes "Deleted customer" at `deleted-<id>@deleted.invalid` with no login, and its orders keep amounts and items but lose `customer_email`, `shipping_name` and `shipping_address`. Their `email_log` rows and reset tokens go too. An account whose order is still in progress is skipped until it settles. The goodbye email is sent first.

### Bag

Database backed and signed in only: no guest bag, nothing to merge at sign in. The browser only ever sends a slug, a size and a quantity; prices and stock are read live on every render and every action. `src/lib/cart.ts` is the only module that touches `cart_items`; the rules live in `src/lib/cart-rules.ts` so client code can import them. There is no reservation: the bag never changes on read, a stock drop shows as a notice, and checkout checks again.

### Checkout and payments

Stripe hosted Checkout Sessions, test mode account "Maison sandbox".

- **The browser never supplies an amount.** The checkout action takes no form fields: it reads the bag again, snapshots it into a pending order at our prices, and builds the session's `price_data` from that snapshot. There are no Stripe Products or Prices. Never pass `payment_method_types`, keep `integration_identifier`. The session is in the bag's market currency and `allowed_countries` is that market's countries, so a visitor can't pay one market's prices and ship elsewhere. The order stores `currency`, `market` and `usd_rate`; every `*_cents` column on orders and order items is minor units of `orders.currency`. A session whose currency differs from its order's is never applied. Tax is off. Keep Stripe **Adaptive Pricing off**, or Stripe re-converts our local prices.
- Sessions last 35 minutes, which is also the accepted oversell window (no stock reservation). Stripe refuses an `expires_at` under 30 minutes by *its* clock, so the 5 minutes of slack keep a slow server clock from failing every checkout.
- **The hosted page is branded from code.** `checkoutAppearance()` (`src/lib/stripe-branding.ts`) is spread into every session: white page, black button, square borders, Inter (the closest Checkout font to Geist), the tracked wordmark and the custom copy. The page renders on Stripe's domain, so only its Branding Settings fields can carry the design across, and the logo is sent only for an `https` origin because Stripe fetches that URL itself. A custom checkout domain is a Stripe Dashboard setting.
- **Orders move forward only on facts from Stripe:** the signature verified webhook, or a server side `sessions.retrieve` with `expand: ["payment_intent"]` (success page, order page, checkout sweep) as the fallback when a webhook is late or lost. The expanded PaymentIntent is how a failed delayed payment is detected without its webhook. The `session_id` in the success URL is only a lookup key. Transitions come from `nextStatus()` and only move forward.
- **Each transition is one SQL statement guarded by the current status.** The paid one also decrements stock, flags an oversell and clears the paid bag lines in that same statement, with the order row locked first. That is what makes duplicate, concurrent and retried deliveries harmless; there is no event table. A call that loses a race applies again once from the winner's status, because a webhook answered 200 is never redelivered.
- The checkout action closes the customer's older sessions first and **fails closed**: any Stripe error there stops checkout, because that session may still be payable. Only `resource_missing` (the session can't exist for this key) expires the order and continues.
- The webhook answers 500 on a database error or missing configuration, so Stripe retries.
- **Order history is immutable:** `order_items` snapshot name, slug, size and price; `order_items.product_id` is `set null`; `orders.user_id` is `restrict`. Customer pages use `getOrderForUser`; `getOrder` has no ownership check (admin and email only).
- Fulfilment (`unfulfilled → shipped → delivered`, or `cancelled`) is separate from payment status, admin only, and only for paid orders. Order emails go only after the guarded update wins, and sending never throws.
- **Refunds are issued in the Stripe Dashboard, never in the app** (the key stays Checkout only), and recorded from the `charge.refunded` webhook. Known gaps: a refund that later fails still counts, and nothing restocks automatically.

### UPI (Razorpay, India only)

The second gateway: India visitors choose "Pay by card" (Stripe) or "Pay by UPI" (Razorpay Standard Checkout, UPI only). Razorpay collects no address, so `/checkout/upi` asks for it (`src/lib/address-rules.ts`, stored in Stripe's address shape plus `phone`), then `startUpiCheckoutAction` snapshots the bag into a pending order with `provider = 'razorpay'` and a Razorpay order for exactly its total. `src/lib/razorpay.ts` is plain fetch, no SDK.

- **The same rules as Stripe:** orders move only on facts from Razorpay (the signed webhook `/api/razorpay/webhook`, or `syncRazorpayOrder` fetching the order's payments from the return route `/api/razorpay/return`, the success and order pages, the next checkout and the daily `/api/cron/payments`). `applyRazorpayPayment` applies only a captured payment for our stored `razorpay_order_id`, in INR, for exactly `subtotal_cents`, through the same guarded statement as Stripe (`applyPaymentFact`). A failed UPI attempt changes nothing (the customer can retry in their app); with no captured payment the order expires after `SESSION_MINUTES`. A payment captured for an expired or already-paid order emails `CONTACT_TO` to refund it. Refunds are issued in Razorpay's Dashboard and recorded from `refund.processed`.
- **Which visitors see UPI:** `razorpayUpiReady()` = India, ₹1,00,000 or less (the UPI cap), and `upiDeviceReady()` over Razorpay's own `/v1/methods` (cached an hour): the QR code (`upi`) works on any device, but **Razorpay's support switches it on, there is no Dashboard toggle**; intent (`upi_intent`, on by default) only works on phones. Typing a UPI ID ("collect") ended on 28 Feb 2026. Without either, Razorpay's window says "No appropriate payment method found", so the button is hidden instead.
- **Testing:** `e2e:upi` runs as an Android phone (intent), creates a real Razorpay test order, then pays it with a `payment.captured` webhook signed with `RAZORPAY_WEBHOOK_SECRET`, because Razorpay's window can't finish UPI in an automated browser. Once QR is enabled, Razorpay's test UPI IDs `success@razorpay` / `failure@razorpay` work in its window; real intent needs live keys and a real phone.

### Email

Every email is built in `src/lib/emails/`: `layout.ts` is the one frame (inline-styled tables in the site's light tokens and fallback font stack, plus the plain-text part from the same blocks), `templates.ts` builds each email from data, and `rules.ts` holds the pure rules (`rules.check.mjs`). New emails must use `renderEmail()` blocks, never their own HTML. `src/lib/email.ts` sends over SMTP with Nodemailer, records every attempt in `email_log` (`sent`, `failed`, or `logged` when email is off or the address is a test one), and never throws. The same email (kind, `ref`, recipient; a resend counts as the email it repeats) goes at most once every 2 minutes (`REPEAT_WINDOW_MS`, logged `skipped`), which stops double clicks and anyone re-triggering verification or contact acknowledgements at one address. `example.com` addresses (`isSuppressed`) are never mailed, so the e2e accounts can't bounce and get the Gmail flagged; Gmail allows about 500 emails a day.

- Customers get: verify, welcome (Better Auth `afterEmailVerification`), reset password, password changed (`onPasswordReset`), order confirmed / payment processing / payment failed (from `applyCheckoutSession`, only when its guarded update wins), shipped / delivered / cancelled (`updateFulfilment`), refunded, back in stock, and a contact-form acknowledgement that repeats only the topic, never the message. `CONTACT_TO` gets each contact message (Reply-To the visitor) and each paid order ("Oversold:" in the subject when it was).
- **One thread per order:** every order email has the same subject (`orderSubject`) and replies to the confirmation's fixed `Message-ID` (`orderThreadHeaders`); later ones and resends get their own id, because Gmail drops a repeated one.
- `/admin/emails` previews every template with the latest paid order; the admin order page lists that order's `email_log` and resends an email that matches its current state.

### Analytics (Helo)

Event analytics through the Helo Web SDK (`helo-sdk`, browser only). **`docs/analytics/tracking-plan.md` is the tracking plan** (every event, when it fires, its properties, the funnels and a changelog), and **the `analytics-steward` agent (`.claude/agents/analytics-steward.md`) does all analytics work and the regular audits.** Standing rule: any change to a customer-facing flow updates the catalogue (`src/lib/analytics-events.ts`), the tracking plan and `scripts/e2e/analytics.e2e.mjs` in the same change; `src/lib/analytics-guard.check.mjs` (in `npm run check`) fails when the SDK is imported outside the wrapper, a file that isn't `"use client"` imports the wrapper, a catalogued event is never sent (only sending lines count), or the plan and catalogue disagree. Add an e2e assertion for every event the e2e flow can reach.

- `src/lib/analytics.ts` is the only module that imports the SDK; everything else calls its `track`, `trackPageView`, `trackCharged`, `identify`, `logout(user)`, `signedIn`, `flushNow`, or renders `<TrackEvent>` / `<TrackCharged>` (`src/components/analytics.tsx`). Calls never throw.
- **Off** when `NEXT_PUBLIC_HELO_API_KEY` (publishable `pk_…`) or `NEXT_PUBLIC_HELO_PROJECT_ID` is unset, on `/admin`, under automation (`navigator.webdriver`, so the e2e runs send nothing unless a test sets `window.__HELO_TEST__`), and **until the visitor accepts the consent banner** (`src/components/consent-banner.tsx`, cookie `maison-consent`, reopened from "Cookie preferences" in the footer; the SDK also runs with `requireConsent`). `NEXT_PUBLIC_HELO_ENV=staging` uses the SDK's staging host. `NEXT_PUBLIC_*` values are inlined at build time, so changing them needs a rebuild.
- **Privacy:** personal details (email, phone, address, messages) are stripped from event properties; email and first name go only to the Helo profile through `identify`, which `<Analytics />` (root layout) repeats on every page load because the SDK keeps the customer in memory only. The privacy note is `/about#privacy`; keep it in step with what is collected.
- **Race safety** (the SDK's own behaviour, read from `node_modules/helo-sdk/dist/index.js`):
  - **Identity steps carry a generation;** `logout`, `reset` and Decline bump it, so a late identify never re-attaches a signed-out customer (who also stays blocked on that page until `signedIn()`).
  - **The SDK only logs out a customer it identified on the same page load,** so `logout(user, "Signed Out")` takes who is signing out, identifies first when needed, and sends "Signed Out" as theirs before the logout. A different customer on the same page is `reset()` first, or the SDK refuses with `IDENTIFY_CUSTOMER_MISMATCH`.
  - **`optOut()` only stops sending,** and the SDK keeps re-saving its in-memory queue (every 10 seconds and when the page hides). So Decline deletes the SDK's localStorage queues and `helo_anonymous_id` cookie, keeps deleting them on that page after each save, and every page load that isn't consented wipes them before anything starts. An Accept after a Decline on the same page reloads it and wipes first. Answers reach other open tabs through a `storage` event, and a tab coming back (back/forward cache, visibility) re-checks the cookie.
  - **Events wait for identity:** the SDK stamps each event with the customer it knows at that moment, and on a fresh page load `identify` lands after the first page view. So `run()` holds events (at most 8 seconds, released early when the page is left) until `identify` is acknowledged, or `identityKnown()` says nobody is signed in. Because the server's session check can take seconds when cold, the browser remembers the last identified customer (`maison-helo-customer` in localStorage; cleared on sign-out and Decline) and identifies them at once on the next load. The session check then confirms them, switches to the right customer, or logs out an expired one. `signedIn()` re-arms the wait.
  - **Each view is sent once:** `<TrackEvent>` sends once per mount and `trackPageView` once per distinct URL (React runs effects twice in development); a back/forward-cache return counts as a view.
  - **`flushNow()` after anything that leaves the page** (checkout, market change).
- **Purchases are claimed on the server:** `<TrackCharged>` calls the `claimChargedEvent` Server Action (one guarded UPDATE of `orders.analytics_charged_at`), and only the first claimant in any tab or device sends `Charged` (`recordChargedEvent`) and "Order Completed". It renders on the confirmation page, the order page and the orders list, so a purchase whose confirmation page never loaded is still counted on the next visit, within `LATE_PURCHASE_DAYS` (7) of payment and never once cancelled (`latePurchaseOk`, enforced in the claim's UPDATE too). Only a working SDK claims, and a failed claim request leaves it claimable. Orders paid before analytics were backfilled as claimed. The SDK has no server API, so a customer who never returns, or never consents, isn't counted.
- **Testing:** `e2e:analytics` against a build with any `NEXT_PUBLIC_HELO_*` values (e.g. `pk_test_e2e` / `proj_e2e`): it answers Helo's hosts itself, so nothing real is sent.

### Admin writes never overwrite a sale

Every admin stock edit (product form and `/admin/stock`) posts the number it loaded and only applies while stock still equals it; otherwise the admin gets the current number and saves again. An untouched stock field on the product form isn't written at all.

## Deployment (internal test site)

Vercel project `maison` (team `soumikchoudhury-7216s-projects`), linked to GitHub `Masquerade-7991/maison`; functions run in `cle1` (`vercel.json`), next to Neon's `aws-us-east-2`; every push to `main` deploys to <https://maison-mu-seven.vercel.app>. It shares the Neon `production` branch, so testers' accounts and orders are real rows locally too.

- Production env: `DATABASE_URL` (pooled), its own `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` set to that exact origin (preview and hash URLs fail Better Auth's origin check, so sign in only works on the production domain), `STRIPE_SECRET_KEY` (Maison sandbox `rk_test_`), `STRIPE_WEBHOOK_SECRET` (dashboard endpoint `we_1UKkhb2akEdHkkSyvYfOLKTo`, the same five events, API version pinned to match `src/lib/stripe.ts`), `ENABLE_EXPERIMENTAL_COREPACK=1` (pnpm from `packageManager`), `SMTP_URL` and `EMAIL_FROM` (the shop Gmail, sensitive), `CONTACT_TO` (the shop Gmail), `CRON_SECRET` (random; Vercel Cron sends it to `/api/cron/fx`, `/api/cron/account-deletions` and `/api/cron/payments`), `NEXT_PUBLIC_HELO_API_KEY` (a `pk_test_` key: it belongs to Helo's staging host, production answers 405), `NEXT_PUBLIC_HELO_PROJECT_ID` and `NEXT_PUBLIC_HELO_ENV=staging` (all public "config" values; a rebuild applies changes), `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` (test mode; webhook at `/api/razorpay/webhook` with `order.paid`, `payment.captured`, `refund.processed`, `refund.failed`; auto-capture 12 minutes). `EMAIL_LINKS_ON_PAGE` is gone: real email is on, and only `example.com` test accounts still get the on-page verification link. The repo is linked with `vercel link` (gitignored `.vercel/`), so `npx vercel env ls|add|rm` and `npx vercel redeploy maison-mu-seven.vercel.app --target production` work from here; env changes need a redeploy.
- **Before any real launch:** move email from Gmail to a mailbox on the shop's own domain (only `SMTP_URL`/`EMAIL_FROM` change), and switch to live Stripe keys.
- Order emails go from whichever server applies the payment first. The sandbox webhook reaches the live site, which usually wins over a local server, so a local test order's confirmation comes from the live site.
- A local `stripe listen` also receives the sandbox's events, so the site and local dev may both apply the same session; the status guard makes that harmless.

## Next.js 16 notes

- `loading.tsx` only goes on routes that never call `notFound()` (today: women, men, gifts, new-arrivals, search, bag). Once a loading screen streams, the status is already sent, so a missing product would answer 200 instead of 404.

- Route `params` and `searchParams` are Promises and must be awaited.
- Pages and layouts use the generated `PageProps<"/route">` / `LayoutProps<"/route">` types, which only exist after a dev server or build has run. Stale `.next/types` from an old build break `tsc`.
- Read `node_modules/next/dist/docs/` before relying on remembered APIs.
- After renaming a dynamic segment, restart the dev server: it keeps the old route and throws "different slug names for the same dynamic path".
- Only one `next dev` may run per `distDir`. Tailwind scans every folder that isn't gitignored, so a second build output under another name gets scanned into garbage classes that break `globals.css`, and the broken CSS survives in `.next/dev` until that folder is deleted.
