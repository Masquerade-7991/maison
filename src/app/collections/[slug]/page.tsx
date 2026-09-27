import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { departmentTabs, ProductListing } from "@/components/product-listing";
import { getCategoryBySlug, listProducts } from "@/lib/products";

export async function generateMetadata({ params }: PageProps<"/collections/[slug]">): Promise<Metadata> {
  const category = await getCategoryBySlug((await params).slug);
  return category ? { title: `${category.name} | Maison`, description: category.description } : {};
}

export default async function CollectionPage({ params, searchParams }: PageProps<"/collections/[slug]">) {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  return (
    <ProductListing
      title={category.name}
      intro={category.description}
      products={await listProducts({ category: slug })}
      searchParams={await searchParams}
      tabs={departmentTabs}
    />
  );
}
