"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/components/sign-out-button";

// Account sections. Order history slots in here as /account/orders when it exists.
const sections = [{ href: "/account", label: "Account details" }];

// Tab row on phones (like the listing tabs), sidebar from tablet up.
export function AccountNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Account" className="-mx-gutter overflow-x-auto px-gutter scrollbar-none md:mx-0 md:px-0">
      <ul className="flex items-center gap-7 whitespace-nowrap md:flex-col md:items-start md:gap-4">
        {sections.map((s) => {
          const current = pathname === s.href;
          return (
            <li key={s.href}>
              <Link
                href={s.href}
                aria-current={current ? "page" : undefined}
                className={`label link-nav ${current ? "underline underline-offset-4" : "text-muted hover:text-ink"}`}
              >
                {s.label}
              </Link>
            </li>
          );
        })}
        {isAdmin && (
          <li>
            <Link href="/admin" className="label link-nav text-muted hover:text-ink">Admin</Link>
          </li>
        )}
        <li className="md:rule md:mt-2 md:w-full md:pt-6">
          <SignOutButton className="label link-nav cursor-pointer text-muted hover:text-ink disabled:cursor-wait" />
        </li>
      </ul>
    </nav>
  );
}
