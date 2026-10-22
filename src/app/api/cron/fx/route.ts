// Daily exchange-rate refresh, called by Vercel Cron (vercel.json) with `Authorization: Bearer $CRON_SECRET`.
// Without CRON_SECRET it refuses everyone, so prices keep the stored or fallback rates.
import { revalidatePath } from "next/cache";
import { refreshRates } from "@/lib/fx";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const result = await refreshRates();
    if (result.skipped.length) console.error("[fx] skipped suspicious or missing rates:", result.skipped);
    if (result.updated.length) revalidatePath("/", "layout"); // cached pages pick up the new prices
    return Response.json(result);
  } catch (e) {
    console.error("[fx] refresh failed, keeping the stored rates:", e);
    return new Response("Rates refresh failed", { status: 502 });
  }
}
