import type { Metadata } from "next";
import { roles } from "@/lib/auth";
import { requireAdmin } from "@/lib/session";
import { listUsers } from "@/lib/users";
import { setRoleAction } from "./actions";

export const metadata: Metadata = { title: "Admin | Maison", robots: { index: false } };

const date = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

export default async function AdminPage() {
  const { user: me } = await requireAdmin();
  const users = await listUsers();

  return (
    <section className="container-page pt-12 md:pt-20">
      <h1 className="text-display">Admin</h1>
      <p className="mt-3 text-muted">Signed in as {me.email}.</p>

      <h2 className="label mt-10 md:mt-14">Accounts ({users.length})</h2>
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
              <form action={setRoleAction} className="flex items-end gap-4">
                <input type="hidden" name="userId" value={u.id} />
                <label className="sr-only" htmlFor={`role-${u.id}`}>Role for {u.email}</label>
                <select id={`role-${u.id}`} name="role" defaultValue={u.role} className="field w-40 capitalize">
                  {roles.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <button type="submit" className="btn btn-secondary w-auto">Save</button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
