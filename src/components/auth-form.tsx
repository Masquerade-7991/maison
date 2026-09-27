"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { authClient } from "@/lib/auth-client";
import {
  PASSWORD_MAX,
  PASSWORD_MIN,
  validate,
  validateField,
  type AuthErrors,
  type AuthField,
  type AuthMode,
} from "@/lib/auth-validation";

// Server error codes that belong to one field; everything else is shown above the button.
const fieldErrors: Record<string, [AuthField, string]> = {
  INVALID_EMAIL: ["email", "Enter a valid email address, like name@example.com."],
  PASSWORD_TOO_SHORT: ["password", `Use at least ${PASSWORD_MIN} characters.`],
  PASSWORD_TOO_LONG: ["password", `Use at most ${PASSWORD_MAX} characters.`],
};
const formErrors: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Email or password is incorrect.",
};

// Calls go through the /api/auth routes (not Server Actions) so Better Auth's rate limiting applies.
export function AuthForm({ mode, next }: { mode: AuthMode; next: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<AuthErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const focus = (field: AuthField) => (formRef.current?.elements.namedItem(field) as HTMLInputElement | null)?.focus();

  // Validate on blur, then live while the field is wrong, so errors clear as soon as they're fixed.
  const check = (field: AuthField, value: string, always: boolean) => {
    if (!always && !errors[field]) return;
    setErrors((e) => ({ ...e, [field]: validateField(mode, field, value) }));
  };
  const fieldProps = (field: AuthField) => ({
    id: field,
    name: field,
    "aria-invalid": errors[field] ? true : undefined,
    "aria-describedby": [errors[field] && `${field}-error`, field === "password" && mode === "sign-up" && "password-hint"]
      .filter(Boolean)
      .join(" ") || undefined,
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => e.currentTarget.value && check(field, e.currentTarget.value, true),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => check(field, e.currentTarget.value, false),
    className: "field",
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const values = { name: String(form.get("name") ?? ""), email: String(form.get("email")).trim(), password: String(form.get("password")) };
    setFormError(null);
    setNotice(null);

    const found = validate(mode, values);
    setErrors(found);
    const firstInvalid = (["name", "email", "password"] as const).find((f) => found[f]);
    if (firstInvalid) return focus(firstInvalid);

    // Where the verification link lands: sign-in, which forwards a now-signed-in visitor to `next`.
    const callbackURL = `${window.location.origin}/sign-in?next=${encodeURIComponent(next)}`;
    setPending(true);
    try {
      const { error } =
        mode === "sign-up"
          ? await authClient.signUp.email({ name: values.name.trim(), email: values.email, password: values.password, callbackURL })
          : await authClient.signIn.email({ email: values.email, password: values.password, callbackURL });

      if (!error && mode === "sign-in") {
        router.replace(next);
        router.refresh();
        return; // stay "pending" while the next page loads
      }
      // Re-enable the fieldset now, so a field can take focus below (disabled inputs can't).
      flushSync(() => setPending(false));
      if (!error) return setSentTo(values.email);
      const code = error.code ?? "";
      if (code === "EMAIL_NOT_VERIFIED") {
        setNotice(`Please verify your email first. We've sent a new link to ${values.email}.`);
      } else if (fieldErrors[code]) {
        const [field, message] = fieldErrors[code];
        setErrors({ [field]: message });
        focus(field);
      } else {
        setFormError(
          error.status === 429
            ? "Too many attempts. Please wait a minute and try again."
            : (formErrors[code] ?? "Something went wrong. Please try again."),
        );
      }
    } catch {
      setPending(false);
      setFormError("We couldn't reach Maison. Check your connection and try again.");
    }
  }

  if (sentTo) {
    return (
      <div role="status" className="text-center">
        <p className="text-display-sm">Check your inbox</p>
        <p className="mt-3">
          We&apos;ve sent a link to <span className="font-medium">{sentTo}</span>.
        </p>
        <p className="mt-2 text-muted">Open it within an hour to confirm your account and sign in.</p>
        <p className="mt-6 text-muted">
          Nothing there? Check your spam folder, or{" "}
          <button
            type="button"
            className="link text-ink"
            onClick={() => {
              setSentTo(null);
              setShowPassword(false);
            }}
          >
            use a different email
          </button>
          .
        </p>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate aria-busy={pending}>
      <fieldset disabled={pending} className="space-y-6">
        {mode === "sign-up" && (
          <div>
            <label htmlFor="name" className="label text-muted">Name</label>
            <input {...fieldProps("name")} autoComplete="name" maxLength={100} />
            <FieldError field="name" errors={errors} />
          </div>
        )}

        <div>
          <label htmlFor="email" className="label text-muted">Email</label>
          <input {...fieldProps("email")} type="email" inputMode="email" autoComplete="email" spellCheck={false} autoCapitalize="none" />
          <FieldError field="email" errors={errors} />
        </div>

        <div>
          <label htmlFor="password" className="label text-muted">Password</label>
          <div className="relative">
            <input
              {...fieldProps("password")}
              type={showPassword ? "text" : "password"}
              autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
              maxLength={PASSWORD_MAX}
              className="field pr-16"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-controls="password"
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="label link-nav absolute right-0 bottom-0 flex h-12 items-center text-muted hover:text-ink"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          {mode === "sign-up" && !errors.password && (
            <p id="password-hint" className="mt-2 text-muted">At least {PASSWORD_MIN} characters.</p>
          )}
          <FieldError field="password" errors={errors} />
        </div>

        {notice && <p role="status" className="border-l-2 border-ink pl-4">{notice}</p>}
        {formError && <p role="alert" className="border-l-2 border-danger pl-4 text-danger">{formError}</p>}

        <button type="submit" className="btn btn-primary sm:w-full">
          {pending && <span aria-hidden className="size-3.5 animate-spin rounded-full border border-current border-t-transparent" />}
          {pending ? (mode === "sign-up" ? "Creating account…" : "Signing in…") : mode === "sign-up" ? "Create account" : "Sign in"}
        </button>
      </fieldset>
    </form>
  );
}

function FieldError({ field, errors }: { field: AuthField; errors: AuthErrors }) {
  if (!errors[field]) return null;
  return (
    <p id={`${field}-error`} className="mt-2 text-danger">
      {errors[field]}
    </p>
  );
}
