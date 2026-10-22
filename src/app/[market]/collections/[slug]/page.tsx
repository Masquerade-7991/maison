import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { departmentTabs, ProductListing } from "@/components/product-listing";
import { getPricing } from "@/lib/fx";
import { getCategoryBySlug, listProducts } from "@/lib/products";

export async function generateMetadata({ params }: PageProps<"/[market]/collections/[slug]">): Promise<Metadata> {
  const category = await getCategoryBySlug((await params).slug);
  return category ? { title: `${category.name} | Maison`, description: category.description } : {};
}

export default async function CollectionPage({ params, searchParams }: PageProps<"/[market]/collections/[slug]">) {
  const { market, slug } = await params;
  const [category, products, pricing] = await Promise.all([getCategoryBySlug(slug), listProducts({ category: slug }, market), getPricing(market)]);
  if (!category) notFound();

  return (
    <ProductListing
      title={category.name}
      intro={category.description}
      products={products}
      pricing={pricing}
      searchParams={await searchParams}
      tabs={departmentTabs}
      image={category.imageUrl ? { url: category.imageUrl, alt: category.imageAlt ?? category.name } : undefined}
    />
  );
}
