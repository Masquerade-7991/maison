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

Env lives in `.env` (from `.env.example`). You can't read or write `.env` (permissions), so the user pastes secrets. `BETTER_AUTH_URL` must be the app's exact origin or verification links break. Stripe needs a restricted `rk_` key with *Checkout Sessions: write*; locally the webhook secret comes from `stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired,charge.refunded --forward-to localhost:3000/api/stripe/webhook` (current CLIs refuse to start without `--events`; the secret is stable per machine, see `stripe listen --print-secret`). The storefront builds and runs without Stripe or Resend keys; only checkout, the webhook and email need them.

## Verification

There is no test runner.

- `npm run check`: the pure rules, run by Node 23+ (which strips TS types). That's why pure modules import each other as `./x.ts` and `tsconfig.json` sets `allowImportingTsExtensions`.
- `npm run check:payment` and `npm run e2e:checkout | e2e:customer-flow | e2e:password-reset | e2e:admin-stock | e2e:admin-flow` work on the shared production database and clean up after themselves. Test accounts are always `qa.…@example.com` and test products `qa-…`.
- The e2e runs drive an installed Edge through `playwright-core` (`BROWSER_CHANNEL=chrome` for Chrome) against `npm run build` then `EMAIL_LINKS_ON_PAGE=true BETTER_AUTH_URL=http://localhost:3100 npx next start -p 3100`. Set `BASE=<url>` to target another server, such as the live site. Production mode allows 3 sign ups a minute, so leave a minute between runs. `e2e:customer-flow` needs `chain-shoulder-bag` to have 2 to 9 in stock.
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

- **Money is integer cents.** Only `mapProduct()` in `src/lib/products.ts` turns cents into dollars. `currency()` rounds to whole dollars and is for catalogue display only; anything that has to match a payment (bag, checkout, orders, emails) uses `formatCents`, or `$99.99` shows as `$100` beside a Stripe page that says otherwise.
- **Stock is a quantity plus a `madeToOrder` flag, never a stored state.** `stockState()` in `src/lib/stock.ts` is the only place it becomes a state, and every surface uses it. Made to order with pieces on hand counts as in stock, never "Only N left", because the bag allows 10 of it.
- **Stock is per product.** Sizes are a display list per category from `categoryDetails` in `src/lib/sample-data.ts`, not stocked; a category created in the admin is one size until that file lists it.
- "New", the homepage order and category piece counts are all derived (from `createdAt` and counts), never stored.
- `product_images.alt` belongs to the row, not the image (the same URL is reused with different copy). Position 0 is the packshot.
- Pages never touch `db` directly; they call `src/lib/products.ts`. Listing filters run in memory over one view: a deliberate ceiling, move them into SQL once a view holds a few hundred products.
- Categories are product types; department (`women`/`men`/`unisex`) is an enum and `isGift` a flag.
- Admin image URLs must be on `images.unsplash.com`, the only host `next.config.ts` allows.
- "Notify me when it is available" on sold out product pages is a placeholder: it stores and sends nothing, and says so. Real alerts would need a table and an email when stock goes up from 0.

### Caching

Only `/` and `/products/[slug]` are static (ISR, `revalidate = 300`); every listing reads `searchParams` and renders per request. Every admin catalogue write and every paid order calls `revalidatePath("/", "layout")`. Next throws on that during a page render, so there it is swallowed and the webhook covers it. Keep `headers()` out of the root layout, or the two static routes turn dynamic. That's why the header's "Bag (n)" is `BagLink`, a client component that fetches `/api/bag/count` after load, on every navigation, and on the `bag:changed` window event (`announceBagChange()` in `cart-rules.ts`); anything new that changes the bag must fire that event.

### Auth and access

- Sign in, sign up and sign out run from client components through `auth-client` and `/api/auth/[...all]`, **not** Server Actions calling `auth.api.*`: Better Auth's rate limiting only runs in its HTTP router. Rate limits are stored in Postgres and apply in production only.
- Email verification is required. Email is "off" when the Resend keys are missing **and** the app is in development or has `EMAIL_LINKS_ON_PAGE=true`: emails only go to the server log, the verification link shows on the page (so anyone can verify any unverified address), and the pages stop promising receipts. In production without that switch, a missing key throws. Never set it for a real launch.
- **Password reset links are never shown on a page**, not even with `EMAIL_LINKS_ON_PAGE`: that would let anyone reset any account, admins included. While email is off they only reach the server log. A reset link works once, expires in an hour, and saving the new password signs the account out everywhere; the forgot password reply is the same whether or not the account exists.
- Server code reads the session only through `src/lib/session.ts`. Every protected page calls `requireUser`/`requireAdmin`, and every admin Server Action and admin data function (`src/lib/admin-*.ts`, `src/lib/users.ts`) starts with `await assertAdmin()`. Never rely on a layout for access: layouts don't render again on client navigation. `src/app/admin/admin-guard.check.mjs` enforces this. Customers get a plain 404 from admin routes.
- There is no `proxy.ts`. If one is ever added, keep `/api/**` out of its matcher: Stripe sends no cookie.
- `user.role` has `input: false`. Only `auth:set-role` (how the first admin is made; it refuses unverified emails) and `/admin/accounts` change it. An admin can't change their own role, and a role change deletes that user's sessions. `?next=` redirects go through `safeNext()`.

