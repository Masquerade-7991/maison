// Daily: completes account deletions whose 14 days have passed (src/lib/account-deletion.ts). Called by Vercel
// Cron (vercel.json) with `Authorization: Bearer $CRON_SECRET`; without CRON_SECRET it refuses everyone.
import { purgeDueDeletions } from "@/lib/account-deletion";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  try {
    return Response.json(await purgeDueDeletions());
  } catch (e) {
    console.error("[account deletion] purge failed:", e);
    return new Response("Purge failed", { status: 500 });
  }
}
