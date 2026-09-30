"use client";

import { useActionState, useRef, useState } from "react";
import { sendContactAction, type ContactState } from "@/lib/contact-actions";
import { CONTACT_TOPICS, MESSAGE_MAX, type ContactField } from "@/lib/contact-rules";

const Spinner = () => <span aria-hidden className="size-3.5 animate-spin rounded-full border border-current border-t-transparent" />;

/**
 * "Write to us" and the contact form in a native <dialog>: the browser handles focus, Escape and the
 * backdrop. Signed-in customers get their name and email filled in.
 */
export function ContactModal({ name = "", email = "" }: { name?: string; email?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [round, setRound] = useState(0); // a new form (fresh state) each time a sent message is closed
  const [sent, setSent] = useState(false);

  const close = () => {
    dialog.current?.close();
  };
  const onClose = () => {
    if (sent) {
      setSent(false);
      setRound((r) => r + 1);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          dialog.current?.showModal();
          // React doesn't render autoFocus as an attribute, so showModal() would land on Close: start in Name.
          dialog.current?.querySelector<HTMLInputElement>("#contact-name")?.focus();
        }}
        className="btn btn-primary sm:w-auto sm:px-10"
      >
        Write to us
      </button>
      <dialog
        ref={dialog}
        onClose={onClose}
        aria-labelledby="contact-title"
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto border border-line bg-paper p-0 text-ink backdrop:bg-black/60"
      >
        <div className="flex items-start justify-between gap-6 border-b border-line px-6 py-5 md:px-10">
          <div>
            <p className="label text-muted">Client services</p>
            <h2 id="contact-title" className="mt-2 text-display-sm">Write to us</h2>
          </div>
          <button type="button" onClick={close} aria-label="Close" className="label link-nav mt-1 text-muted hover:text-ink">
            Close
          </button>
        </div>
        <div className="px-6 py-8 md:px-10">
          <ContactForm key={round} name={name} email={email} onSent={() => setSent(true)} onDone={close} />
        </div>
      </dialog>
    </>
  );
}

function ContactForm({ name, email, onSent, onDone }: { name: string; email: string; onSent: () => void; onDone: () => void }) {
  // `round` counts server replies: React 19 resets the form after each action and restores inputs from
  // defaultValue, but not a <select>, so the topic select is keyed on it to come back with the kept value.
  const [state, formAction, pending] = useActionState(
    async (prev: (ContactState & { round?: number }) | null, fd: FormData) => {
      const next = await sendContactAction(prev, fd);
      if (next?.sent) onSent();
      return next && { ...next, round: (prev?.round ?? 0) + 1 };
    },
    null,
  );

  if (state?.sent) {
    return (
      <div role="status" className="text-center">
        <p className="text-display-sm">Thank you, {state.name}.</p>
        <p className="mt-4 text-muted">
          Your message has reached our client advisors. We usually reply within one working day, by email.
        </p>
        <button type="button" onClick={onDone} className="btn btn-primary mt-8 sm:w-full" autoFocus>
          Close
        </button>
      </div>
    );
  }

  const errors = state?.errors ?? {};
  const v = (field: string, fallback = "") => state?.values?.[field] ?? fallback;
  const props = (field: ContactField) => ({
    id: `contact-${field}`,
    name: field,
    "aria-invalid": errors[field] ? true : undefined,
    "aria-describedby": errors[field] ? `contact-${field}-error` : undefined,
  });
  const error = (field: ContactField) =>
    errors[field] ? <p id={`contact-${field}-error`} className="mt-2 text-danger">{errors[field]}</p> : null;

  return (
    <form action={formAction} noValidate aria-busy={pending}>
      <fieldset disabled={pending} className="space-y-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <label htmlFor="contact-name" className="label text-muted">Name</label>
            <input {...props("name")} defaultValue={v("name", name)} autoComplete="name" maxLength={100} className="field" />
            {error("name")}
          </div>
          <div>
            <label htmlFor="contact-email" className="label text-muted">Email</label>
            <input {...props("email")} defaultValue={v("email", email)} type="email" inputMode="email" autoComplete="email" spellCheck={false} autoCapitalize="none" className="field" />
            {error("email")}
          </div>
          <div>
            <label htmlFor="contact-topic" className="label text-muted">Topic</label>
            <select key={state?.round ?? 0} {...props("topic")} defaultValue={v("topic", "")} className="field">
              <option value="" disabled>Choose…</option>
              {CONTACT_TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            {error("topic")}
          </div>
          <div>
            <label htmlFor="contact-orderRef" className="label text-muted">Order reference <span className="normal-case">(optional)</span></label>
            <input {...props("orderRef")} defaultValue={v("orderRef")} placeholder="e.g. MSN-1A2B3C4D" autoCapitalize="characters" spellCheck={false} maxLength={20} className="field" />
            {error("orderRef")}
          </div>
        </div>
        <div>
          <label htmlFor="contact-message" className="label text-muted">Message</label>
          <textarea {...props("message")} defaultValue={v("message")} rows={5} maxLength={MESSAGE_MAX} className="field py-3 leading-relaxed" />
          {error("message")}
        </div>

        {/* Hidden from people; bots that fill it in are thanked and ignored. */}
        <div aria-hidden className="absolute left-[-9999px] size-px overflow-hidden">
          <label htmlFor="contact-website">Leave this empty</label>
          <input id="contact-website" name="website" tabIndex={-1} autoComplete="off" />
        </div>

        {state?.error && <p role="alert" className="border-l-2 border-danger pl-4 text-danger">{state.error}</p>}
        {state?.errors && <p role="alert" className="border-l-2 border-danger pl-4 text-danger">Please correct the highlighted fields.</p>}

        <button type="submit" className="btn btn-primary sm:w-full">
          {pending && <Spinner />}
          {pending ? "Sending…" : "Send message"}
        </button>
        <p className="text-muted">We use your details only to reply to this message.</p>
      </fieldset>
    </form>
  );
}
