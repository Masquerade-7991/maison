import type { Metadata } from "next";
import { DeleteAccount, KeepAccountButton } from "@/components/delete-account";
import { DELETION_DAYS, deletionBlocker, deletionDate, getDeletion } from "@/lib/account-deletion";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Account details | Maison" };

const date = new Intl.DateTimeFormat("en", { dateStyle: "long" });

export default async function AccountDetailsPage() {
  const { user } = await requireUser("/account");
  const [deletion, blocked] = await Promise.all([getDeletion(user.id), deletionBlocker(user)]);

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
      {deletion && (
        <section role="status" className="mb-10 border border-danger p-6 md:p-8">
          <p className="label text-danger">Deletion scheduled</p>
          <p className="mt-3 text-display-sm">Your account will be deleted on {date.format(deletion.scheduledFor)}</p>
          <p className="mt-3 text-muted">You asked to delete your account on {date.format(deletion.requestedAt)}. Keep it, and everything stays as it was.</p>
          <div className="mt-6">
            <KeepAccountButton />
          </div>
        </section>
      )}
      <h2 className="label">Account details</h2>
      <dl className="mt-4 border-b border-line">
        {rows.map((r) => (
          <div key={r.label} className="rule grid gap-2 py-5 sm:grid-cols-[10rem_1fr] sm:gap-6">
            <dt className="label text-muted">{r.label}</dt>
            <dd className="min-w-0">{r.value}</dd>
          </div>
        ))}
      </dl>
      {!deletion && <DeleteAccount userId={user.id} name={user.name} email={user.email} blocked={blocked} days={DELETION_DAYS} estimate={deletionDate().toISOString()} />}
    </>
  );
}
