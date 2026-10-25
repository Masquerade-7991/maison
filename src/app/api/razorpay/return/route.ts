// Where Razorpay's checkout sends the customer back (redirect mode posts a form here). The post is
// cross-site, so no session cookie comes with it: nothing here needs one. The posted fields are only
// hints: a payment counts once its signature checks out against the Razorpay order WE stored and the
// payment fetched from Razorpay is captured. Everyone lands on the success page, which checks again.
import { siteUrl } from "@/lib/email";
import { applyRazorpayPayment, storedRazorpayOrderId, syncRazorpayOrder } from "@/lib/orders";
import { fetchPayment, verifyCheckoutSignature } from "@/lib/razorpay";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handle(req: Request, fields: URLSearchParams | FormData | null) {
  const orderId = new URL(req.url).searchParams.get("order") ?? "";
  if (!UUID.test(orderId)) return Response.redirect(`${siteUrl()}/bag`, 303);
  const paymentId = String(fields?.get("razorpay_payment_id") ?? "");
  const signature = String(fields?.get("razorpay_signature") ?? "");
  try {
    const razorpayOrderId = await storedRazorpayOrderId(orderId);
    if (razorpayOrderId && paymentId && signature && verifyCheckoutSignature(razorpayOrderId, paymentId, signature)) {
      await applyRazorpayPayment(await fetchPayment(paymentId));
    } else if (razorpayOrderId) {
      await syncRazorpayOrder(orderId); // failed, cancelled or unsigned: ask Razorpay what really happened
    }
  } catch (e) {
    console.error(`[razorpay return] could not apply the payment for ${orderId}:`, e);
  }
  return Response.redirect(`${siteUrl()}/checkout/success?order=${orderId}`, 303);
}

export async function POST(req: Request) {
  return handle(req, await req.formData().catch(() => null));
}

export async function GET(req: Request) {
  return handle(req, new URL(req.url).searchParams);
}
