"use client";

import Link from "next/link";
import { useActionState } from "react";
import { stockAlertAction } from "@/lib/alert-actions";

/**
 * "Notify me when it's back" under a sold-out piece. The product page is static, so whether the visitor is
 * signed in is only learned when they press it: signed out, it becomes a sign-in link back to this page.
 */
export function StockAlert({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(stockAlertAction, null);
  const next = `/sign-in?next=${encodeURIComponent(`/products/${slug}`)}`;

  if (state?.signIn) {
    return (
      <div className="mt-3">
        <Link href={next} className="btn btn-secondary sm:w-full">Sign in to be notified</Link>
        <p className="mt-3 text-muted">We&apos;ll email the address on your account when this piece is back.</p>
      </div>
    );
  }

  return (
    <form action={action} className="mt-3">
      <input type="hidden" name="slug" value={slug} />
      {state?.on ? (
        <p role="status" className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-l-2 border-ink pl-4">
          <span>We&apos;ll email {state.email} when it&apos;s back.</span>
          <button type="submit" name="want" value="off" disabled={pending} className="label link-nav cursor-pointer text-muted hover:text-ink disabled:cursor-wait">
            Undo
          </button>
        </p>
      ) : (
        <button type="submit" name="want" value="on" disabled={pending} className="btn btn-secondary sm:w-full">
          {pending && <span aria-hidden className="size-3.5 animate-spin rounded-full border border-current border-t-transparent" />}
          Notify me when it&apos;s back
        </button>
      )}
      {state?.error && <p role="alert" className="mt-3 text-danger">{state.error}</p>}
    </form>
  );
}
