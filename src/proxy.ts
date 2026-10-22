// Picks each visitor's market and serves the storefront priced in it, without the market ever showing in a URL.
//
//   market = the visitor's own choice (cookie `market-choice`, set by the footer selector)
//            ?? their country (Vercel's `x-vercel-ip-country`, which Vercel overwrites at its edge)
//
// Storefront pages are rewritten to /<market>/… (src/app/[market]), so each market's pages are cached
// separately. Everything else (bag, account, admin, auth, about, contact) runs as is and gets the market
// from the `x-maison-market` request header, which is always overwritten here so a visitor can't fake it.
// /api/** is never matched: Stripe's webhook sends no cookie and needs no market.
import { NextResponse, type NextRequest } from "next/server";
import { isMarketId, MARKET_CHOICE_COOKIE, MARKET_COOKIE, MARKET_HEADER, marketById, marketForCountry } from "@/lib/markets";

// Top-level routes outside src/app/[market]: no prices to localise, or they price per request themselves.
const OUTSIDE = new Set(["about", "account", "admin", "bag", "checkout", "contact", "forgot-password", "reset-password", "sign-in", "sign-up"]);

export function proxy(request: NextRequest) {
  const choice = request.cookies.get(MARKET_CHOICE_COOKIE)?.value;
  const market = isMarketId(choice) ? marketById(choice) : marketForCountry(request.headers.get("x-vercel-ip-country"));

  const headers = new Headers(request.headers);
  headers.set(MARKET_HEADER, market.id);

  const { pathname, search } = request.nextUrl;
  const response = OUTSIDE.has(pathname.split("/")[1])
    ? NextResponse.next({ request: { headers } })
    : NextResponse.rewrite(new URL(`/${market.id}${pathname === "/" ? "" : pathname}${search}`, request.url), { request: { headers } });

  // Readable by the footer selector to show where we're delivering; never trusted by the server.
  if (request.cookies.get(MARKET_COOKIE)?.value !== market.id) {
    response.cookies.set(MARKET_COOKIE, market.id, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  }
  return response;
}

export const config = {
  // Not /api, not Next's own files, not anything with a file extension (images, fonts, favicon).
  matcher: ["/((?!api/|_next/|.*\\..*).*)"],
};
