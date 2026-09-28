"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export type NavSection = { href: string; label: string };

// Tab row on phones (like the listing tabs), sidebar from tablet up. `root` only matches itself;
// every other section stays current on its sub-pages (/account/orders/<id> keeps "Orders").
export function SectionNav({ label, sections, root, children }: { label: string; sections: NavSection[]; root?: string; children?: React.ReactNode }) {
  const pathname = usePathname();
  const currentRef = useRef<HTMLAnchorElement>(null);
  // On phones the row scrolls sideways: keep the current tab visible instead of cut off at the edge.
  useEffect(() => {
    currentRef.current?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [pathname]);
  return (
    <nav aria-label={label} className="-mx-gutter overflow-x-auto px-gutter scrollbar-none md:mx-0 md:px-0">
      <ul className="flex items-center gap-7 whitespace-nowrap md:flex-col md:items-start md:gap-4">
        {sections.map((s) => {
          const current = pathname === s.href || (s.href !== root && pathname.startsWith(`${s.href}/`));
          return (
            <li key={s.href}>
              <Link
                href={s.href}
                ref={current ? currentRef : undefined}
                aria-current={current ? "page" : undefined}
                className={`label link-nav ${current ? "underline underline-offset-4" : "text-muted hover:text-ink"}`}
              >
                {s.label}
              </Link>
            </li>
          );
        })}
        {children}
      </ul>
    </nav>
  );
}
