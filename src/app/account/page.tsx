import type { Metadata } from "next";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Account details | Maison" };

const date = new Intl.DateTimeFormat("en", { dateStyle: "long" });

export default async function AccountDetailsPage() {
  const { user } = await requireUser("/account");

  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Name", value: user.name },
    {
      label: "Email",
      value: (
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="break-all">{user.email}</span>
          {user.emailVerified && <span className="label text-muted">Verified</span>}
        </span>
      ),
    },
    { label: "Member since", value: date.format(user.createdAt) },
    ...(user.role === "admin" ? [{ label: "Access", value: "Administrator" }] : []),
  ];

  return (
    <>
      <h2 className="label">Account details</h2>
      <dl className="mt-4 border-b border-line">
        {rows.map((r) => (
          <div key={r.label} className="rule grid gap-2 py-5 sm:grid-cols-[10rem_1fr] sm:gap-6">
            <dt className="label text-muted">{r.label}</dt>
            <dd className="min-w-0">{r.value}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
