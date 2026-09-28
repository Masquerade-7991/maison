import Link from "next/link";
import { SectionNav } from "@/components/section-nav";
import { SignOutButton } from "@/components/sign-out-button";

const sections = [
  { href: "/account", label: "Account details" },
  { href: "/account/orders", label: "Orders" },
];

export function AccountNav({ isAdmin }: { isAdmin: boolean }) {
  return (
    <SectionNav label="Account" sections={sections} root="/account">
      {isAdmin && (
        <li>
          <Link href="/admin" className="label link-nav text-muted hover:text-ink">Admin</Link>
        </li>
      )}
      <li className="md:rule md:mt-2 md:w-full md:pt-6">
        <SignOutButton className="label link-nav cursor-pointer text-muted hover:text-ink disabled:cursor-wait" />
      </li>
    </SectionNav>
  );
}
