"use server";

// "Notify me when it's back" on sold-out product pages. The page is static, so the session is only read
// here: a signed-out visitor gets { signIn: true } and the button turns into a sign-in link.
import { db } from "@/db";
import { products } from "@/db/schema";
import { eq } from "drizzle-orm";
import { subscribe, unsubscribe } from "@/lib/alerts";
import { getMarket } from "@/lib/market-server";
import { getSession } from "@/lib/session";

export type AlertState = { on: boolean; email?: string; signIn?: boolean; error?: string } | null;

async function productId(slug: unknown) {
  if (typeof slug !== "string") return null;
  const [p] = await db.select({ id: products.id }).from(products).where(eq(products.slug, slug)).limit(1);
  return p?.id ?? null;
}

/** Toggles the alert: the form posts `want=on` to ask, `want=off` to undo. */
export async function stockAlertAction(_prev: AlertState, fd: FormData): Promise<AlertState> {
  const session = await getSession();
  if (!session) return { on: false, signIn: true };
  const id = await productId(fd.get("slug"));
  if (!id) return { on: false, error: "This piece is no longer available." };
  if (fd.get("want") === "off") {
    await unsubscribe(session.user.id, id);
    return { on: false };
  }
  await subscribe(session.user.id, id, (await getMarket()).id);
  return { on: true, email: session.user.email };
}
