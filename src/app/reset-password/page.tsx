import type { Metadata } from "next";
import { ResetLinkExpired, ResetPasswordForm } from "@/components/password-reset-forms";

export const metadata: Metadata = { title: "Choose a new password | Maison", robots: { index: false } };

// Better Auth's /api/auth/reset-password/:token checks the emailed link, then redirects here with
// ?token=… (valid) or ?error=INVALID_TOKEN (expired or used). The token is checked again on save.
export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" && /^[A-Za-z0-9_-]{10,200}$/.test(sp.token) ? sp.token : null;

  return (
    <section className="container-page py-12 md:py-20">
      <div className="mx-auto max-w-md">
        {token && sp.error === undefined ? (
          <>
            <div className="text-center">
              <h1 className="text-display-sm">Choose a new password</h1>
              <p className="mt-3 text-muted">Use one you don&apos;t use anywhere else.</p>
            </div>
            <div className="mt-8 md:mt-10 md:border md:border-line md:p-10">
              <ResetPasswordForm token={token} />
            </div>
          </>
        ) : (
          <ResetLinkExpired />
        )}
      </div>
    </section>
  );
}
