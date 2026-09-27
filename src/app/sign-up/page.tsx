import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getSession, safeNext } from "@/lib/session";

export const metadata: Metadata = { title: "Create an account | Maison" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  const next = safeNext(first((await searchParams).next));
  if (await getSession()) redirect(next);

  return (
    <section className="container-page py-12 md:py-20">
      <div className="mx-auto max-w-md">
        <div className="text-center">
          <h1 className="text-display-sm">Create an account</h1>
          <p className="mt-3 text-muted">We&apos;ll email you a link to confirm your address.</p>
        </div>
        {/* Bordered panel from tablet up; on phones the form runs edge to edge like the rest of the site. */}
        <div className="mt-8 md:mt-10 md:border md:border-line md:p-10">
          <AuthForm mode="sign-up" next={next} />
        </div>
        <p className="mt-8 text-center text-muted">
          Already have an account?{" "}
          <Link href={`/sign-in?next=${encodeURIComponent(next)}`} className="link text-ink">
            Sign in
          </Link>
        </p>
      </div>
    </section>
  );
}