### Bag

Database backed and signed in only: no guest bag, nothing to merge at sign in. The browser only ever sends a slug, a size and a quantity; prices and stock are read live on every render and every action. `src/lib/cart.ts` is the only module that touches `cart_items`; the rules live in `src/lib/cart-rules.ts` so client code can import them. There is no reservation: the bag never changes on read, a stock drop shows as a notice, and checkout checks again.

### Checkout and payments

Stripe hosted Checkout Sessions, test mode account "Maison sandbox".

- **The browser never supplies an amount.** The checkout action takes no form fields: it reads the bag again, snapshots it into a pending order at our prices, and builds the session's `price_data` from that snapshot. There are no Stripe Products or Prices. Never pass `payment_method_types`, keep `integration_identifier`. Tax is off; shipping is US only.
- Sessions last 30 minutes, which is also the accepted oversell window (no stock reservation).
- **Orders move forward only on facts from Stripe:** the signature verified webhook, or a server side `sessions.retrieve` with `expand: ["payment_intent"]` (success page, order page, checkout sweep) as the fallback when a webhook is late or lost. The expanded PaymentIntent is how a failed delayed payment is detected without its webhook. The `session_id` in the success URL is only a lookup key. Transitions come from `nextStatus()` and only move forward.
- **Each transition is one SQL statement guarded by the current status.** The paid one also decrements stock, flags an oversell and clears the paid bag lines in that same statement, with the order row locked first. That is what makes duplicate, concurrent and retried deliveries harmless; there is no event table. A call that loses a race applies again once from the winner's status, because a webhook answered 200 is never redelivered.
- The checkout action closes the customer's older sessions first and **fails closed**: any Stripe error there stops checkout, because that session may still be payable. Only `resource_missing` (the session can't exist for this key) expires the order and continues.
- The webhook answers 500 on a database error or missing configuration, so Stripe retries.
- **Order history is immutable:** `order_items` snapshot name, slug, size and price; `order_items.product_id` is `set null`; `orders.user_id` is `restrict`. Customer pages use `getOrderForUser`; `getOrder` has no ownership check (admin and email only).
- Fulfilment (`unfulfilled → shipped → delivered`, or `cancelled`) is separate from payment status, admin only, and only for paid orders. Order emails go only after the guarded update wins, and sending never throws.
- **Refunds are issued in the Stripe Dashboard, never in the app** (the key stays Checkout only), and recorded from the `charge.refunded` webhook. Known gaps: a refund that later fails still counts, and nothing restocks automatically.

### Admin writes never overwrite a sale

Every admin stock edit (product form and `/admin/stock`) posts the number it loaded and only applies while stock still equals it; otherwise the admin gets the current number and saves again. An untouched stock field on the product form isn't written at all.

## Deployment (internal test site)

Vercel project `maison` (team `soumikchoudhury-7216s-projects`), linked to GitHub `Masquerade-7991/maison`; every push to `main` deploys to <https://maison-mu-seven.vercel.app>. It shares the Neon `production` branch, so testers' accounts and orders are real rows locally too.

- Production env: `DATABASE_URL` (pooled), its own `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` set to that exact origin (preview and hash URLs fail Better Auth's origin check, so sign in only works on the production domain), `STRIPE_SECRET_KEY` (Maison sandbox `rk_test_`), `STRIPE_WEBHOOK_SECRET` (dashboard endpoint `we_1UKkhb2akEdHkkSyvYfOLKTo`, the same five events, API version pinned to match `src/lib/stripe.ts`), `EMAIL_LINKS_ON_PAGE=true`, `ENABLE_EXPERIMENTAL_COREPACK=1` (pnpm from `packageManager`).
- **Before any real launch:** remove `EMAIL_LINKS_ON_PAGE`, configure Resend, and switch to live Stripe keys.
- A local `stripe listen` also receives the sandbox's events, so the site and local dev may both apply the same session; the status guard makes that harmless.

## Next.js 16 notes

- Route `params` and `searchParams` are Promises and must be awaited.
- Pages and layouts use the generated `PageProps<"/route">` / `LayoutProps<"/route">` types, which only exist after a dev server or build has run. Stale `.next/types` from an old build break `tsc`.
- Read `node_modules/next/dist/docs/` before relying on remembered APIs.
- After renaming a dynamic segment, restart the dev server: it keeps the old route and throws "different slug names for the same dynamic path".
- Only one `next dev` may run per `distDir`. Tailwind scans every folder that isn't gitignored, so a second build output under another name gets scanned into garbage classes that break `globals.css`, and the broken CSS survives in `.next/dev` until that folder is deleted.
