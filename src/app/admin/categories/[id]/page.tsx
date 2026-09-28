import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryForm, DeleteCategoryForm } from "@/components/admin/category-form";
import { getAdminCategory } from "@/lib/admin-catalogue";
import { isUuid } from "@/lib/admin-rules";
import { requireAdmin } from "@/lib/session";
import { deleteCategoryAction, updateCategoryAction } from "../actions";

export const metadata: Metadata = { title: "Edit category | Admin | Maison" };

export default async function EditCategoryPage({ params, searchParams }: PageProps<"/admin/categories/[id]">) {
  const { id } = await params;
  await requireAdmin(`/admin/categories/${encodeURIComponent(id)}`);
  const category = isUuid(id) ? await getAdminCategory(id) : null;
  if (!category) notFound();
  const justCreated = (await searchParams).saved === "created";

  return (
    <>
      <Link href="/admin/categories" className="label link-nav text-muted hover:text-ink">← All categories</Link>
      <div className="mt-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="text-display-sm">{category.name}</h2>
        <Link href={`/collections/${category.slug}`} target="_blank" className="label link">View in store ↗</Link>
      </div>
      <p className="mt-2 text-muted">
        {category.productCount === 1 ? "1 product" : `${category.productCount} products`}
        {category.productCount > 0 && (
          <> · <Link href={`/admin/products?category=${category.id}`} className="link">View products</Link></>
        )}
      </p>
      <div className="mt-10">
        <CategoryForm
          action={updateCategoryAction}
          categoryId={category.id}
          justCreated={justCreated}
          initial={{
            name: category.name,
            slug: category.slug,
            description: category.description,
            imageUrl: category.imageUrl ?? "",
            imageAlt: category.imageAlt ?? "",
            position: String(category.position),
          }}
        />
      </div>

      <section className="mt-16 max-w-3xl">
        <h2 className="label border-b border-line pb-3">Delete</h2>
        {category.productCount === 0 ? (
          <div className="mt-6">
            <p className="mb-6 text-muted">The category and its /collections/{category.slug} page are removed at once. This can&apos;t be undone.</p>
            <DeleteCategoryForm action={deleteCategoryAction} categoryId={category.id} />
          </div>
        ) : (
          <p className="mt-6 text-muted">Only an empty category can be deleted. Move its products to another category first.</p>
        )}
      </section>
    </>
  );
}
