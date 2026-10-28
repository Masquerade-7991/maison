"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { logout, track } from "@/lib/analytics";
import { announceBagChange } from "@/lib/cart-rules";
import { requestDeletionAction } from "@/lib/account-actions";

const longDate = (d: Date) => new Intl.DateTimeFormat("en-GB", { dateStyle: "long" }).format(d);

/**
 * The account page's "Delete account" section and its confirmation in a native <dialog>: the visitor types
 * the account's email to enable the button, and is told deletion completes within 14 days, not at once.
 * `blocked` (from the server) explains why it can't be requested now, e.g. an order in progress; `days` and
 * `estimate` come from src/lib/account-deletion.ts, the same rule that schedules it.
 */
export function DeleteAccount({ email, blocked, days, estimate }: { email: string; blocked: string | null; days: number; estimate: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const loggedOut = useRef<Promise<void>>(null);
  // Signed out on the server already: leave for the home page, and let the header forget the bag.
  const leave = async () => {
    await loggedOut.current;
    announceBagChange();
    router.replace("/");
    router.refresh();
  };
  const [typed, setTyped] = useState("");
  const [state, action, pending] = useActionState(requestDeletionAction, null);
  const matches = typed.trim().toLowerCase() === email.toLowerCase();
  const scheduled = state && "scheduledFor" in state ? new Date(state.scheduledFor) : null;
  useEffect(() => {
    if (!state || !("scheduledFor" in state)) return;
    track("Account Deletion Requested", {});
    loggedOut.current = logout(); // analytics forgets the customer too; `leave` waits for it
  }, [state]);

  return (
    <section aria-labelledby="delete-account-title" className="mt-16 border border-danger p-6 md:p-8">
      <p className="label text-danger">Delete account</p>
      <h2 id="delete-account-title" className="mt-3 text-display-sm">Delete your Maison account</h2>
      <p className="mt-4 max-w-xl text-muted">
        This removes your details, saved bag and back-in-stock alerts. It isn&apos;t instant: your account is deleted automatically within {days} days,
        and you can change your mind until then.
      </p>
      <button type="button" onClick={() => dialog.current?.showModal()} className="btn btn-danger mt-6 sm:w-auto">
        Delete account
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="delete-dialog-title"
        onClose={() => scheduled && leave()}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto border border-line bg-paper p-0 text-ink backdrop:bg-black/60"
      >
        <div className="flex items-start justify-between gap-6 border-b border-line px-6 py-5 md:px-8">
          <div>
            <p className="label text-danger">Delete account</p>
            <h2 id="delete-dialog-title" className="mt-2 text-display-sm">{scheduled ? "Deletion scheduled" : "Delete your account?"}</h2>
          </div>
          <button type="button" onClick={() => dialog.current?.close()} aria-label="Close" className="label link-nav mt-1 text-muted hover:text-ink">
            Close
          </button>
        </div>

        <div className="px-6 py-6 md:px-8">
          {scheduled ? (
            <div role="status">
              <p>
                Your account will be deleted automatically on <span className="font-medium">{longDate(scheduled)}</span>. You&apos;ve been signed out on every
                device, and we&apos;ve emailed you the details.
              </p>
              <p className="mt-3 text-muted">Changed your mind? Sign in before then and choose &ldquo;Keep my account&rdquo;.</p>
              <button type="button" onClick={leave} className="btn btn-primary mt-6 sm:w-full">
                Done
              </button>
            </div>
          ) : (
            <>
              <p className="border-l-2 border-danger pl-4">
                Account deletion isn&apos;t instant. It will be <span className="font-medium">completed automatically within {days} days</span>, around{" "}
                {longDate(new Date(estimate))}. Until then you can sign in and keep your account.
              </p>
              <ul className="mt-5 list-disc space-y-1 pl-5 text-muted">
                <li>Deleted: your name, email, password, saved bag and back-in-stock alerts.</li>
                <li>Kept: records of past orders, without your name, email or address, as accounting rules require.</li>
                <li>You&apos;ll be signed out on every device straight away.</li>
              </ul>

              {blocked ? (
                <p role="alert" className="mt-6 text-danger">{blocked}</p>
              ) : (
                // A real form, so Enter submits once the email matches.
                <form action={action} className="mt-6">
                  <label htmlFor="delete-email" className="label text-muted">
                    Type <span className="text-ink normal-case tracking-normal">{email}</span> to confirm
                  </label>
                  <input
                    id="delete-email"
                    name="email"
                    type="email"
                    autoComplete="off"
                    spellCheck={false}
                    value={typed}
                    onChange={(e) => setTyped(e.currentTarget.value)}
                    aria-invalid={state && "error" in state ? true : undefined}
                    aria-describedby={state && "error" in state ? "delete-error" : undefined}
                    className="field mt-2"
                  />
                  {state && "error" in state && <p id="delete-error" role="alert" className="mt-3 text-danger">{state.error}</p>}
                  <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse">
                    <button type="submit" disabled={!matches || pending} className="btn btn-danger disabled:cursor-not-allowed disabled:opacity-40 sm:flex-1">
                      {pending ? "Scheduling…" : "Delete my account"}
                    </button>
                    <button type="button" onClick={() => dialog.current?.close()} className="btn btn-secondary sm:flex-1">
                      Keep my account
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </dialog>
    </section>
  );
}
