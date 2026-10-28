"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { Field, Section, Spinner } from "@/components/admin/form-parts";
import { INDIAN_STATES, type AddressField } from "@/lib/address-rules";
import { track } from "@/lib/analytics";
import { startUpiCheckoutAction, type UpiCheckoutState } from "@/lib/checkout-actions";
import { orderReference } from "@/lib/order-rules";

type Checkout = NonNullable<NonNullable<UpiCheckoutState>["checkout"]>;
type RazorpayCheckout = { open(): void };

declare global {
  interface Window {
    Razorpay?: new (options: object) => RazorpayCheckout;
  }
}

let script: Promise<void> | null = null;

// Razorpay's checkout.js, added to the page once. A failed load is forgotten, so "Try again" loads it again.
function loadRazorpay() {
  script ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => {
      s.remove();
      script = null;
      reject(new Error("checkout.js failed to load"));
    };
    document.head.append(s);
  });
  return script;
}

/**
 * Opens Razorpay's window for an order the server has just created, UPI only. Every option comes from the
 * action's reply, never from the page. In redirect mode Razorpay posts the result to `callbackUrl`, which
 * checks it with Razorpay and lands on the confirmation page. Returns an error message, or null once open.
 */
async function openRazorpay(c: Checkout, onDismiss: () => void) {
  try {
    await loadRazorpay();
  } catch {
    return "The UPI payment window couldn't load. Check your connection and try again.";
  }
  if (!window.Razorpay) return "The UPI payment window couldn't load. Check your connection and try again.";
  new window.Razorpay({
    key: c.keyId,
    order_id: c.razorpayOrderId,
    amount: c.amount,
    currency: c.currency,
    name: "MAISON",
    description: `Order ${orderReference(c.orderId)}`,
    prefill: { name: c.name, email: c.email, contact: c.phone },
    callback_url: c.callbackUrl,
    redirect: true,
    config: {
      display: {
        blocks: { upi: { name: "Pay by UPI", instruments: [{ method: "upi" }] } },
        sequence: ["block.upi"],
        preferences: { show_default_blocks: false },
      },
    },
    theme: { color: "#000000" },
    modal: { ondismiss: onDismiss },
  }).open();
  return null;
}

/** The delivery details for a UPI order, then Razorpay's payment window. */
export function UpiCheckoutForm({ defaults }: { defaults: Partial<Record<AddressField, string>> }) {
  const [dismissed, setDismissed] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reopening, startReopen] = useTransition();

  const pay = async (c: Checkout) => {
    setDismissed(false);
    setLoadError(
      await openRazorpay(c, () => {
        setDismissed(true);
        track("Payment Window Closed", { gateway: "razorpay", order_ref: orderReference(c.orderId) });
      }),
    );
  };

  // `round` counts server replies: React 19 resets the form after each action and restores inputs from
  // defaultValue, but not a <select>, so the state select is keyed on it to come back with the kept value.
  const [state, formAction, pending] = useActionState(
    async (prev: (UpiCheckoutState & { round?: number }) | null, fd: FormData) => {
      const next = await startUpiCheckoutAction(prev, fd);
      if (next?.checkout) {
        track("Delivery Details Submitted", { state: String(fd.get("state")), city: String(fd.get("city")).trim() });
        await pay(next.checkout); // still pending while checkout.js loads
      }
      return next && { ...next, round: (prev?.round ?? 0) + 1 };
    },
    null,
  );

  // The order exists now: closing the window offers the same payment again, never a new order.
  if (state?.checkout) {
    const checkout = state.checkout;
    const stopped = dismissed || loadError;
    return (
      <div>
        <div aria-live="polite">
          {loadError ? (
            <p role="alert" className="border-l-2 border-danger pl-4 text-danger">{loadError}</p>
          ) : dismissed ? (
            <p className="border-l-2 border-ink pl-4">Payment not finished. You can try again.</p>
          ) : (
            <p className="border-l-2 border-line pl-4 text-muted">Complete the payment in the Razorpay window.</p>
          )}
        </div>
        {stopped && (
          <button type="button" onClick={() => startReopen(() => pay(checkout))} disabled={reopening} className="btn btn-primary mt-8 sm:w-full">
            {reopening && <Spinner />}
            {reopening ? "Opening UPI…" : "Try again"}
          </button>
        )}
        <Link href="/bag" className="label link mt-6 inline-block">Return to your bag</Link>
      </div>
    );
  }

  const errors = state?.errors ?? {};
  const v = (field: AddressField) => state?.values?.[field] ?? defaults[field] ?? "";
  const props = (field: AddressField) => ({
    id: field,
    name: field,
    defaultValue: v(field),
    "aria-invalid": errors[field] ? true : undefined,
    "aria-describedby": errors[field] ? `${field}-error` : undefined,
    className: "field",
  });

  return (
    <form action={formAction} noValidate aria-busy={pending}>
      <fieldset disabled={pending} className="space-y-8">
        <Section title="Delivery in India">
          <Field label="Full name" name="name" error={errors.name} wide>
            <input {...props("name")} autoComplete="name" maxLength={100} />
          </Field>
          <Field label="Mobile number" name="phone" error={errors.phone} hint="10 digits, for the courier.">
            <input {...props("phone")} type="tel" autoComplete="tel-national" inputMode="numeric" maxLength={14} />
          </Field>
          <Field label="Address" name="line1" error={errors.line1} wide>
            <input {...props("line1")} autoComplete="address-line1" maxLength={200} />
          </Field>
          <Field label="Flat, floor, landmark (optional)" name="line2" error={errors.line2} wide>
            <input {...props("line2")} autoComplete="address-line2" maxLength={200} />
          </Field>
          <Field label="City" name="city" error={errors.city}>
            <input {...props("city")} autoComplete="address-level2" maxLength={100} />
          </Field>
          <Field label="State" name="state" error={errors.state}>
            <select key={state?.round ?? 0} {...props("state")} autoComplete="address-level1">
              <option value="" disabled>Choose…</option>
              {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="PIN code" name="postalCode" error={errors.postalCode}>
            <input {...props("postalCode")} autoComplete="postal-code" inputMode="numeric" maxLength={6} />
          </Field>
        </Section>

        {state?.error && <p role="alert" className="border-l-2 border-danger pl-4 text-danger">{state.error}</p>}
        {state?.errors && <p role="alert" className="border-l-2 border-danger pl-4 text-danger">Please correct the highlighted fields.</p>}

        <div>
          <button type="submit" className="btn btn-primary sm:w-full">
            {pending && <Spinner />}
            {pending ? "Opening UPI…" : "Continue to UPI"}
          </button>
          <p className="mt-3 text-muted">
            You&apos;ll approve the payment in your UPI app: on a phone it opens for you, on a computer you scan a QR code.
          </p>
        </div>
      </fieldset>
    </form>
  );
}
