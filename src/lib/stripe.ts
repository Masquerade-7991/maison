// Stripe client, created on first use: the storefront builds and runs without Stripe keys,
// only checkout and the webhook need them.
import Stripe from "stripe";

let client: Stripe | null = null;

export function stripe(): Stripe {
  if (client) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set. Add a restricted rk_ key from the Stripe dashboard to .env.");
  client = new Stripe(key, { apiVersion: "2026-08-26.dahlia", appInfo: { name: "Maison" } });
  return client;
}

export function webhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set. Use the whsec_ value from `stripe listen` or the endpoint.");
  return secret;
}
