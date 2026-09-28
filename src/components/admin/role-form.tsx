"use client";

import { useActionState } from "react";
import { setRoleAction } from "@/app/admin/accounts/actions";
import { Spinner } from "@/components/admin/form-parts";

/** One account's role. A changed role signs that account out of every session. `roles` comes from the page,
 * since @/lib/auth can't be imported into a client component. */
export function RoleForm({ userId, email, role, roles }: { userId: string; email: string; role: string; roles: readonly string[] }) {
  const [state, formAction, pending] = useActionState(setRoleAction, null);
  const selectId = `role-${userId}`;

  return (
    <form action={formAction} className="grid gap-3 md:justify-items-end">
      <div className="flex items-end gap-4">
        <input type="hidden" name="userId" value={userId} />
        <label className="sr-only" htmlFor={selectId}>Role for {email}</label>
        <select id={selectId} name="role" defaultValue={role} disabled={pending} className="field w-40 capitalize">
          {roles.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <button type="submit" disabled={pending} className="btn btn-secondary w-auto">
          {pending && <Spinner />}
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      {state?.error ? (
        <p role="alert" className="border-l-2 border-danger pl-4 text-danger">{state.error}</p>
      ) : (
        state?.saved && <p role="status" className="border-l-2 border-ink pl-4">Saved.</p>
      )}
    </form>
  );
}
