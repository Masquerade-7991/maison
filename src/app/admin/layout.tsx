import type { Metadata } from "next";
import { AdminNav } from "@/components/admin-nav";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { robots: { index: false } };

// Shell for every /admin page. It is NOT the access check: layouts don't re-render on client
// navigation, so each page calls requireAdmin() and each action assertAdmin() itself. The session is
// read here only so a non-admin's 404 (rendered inside this layout) shows no admin chrome at all.
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const session = await getSession();
  if (session?.user.role !== "admin") return children;

  return (
    <section className="container-page py-12 md:py-20">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-line pb-8 md:pb-10">
        <div>
          <p className="label text-muted">Maison</p>
          <h1 className="mt-3 text-display-sm">Admin</h1>
        </div>
        <p className="text-muted">Signed in as {session.user.email}</p>
      </header>
      <div className="mt-6 grid grid-cols-1 gap-8 md:mt-10 md:grid-cols-12 md:gap-10">
        <div className="md:col-span-3 lg:col-span-2">
          <AdminNav />
        </div>
        <div className="min-w-0 md:col-span-9 lg:col-span-10">{children}</div>
      </div>
    </section>
  );
}
