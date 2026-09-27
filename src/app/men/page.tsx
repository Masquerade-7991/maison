import type { Metadata } from "next";
import { categoryTabs, ProductListing } from "@/components/product-listing";
import { getCategories, listProducts } from "@/lib/products";

const title = "Men";
const intro = "Tailoring, leather and everyday essentials.";

export const metadata: Metadata = { title: `${title} | Maison`, description: intro };

export default async function Page({ searchParams }: PageProps<"/men">) {
  const [products, categories] = await Promise.all([listProducts({ department: "men" }), getCategories()]);
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
