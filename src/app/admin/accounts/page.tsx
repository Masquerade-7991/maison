import type { Metadata } from "next";
import { RoleForm } from "@/components/admin/role-form";
import { roles } from "@/lib/auth";
import { requireAdmin } from "@/lib/session";
import { listUsers } from "@/lib/users";

export const metadata: Metadata = { title: "Accounts | Admin | Maison" };

const date = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

export default async function AccountsPage() {
  const { user: me } = await requireAdmin("/admin/accounts");
  const users = await listUsers();

  return (
    <>
      <h2 className="label">Accounts ({users.length})</h2>
      <ul className="mt-4 border-b border-line">
        {users.map((u) => (
          <li key={u.id} className="rule grid gap-4 py-5 md:grid-cols-[1fr_auto] md:items-center">
            <div className="min-w-0">
              <p className="truncate">{u.name}</p>
              <p className="truncate text-muted">{u.email}</p>
              <p className="label mt-2 text-muted">
                {u.emailVerified ? "Verified" : "Unverified"} · Joined {date.format(u.createdAt)}
              </p>
            </div>
            {u.id === me.id ? (
              <p className="label">{u.role} (you)</p>
            ) : (
              <RoleForm userId={u.id} email={u.email} role={u.role} roles={roles} />
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
