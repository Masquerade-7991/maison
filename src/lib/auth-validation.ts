// Client-side checks for the sign-in / sign-up form. Better Auth re-validates everything on the
// server; these only give instant, per-field feedback in the site's own style.
export type AuthMode = "sign-in" | "sign-up";
export type AuthField = "name" | "email" | "password";
export type AuthValues = Record<AuthField, string>;
export type AuthErrors = Partial<Record<AuthField, string>>;

export const PASSWORD_MIN = 8; // matches minPasswordLength in src/lib/auth.ts
export const PASSWORD_MAX = 128; // Better Auth's default maximum

// ponytail: shape check only (something@something.tld); the server and the verification email are the real test.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateField(mode: AuthMode, field: AuthField, value: string): string | undefined {
  if (field === "name") {
    if (mode === "sign-in") return;
    return value.trim() ? undefined : "Enter your name.";
  }
  if (field === "email") {
    if (!value.trim()) return "Enter your email address.";
    return EMAIL.test(value.trim()) ? undefined : "Enter a valid email address, like name@example.com.";
  }
  if (!value) return "Enter your password.";
  if (mode === "sign-in") return; // don't hint at the rules when signing in
  if (value.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (value.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
}

export function validate(mode: AuthMode, values: AuthValues): AuthErrors {
  const errors: AuthErrors = {};
  for (const field of ["name", "email", "password"] as const) {
    const error = validateField(mode, field, values[field]);
    if (error) errors[field] = error;
  }
  return errors;
}
