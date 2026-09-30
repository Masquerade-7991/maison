import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ForgotPasswordForm } from "@/components/password-reset-forms";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Forgot password | Maison" };

export default async function ForgotPasswordPage() {
  if (await getSession()) redirect("/account");

  return (
    <section className="container-page py-12 md:py-20">
      <div className="mx-auto max-w-md">
        <div className="text-center">
          <h1 className="text-display-sm">Forgot your password?</h1>
          <p className="mt-3 text-muted">Enter your email and we&apos;ll send you a link to choose a new one.</p>
        </div>
        <div className="mt-8 md:mt-10 md:border md:border-line md:p-10">
          <ForgotPasswordForm />
        </div>
        <p className="mt-8 text-center text-muted">
          Remembered it?{" "}
          <Link href="/sign-in" className="link text-ink">Sign in</Link>
        </p>
      </div>
    </section>
  );
}
