import type { Metadata } from "next";
import { categoryTabs, ProductListing } from "@/components/product-listing";
import { getCategories, listProducts } from "@/lib/products";

const title = "Women";
const intro = "Ready-to-wear, bags, shoes and jewellery.";

export const metadata: Metadata = { title: `${title} | Maison`, description: intro };

export default async function Page({ searchParams }: PageProps<"/women">) {
  const [products, categories] = await Promise.all([listProducts({ department: "women" }), getCategories()]);
  return (
    <ProductListing
      title={title}
      intro={intro}
      products={products}
      searchParams={await searchParams}
      tabs={categoryTabs(categories)}
    />
  );
}
