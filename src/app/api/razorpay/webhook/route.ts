// Razorpay webhook (Settings → Webhooks: order.paid, payment.captured, refund.processed, refund.failed).
// Like Stripe's, it's the main way a UPI payment reaches the database; the return route, the success page
// and the payments cron fetch from Razorpay as the fallback. Razorpay retries for 24 hours on any non-2xx
// and wants an answer within 5 seconds; events can arrive out of order, and applying them is idempotent.
import { applyRazorpayPayment, applyRazorpayRefund } from "@/lib/orders";
import { verifyWebhookSignature, type RazorpayPayment } from "@/lib/razorpay";

type RazorpayEvent = {
  event: string;
  payload: { payment?: { entity: RazorpayPayment }; refund?: { entity: { id: string; payment_id: string } } };
};

export async function POST(req: Request) {
  const signature = req.headers.get("x-razorpay-signature");
  const body = await req.text(); // raw body: the signature is over the exact bytes Razorpay sent
  let valid: boolean;
  try {
    valid = Boolean(signature) && verifyWebhookSignature(body, signature!);
  } catch (e) {
    // Our misconfiguration, not a bad request: 500 so Razorpay keeps retrying once the secret is set.
    console.error("[razorpay webhook]", e instanceof Error ? e.message : e);
    return new Response("Webhook not configured", { status: 500 });
  }
  if (!valid) return new Response("Invalid signature", { status: 400 });

  const event = JSON.parse(body) as RazorpayEvent;
  try {
    let result: unknown = undefined;
    if (event.event === "order.paid" || event.event === "payment.captured") {
      if (event.payload.payment) result = await applyRazorpayPayment(event.payload.payment.entity);
    } else if (event.event === "refund.processed" || event.event === "refund.failed") {
      // A failed refund lowers nothing on Razorpay's side; the payment's running total is read either way.
      if (event.payload.refund) result = await applyRazorpayRefund(event.payload.refund.entity.payment_id);
    } else return Response.json({ received: true });
    if (!result) console.warn(`[razorpay webhook] ${event.event}: no matching order`);
  } catch (e) {
    // 500 makes Razorpay retry; applying is idempotent, so a retry is always safe.
    console.error(`[razorpay webhook] ${event.event} failed:`, e);
    return new Response("Processing failed", { status: 500 });
  }
  return Response.json({ received: true });
}
