import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductForm } from "@/components/admin/product-form";
import { getAdminProduct, listCategoryOptions } from "@/lib/admin-catalogue";
import { centsToInput, isUuid } from "@/lib/admin-rules";
import { requireAdmin } from "@/lib/session";
import { updateProductAction } from "../actions";

export const metadata: Metadata = { title: "Edit product | Admin | Maison" };

const date = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

export default async function EditProductPage({ params, searchParams }: PageProps<"/admin/products/[id]">) {
  const { id } = await params;
  await requireAdmin(`/admin/products/${encodeURIComponent(id)}`);
  const product = isUuid(id) ? await getAdminProduct(id) : null;
  if (!product) notFound();
  const categories = await listCategoryOptions();
  const justCreated = (await searchParams).saved === "created";

  return (
    <>
      <Link href="/admin/products" className="label link-nav text-muted hover:text-ink">← All products</Link>
      <div className="mt-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="text-display-sm">{product.name}</h2>
        <Link href={`/products/${product.slug}`} target="_blank" className="label link">View in store ↗</Link>
      </div>
      <p className="mt-2 text-muted">Last updated {date.format(product.updatedAt)}</p>
      <div className="mt-10">
        <ProductForm
          action={updateProductAction}
          categories={categories}
          productId={product.id}
          expectedStock={product.stockQuantity}
          justCreated={justCreated}
          initial={{
            name: product.name,
            slug: product.slug,
            description: product.description,
            categoryId: product.categoryId,
            department: product.department,
            colour: product.colour,
            price: centsToInput(product.priceCents),
            compareAt: product.compareAtCents === null ? "" : centsToInput(product.compareAtCents),
            stockQuantity: String(product.stockQuantity),
            stockDetail: product.stockDetail ?? "",
            imageUrl: product.imageUrl ?? "",
            imageAlt: product.imageAlt ?? "",
            madeToOrder: product.madeToOrder ? "on" : "",
            isGift: product.isGift ? "on" : "",
          }}
        />
      </div>
    </>
  );
}
