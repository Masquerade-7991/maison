"use client";

import Link from "next/link";
import { useActionState } from "react";
import { addToBagAction } from "@/lib/cart-actions";

// Posts only the slug and the chosen size; price and stock are read on the server.
// The product page stays static: the session is only read when the action runs.
export function AddToBagForm({ slug, sizes, buyable }: { slug: string; sizes: string[]; buyable: boolean }) {
  const [state, action, pending] = useActionState(addToBagAction, null);

  return (
    <form action={action} className="mt-6">
      <input type="hidden" name="slug" value={slug} />
      {sizes.length > 0 ? (
        <fieldset disabled={!buyable || pending}>
          <legend className="label text-muted">Size</legend>
          <div className={`mt-3 grid gap-1 ${sizes.length > 5 ? "grid-cols-4" : "grid-cols-5"}`}>
            {sizes.map((s) => (
              <label
                key={s}
                className="flex h-11 cursor-pointer items-center justify-center border border-line text-sm transition-colors hover:border-ink has-checked:border-ink has-checked:bg-ink has-checked:text-paper has-focus-visible:outline has-focus-visible:outline-offset-2 has-disabled:cursor-not-allowed has-disabled:text-muted has-disabled:hover:border-line"
              >
                <input type="radio" name="size" value={s} required className="sr-only" />
                {s}
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <p className="text-muted">One size</p>
      )}

      <button type="submit" disabled={!buyable || pending} className="btn btn-primary mt-6 sm:w-full">
        {pending && <span aria-hidden className="size-3.5 animate-spin rounded-full border border-current border-t-transparent" />}
        {!buyable ? "Sold out" : pending ? "Adding…" : "Add to bag"}
      </button>

      <div aria-live="polite" className="min-h-6">
        {state && (
          <p className={`mt-4 ${state.ok ? "" : "text-danger"}`}>
            {state.message}{" "}
            {state.ok && <Link href="/bag" className="link">View bag</Link>}
          </p>
        )}
      </div>
    </form>
  );
}
