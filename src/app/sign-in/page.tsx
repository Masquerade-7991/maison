import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getSession, safeNext } from "@/lib/session";

export const metadata: Metadata = { title: "Sign in | Maison" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const sp = await searchParams;
  const next = safeNext(first(sp.next));
  // Also where a verification link lands: autoSignInAfterVerification has just signed them in.
  if (await getSession()) redirect(next);
  const linkFailed = first(sp.error) !== undefined;

  return (
    <section className="container-page py-12 md:py-20">
      <div className="mx-auto max-w-md">
        <div className="text-center">
          <h1 className="text-display-sm">Sign in</h1>
          <p className="mt-3 text-muted">Welcome back. Sign in to your Maison account.</p>
        </div>
        {/* Bordered panel from tablet up; on phones the form runs edge to edge like the rest of the site. */}
        <div className="mt-8 md:mt-10 md:border md:border-line md:p-10">
          {linkFailed && (
            <p role="alert" className="mb-8 border-l-2 border-danger pl-4 text-danger">
              That verification link has expired or was already used. Sign in and we&apos;ll send you a new one.
            </p>
          )}
          <AuthForm mode="sign-in" next={next} />
        </div>
        <p className="mt-8 text-center text-muted">
          New to Maison?{" "}
          <Link href={`/sign-up?next=${encodeURIComponent(next)}`} className="link text-ink">
            Create an account
          </Link>
        </p>
      </div>
    </section>
  );
}
