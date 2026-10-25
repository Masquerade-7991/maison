// Daily: settles UPI orders a lost Razorpay webhook left pending (src/lib/orders.ts syncRazorpayOrder): a
// captured payment pays the order, none expires it. Called by Vercel Cron (vercel.json) with
// `Authorization: Bearer $CRON_SECRET`; without CRON_SECRET it refuses everyone.
import { pendingRazorpayOrdersOlderThan, syncRazorpayOrder } from "@/lib/orders";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  try {
    const ids = await pendingRazorpayOrdersOlderThan(15);
    const statuses: Record<string, string | null> = {};
    for (const id of ids) statuses[id] = await syncRazorpayOrder(id);
    return Response.json({ checked: ids.length, statuses });
  } catch (e) {
    console.error("[payments cron] failed:", e);
    return new Response("Payments sync failed", { status: 500 });
  }
}
