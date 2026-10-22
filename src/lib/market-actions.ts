"use server";

// The footer's delivery-country choice. It only picks among our own price lists, and checkout then
// accepts addresses in that market alone, so a visitor can't pay one country's prices and ship elsewhere.
import { cookies } from "next/headers";
import { isMarketId, MARKET_CHOICE_COOKIE, MARKET_COOKIE } from "@/lib/markets";

const YEAR = 60 * 60 * 24 * 365;

export async function setMarketAction(id: string) {
  if (!isMarketId(id)) return;
  const jar = await cookies();
  jar.set(MARKET_CHOICE_COOKIE, id, { path: "/", sameSite: "lax", maxAge: YEAR, httpOnly: true });
  jar.set(MARKET_COOKIE, id, { path: "/", sameSite: "lax", maxAge: YEAR }); // display copy for the footer
}
