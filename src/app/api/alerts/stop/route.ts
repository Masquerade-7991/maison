// "Stop these emails" from a back-in-stock email: signed with the server secret, so it works without
// signing in and can't stop anyone else's alert. Ends on the product page.
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { unsubscribe, verifyStop } from "@/lib/alerts";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const [u, p, s] = [q.get("u") ?? "", q.get("p") ?? "", q.get("s") ?? ""];
  if (!u || !p || !verifyStop(u, p, s)) return new Response("This link isn't valid.", { status: 400 });
  await unsubscribe(u, p);
  const [product] = await db.select({ slug: products.slug }).from(products).where(eq(products.id, p)).limit(1);
  return Response.redirect(new URL(product ? `/products/${product.slug}` : "/", request.url), 303);
}
