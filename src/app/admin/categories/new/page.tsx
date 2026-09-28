import type { Metadata } from "next";
import Link from "next/link";
import { CategoryForm } from "@/components/admin/category-form";
import { requireAdmin } from "@/lib/session";
import { createCategoryAction } from "../actions";

export const metadata: Metadata = { title: "New category | Admin | Maison" };

export default async function NewCategoryPage() {
  await requireAdmin("/admin/categories/new");

  return (
    <>
      <Link href="/admin/categories" className="label link-nav text-muted hover:text-ink">← All categories</Link>
      <h2 className="mt-6 text-display-sm">New category</h2>
      <p className="mt-2 text-muted">It goes live in the store as soon as it&apos;s created.</p>
      <div className="mt-10">
        <CategoryForm action={createCategoryAction} initial={{ name: "", slug: "", description: "", imageUrl: "", imageAlt: "", position: "0" }} />
      </div>
    </>
  );
}
