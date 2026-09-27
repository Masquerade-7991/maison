import type { Metadata } from "next";
import { categoryTabs, ProductListing } from "@/components/product-listing";
import { getCategories, listProducts, NEW_COUNT } from "@/lib/products";

const title = "New arrivals";
const intro = "The latest pieces, added weekly.";

export const metadata: Metadata = { title: `${title} | Maison`, description: intro };

export default async function Page({ searchParams }: PageProps<"/new-arrivals">) {
  const [products, categories] = await Promise.all([listProducts({ newest: NEW_COUNT }), getCategories()]);
  return (
    <ProductListing
      title={title}
      intro={intro}
      products={products}
      searchParams={await searchParams}
      tabs={categoryTabs(categories)}
      showNew={false}
    />
  );
}
