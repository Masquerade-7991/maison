import { AccountNav } from "@/components/account-nav";
import { getSession } from "@/lib/session";

// Shell for every /account page. It reads the session for display only (greeting, Admin link):
// layouts don't re-render on client navigation, so each page does its own requireUser().
export default async function AccountLayout({ children }: LayoutProps<"/account">) {
  const session = await getSession();
  const firstName = session?.user.name.trim().split(/\s+/)[0];

  return (
    <section className="container-page py-12 md:py-20">
      <header className="border-b border-line pb-8 md:pb-10">
        <p className="label text-muted">My account</p>
        <h1 className="mt-3 text-display-sm">{firstName ? `Hello, ${firstName}` : "Your account"}</h1>
      </header>
      <div className="mt-6 grid gap-8 md:mt-10 md:grid-cols-12 md:gap-10">
        <div className="md:col-span-3">
          <AccountNav isAdmin={session?.user.role === "admin"} />
        </div>
        <div className="md:col-span-9 lg:col-span-7">{children}</div>
      </div>
    </section>
  );
}
