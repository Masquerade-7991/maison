import type { Metadata } from "next";
import Link from "next/link";
import { ProductForm } from "@/components/admin/product-form";
import { listCategoryOptions } from "@/lib/admin-catalogue";
import { requireAdmin } from "@/lib/session";
import { createProductAction } from "../actions";

export const metadata: Metadata = { title: "New product | Admin | Maison" };

export default async function NewProductPage() {
  await requireAdmin("/admin/products/new");
  const categories = await listCategoryOptions();

  return (
    <>
      <Link href="/admin/products" className="label link-nav text-muted hover:text-ink">← All products</Link>
      <h2 className="mt-6 text-display-sm">New product</h2>
      <p className="mt-2 text-muted">It goes live in the store as soon as it&apos;s created.</p>
      <div className="mt-10">
        <ProductForm
          action={createProductAction}
          categories={categories}
          initial={{
            name: "", slug: "", description: "", categoryId: "", department: "unisex", colour: "",
            price: "", compareAt: "", stockQuantity: "0", stockDetail: "", imageUrl: "", imageAlt: "", madeToOrder: "", isGift: "",
          }}
        />
      </div>
    </>
  );
}
