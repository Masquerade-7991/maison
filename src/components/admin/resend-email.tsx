"use client";

import { useActionState } from "react";
import { resendEmailAction } from "@/app/admin/orders/actions";

const outcome = { sent: "Sent", logged: "Logged only (email off or test address)", skipped: "Not sent: it already went out in the last 2 minutes", failed: "Couldn't send. Try again later" };

/** Resend one order email. Asks first and disables while sending, so one click is one email. */
export function ResendEmail({ orderId, kinds }: { orderId: string; kinds: string[] }) {
  const [state, formAction, pending] = useActionState(resendEmailAction, null);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        const kind = ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value;
        if (!confirm(`Send the ${kind} email to the customer again?`)) e.preventDefault();
      }}
      className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3"
    >
      <input type="hidden" name="id" value={orderId} />
      <span className="label text-muted">Resend</span>
      {kinds.map((k) => (
        <button key={k} type="submit" name="kind" value={k} disabled={pending} className="label link cursor-pointer disabled:cursor-wait disabled:opacity-50">
          {k}
        </button>
      ))}
      <span role="status" className="text-muted">
        {pending ? "Sending…" : state && `${state.kind}: ${outcome[state.result]}`}
      </span>
    </form>
  );
}
