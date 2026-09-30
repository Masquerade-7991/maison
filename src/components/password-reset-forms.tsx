"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { PASSWORD_MAX, PASSWORD_MIN, validateField } from "@/lib/auth-validation";

// Both forms call Better Auth's /api/auth routes (not Server Actions), so its rate limiting applies.
// The reset link itself only ever travels by email (or the server log while email is off).

const Spinner = () => <span aria-hidden className="size-3.5 animate-spin rounded-full border border-current border-t-transparent" />;

function FieldError({ id, error }: { id: string; error?: string }) {
  return error ? <p id={`${id}-error`} className="mt-2 text-danger">{error}</p> : null;
}

/** Asks for a reset link. The reply is the same whether or not an account exists, so it reveals nothing. */
export function ForgotPasswordForm() {
  const [error, setError] = useState<string>();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    const invalid = validateField("sign-in", "email", email);
    setError(invalid);
    setFormError(null);
    if (invalid) return;
    setPending(true);
    const { error: failed } = await authClient.requestPasswordReset({ email, redirectTo: `${window.location.origin}/reset-password` });
    setPending(false);
    if (failed) return setFormError(failed.status === 429 ? "Too many requests. Please wait a few minutes and try again." : "Something went wrong. Please try again.");
    setSentTo(email);
  }

  if (sentTo) {
    return (
      <div role="status" className="text-center">
        <p className="text-display-sm">Check your inbox</p>
        <p className="mt-3">
          If an account exists for <span className="font-medium">{sentTo}</span>, we&apos;ve sent a link to reset its password.
        </p>
        <p className="mt-2 text-muted">It works once and expires in an hour.</p>
        <p className="mt-6 text-muted">
          <Link href="/sign-in" className="link text-ink">Back to sign in</Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={pending}>
      <fieldset disabled={pending} className="space-y-6">
        <div>
          <label htmlFor="email" className="label text-muted">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            spellCheck={false}
            autoCapitalize="none"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "email-error" : undefined}
            className="field"
          />
          <FieldError id="email" error={error} />
        </div>
        {formError && <p role="alert" className="border-l-2 border-danger pl-4 text-danger">{formError}</p>}
        <button type="submit" className="btn btn-primary sm:w-full">
          {pending && <Spinner />}
          {pending ? "Sending…" : "Send reset link"}
        </button>
      </fieldset>
    </form>
  );
}

/** Sets the new password for the token Better Auth checked before redirecting here. */
export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    const found = {
      password: validateField("sign-up", "password", password),
      confirm: password && confirm !== password ? "The two passwords don't match." : undefined,
    };
    setErrors(found);
    setFormError(null);
    if (found.password || found.confirm) return;
    setPending(true);
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    if (!error) {
      router.replace("/sign-in?reset=1");
      return; // stay "pending" while sign-in loads
    }
    setPending(false);
    if (error.code === "INVALID_TOKEN") setExpired(true);
    else if (error.code === "PASSWORD_TOO_SHORT") setErrors({ password: `Use at least ${PASSWORD_MIN} characters.` });
    else if (error.code === "PASSWORD_TOO_LONG") setErrors({ password: `Use at most ${PASSWORD_MAX} characters.` });
    else setFormError(error.status === 429 ? "Too many attempts. Please wait a minute and try again." : "Something went wrong. Please try again.");
  }

  if (expired) return <ResetLinkExpired />;

  const describe = (id: "password" | "confirm") => (errors[id] ? `${id}-error` : id === "password" ? "password-hint" : undefined);
  return (
    <form onSubmit={onSubmit} noValidate aria-busy={pending}>
      <fieldset disabled={pending} className="space-y-6">
        <div>
          <label htmlFor="password" className="label text-muted">New password</label>
          <input id="password" name="password" type="password" autoComplete="new-password" maxLength={PASSWORD_MAX} aria-invalid={errors.password ? true : undefined} aria-describedby={describe("password")} className="field" />
          {!errors.password && <p id="password-hint" className="mt-2 text-muted">At least {PASSWORD_MIN} characters.</p>}
          <FieldError id="password" error={errors.password} />
        </div>
        <div>
          <label htmlFor="confirm" className="label text-muted">Confirm new password</label>
          <input id="confirm" name="confirm" type="password" autoComplete="new-password" maxLength={PASSWORD_MAX} aria-invalid={errors.confirm ? true : undefined} aria-describedby={describe("confirm")} className="field" />
          <FieldError id="confirm" error={errors.confirm} />
        </div>
        {formError && <p role="alert" className="border-l-2 border-danger pl-4 text-danger">{formError}</p>}
        <button type="submit" className="btn btn-primary sm:w-full">
          {pending && <Spinner />}
          {pending ? "Saving…" : "Save new password"}
        </button>
        <p className="text-muted">Saving signs this account out on every device.</p>
      </fieldset>
    </form>
  );
}

export function ResetLinkExpired() {
  return (
    <div role="alert" className="text-center">
      <p className="text-display-sm">This link has expired</p>
      <p className="mt-3 text-muted">Reset links work once and expire after an hour. Ask for a new one and use the newest email.</p>
      <Link href="/forgot-password" className="btn btn-primary mt-8 sm:w-full">Get a new link</Link>
    </div>
  );
}
