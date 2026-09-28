"use client";

import { useActionState } from "react";
import { fulfilmentAction } from "@/app/admin/orders/actions";
import { Field, Section, Spinner } from "@/components/admin/form-parts";
import type { FulfilmentStatus } from "@/lib/order-rules";

/** The next fulfilment step for a paid order. Each button posts its action; the server re-checks it. */
export function FulfilmentForm({ orderId, fulfilment }: { orderId: string; fulfilment: FulfilmentStatus }) {
  const [state, formAction, pending] = useActionState(fulfilmentAction, null);
  const button = (action: string, label: string, busy: string, primary = false) => (
    <button type="submit" name="action" value={action} disabled={pending} className={`btn ${primary ? "btn-primary" : "btn-secondary"} w-auto px-8`}>
      {pending && <Spinner />}
      {pending ? busy : label}
    </button>
  );

  return (
    <div>
      {state?.error ? (
        <p role="alert" className="mb-6 border-l-2 border-danger pl-4 text-danger">{state.error}</p>
      ) : (
        state?.saved && <p role="status" className="mb-6 border-l-2 border-line pl-4 text-muted">Saved. The customer has been emailed where relevant.</p>
      )}

      {fulfilment === "unfulfilled" && (
        <div className="space-y-12">
          <form action={formAction} noValidate>
            <input type="hidden" name="id" value={orderId} />
            <Section title="Ship">
              <Field label="Carrier" name="carrier" error={state?.errors?.carrier}>
                <input id="carrier" name="carrier" maxLength={60} autoComplete="off" disabled={pending} aria-invalid={state?.errors?.carrier ? true : undefined} aria-describedby={state?.errors?.carrier ? "carrier-error" : undefined} className="field" />
              </Field>
              <Field label="Tracking number" name="trackingNumber" error={state?.errors?.trackingNumber}>
                <input id="trackingNumber" name="trackingNumber" maxLength={100} autoComplete="off" disabled={pending} aria-invalid={state?.errors?.trackingNumber ? true : undefined} aria-describedby={state?.errors?.trackingNumber ? "trackingNumber-error" : undefined} className="field" />
              </Field>
              <div className="sm:col-span-2">{button("ship", "Mark as shipped", "Saving…", true)}</div>
            </Section>
          </form>
          <form
            action={formAction}
            onSubmit={(e) => {
              if (!confirm("Cancel this order? The customer is emailed that it has been cancelled.")) e.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={orderId} />
            <h2 className="label border-b border-line pb-3">Cancel</h2>
            <p className="mt-6 border-l-2 border-line pl-4 text-muted">
              Cancelling only records it here and emails the customer. Issue the refund yourself in the Stripe Dashboard: it is not refunded automatically.
            </p>
            <div className="mt-6">{button("cancel", "Cancel order", "Cancelling…")}</div>
          </form>
        </div>
      )}

      {fulfilment === "shipped" && (
        <form action={formAction}>
          <input type="hidden" name="id" value={orderId} />
          {button("deliver", "Mark as delivered", "Saving…", true)}
        </form>
      )}
    </div>
  );
}
