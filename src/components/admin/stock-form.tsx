"use client";

import { useActionState } from "react";
import { updateStockAction } from "@/app/admin/stock/actions";
import { Spinner } from "@/components/admin/form-parts";
import { MAX_STOCK } from "@/lib/admin-rules";

/** One product's quantity. Posts the number it loaded, so a sale made meanwhile isn't overwritten. */
export function StockForm({ productId, name, stock }: { productId: string; name: string; stock: number }) {
  const [state, formAction, pending] = useActionState(updateStockAction, null);
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
