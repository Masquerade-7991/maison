"use client";

import { useActionState, useState } from "react";
import { updateStockAction } from "@/app/admin/stock/actions";
import { Spinner } from "@/components/admin/form-parts";
import { MAX_STOCK } from "@/lib/admin-rules";

/** One product's quantity. Posts the number it loaded, so a sale made meanwhile isn't overwritten. */
export function StockForm({ productId, name, stock }: { productId: string; name: string; stock: number }) {
  const [result, formAction, pending] = useActionState(updateStockAction, null);
  // Remember which `stock` prop each action result arrived with. If the page later re-renders with a
  // different, newer number (another row's save or a sale revalidated it), the server's number wins
  // over this form's last result, so the next save doesn't hit an avoidable "stock changed" refusal.
  const [seen, setSeen] = useState({ result, stock });
  if (seen.result !== result) setSeen({ result, stock });
  const state = result && (seen.stock === stock || result.stock === stock) ? result : null;
  const inputId = `stock-${productId}`;

  return (
    <form action={formAction} className="flex flex-wrap items-start gap-x-3 gap-y-2" noValidate>
      <input type="hidden" name="id" value={productId} />
      <input type="hidden" name="expectedStock" value={state?.stock ?? stock} />
      <label htmlFor={inputId} className="sr-only">Units in stock for {name}</label>
      <input
        id={inputId}
        name="stockQuantity"
        // Re-mount on each result: a save shows the stored number, a refusal keeps what was typed.
        key={`${state?.stock ?? stock}:${state?.value ?? ""}`}
        defaultValue={state?.value ?? state?.stock ?? stock}
        type="number"
        min={0}
        max={MAX_STOCK}
        step={1}
        inputMode="numeric"
        disabled={pending}
        aria-invalid={state?.error ? true : undefined}
        aria-describedby={state?.error ? `${inputId}-error` : undefined}
        className="field w-28 tabular-nums"
      />
      <button type="submit" disabled={pending} className="btn btn-secondary w-auto px-6">
        {pending && <Spinner />}
        {pending ? "Saving…" : "Save"}
      </button>
      {state?.error ? (
        <p id={`${inputId}-error`} role="alert" className="basis-full text-danger">{state.error}</p>
      ) : (
        state?.saved && <p role="status" className="basis-full text-muted">Saved.</p>
      )}
    </form>
  );
}
