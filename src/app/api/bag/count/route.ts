// The header's bag count, fetched by BagLink after the page loads so the static catalogue routes stay
// static (reading the session in the root layout would make them dynamic). It takes no input: the
// count is always the signed-in user's own, and 0 for everyone else.
import { bagCount } from "@/lib/cart";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  const count = session ? await bagCount(session.user.id) : 0;
  return Response.json({ count }, { headers: { "Cache-Control": "no-store" } });
}
