"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { removeFromBagAction, updateQuantityAction } from "@/lib/cart-actions";
import type { BagIssue } from "@/lib/cart-rules";

type Props = { slug: string; size: string; quantity: number; max: number; name: string; issue: BagIssue };

// − quantity + stepper and Remove for one bag line. Each button posts the quantity it would set;
// the server re-checks stock either way, `max` only decides which buttons are offered.
export function BagLineControls({ slug, size, quantity, max, name, issue }: Props) {
  const [state, action, pending] = useActionState(updateQuantityAction, null);
  const label = `${name}${size ? `, size ${size}` : ""}`;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {issue !== "sold_out" && (
          <form action={action} aria-busy={pending}>
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="size" value={size} />
            <div className={`flex h-10 items-stretch border border-line transition-opacity ${pending ? "opacity-50" : ""}`}>
              <StepButton value={quantity - 1} disabled={pending || quantity <= 1} label={`Decrease quantity of ${label}`}>
                <span aria-hidden className="h-px w-2.5 bg-current" />
              </StepButton>
              <output aria-label={`Quantity of ${label}`} className="flex w-10 items-center justify-center text-sm tabular-nums">
                {quantity}
              </output>
              <StepButton value={quantity + 1} disabled={pending || quantity >= max} label={`Increase quantity of ${label}`}>
                <span aria-hidden className="relative block h-px w-2.5 bg-current after:absolute after:inset-0 after:rotate-90 after:bg-current" />
              </StepButton>
            </div>
          </form>
        )}

        {/* Stock fell below what's in the bag: one click sets the most that's still available. */}
        {issue === "over_stock" && max >= 1 && (
          <form action={action}>
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="size" value={size} />
            <button type="submit" name="quantity" value={max} disabled={pending} className="label link cursor-pointer">
              Update to {max}
            </button>
          </form>
        )}

        <form action={removeFromBagAction}>
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="size" value={size} />
          <RemoveButton label={label} emphasise={issue === "sold_out"} />
        </form>
      </div>
      {state && !state.ok && <p role="alert" className="mt-3 text-danger">{state.message}</p>}
    </div>
  );
}

function StepButton({ value, disabled, label, children }: { value: number; disabled: boolean; label: string; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      name="quantity"
      value={value}
      disabled={disabled}
      aria-label={label}
      className="flex w-10 cursor-pointer items-center justify-center text-ink transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:text-line disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function RemoveButton({ label, emphasise }: { label: string; emphasise: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={`Remove ${label} from your bag`}
      className={`label link-nav cursor-pointer disabled:cursor-wait ${emphasise ? "text-ink underline underline-offset-4" : "text-muted hover:text-ink"}`}
    >
      {pending ? "Removing…" : "Remove"}
    </button>
  );
}
