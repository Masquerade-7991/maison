import Link from "next/link";
import { SectionNav } from "@/components/section-nav";

// Navigation only. Hiding or showing it is never the access check: every admin page calls
// requireAdmin() and every admin action calls assertAdmin().
const sections = [
  { href: "/admin/products", label: "Products" },
  { href: "/admin/stock", label: "Stock" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/accounts", label: "Accounts" },
];

export function AdminNav() {
  return (
    <SectionNav label="Admin" sections={sections}>
      <li className="md:rule md:mt-2 md:w-full md:pt-6">
        <Link href="/" className="label link-nav text-muted hover:text-ink">Back to store</Link>
      </li>
    </SectionNav>
  );
}
