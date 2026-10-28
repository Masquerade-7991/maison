import type { Metadata } from "next";
import { categoryTabs, ProductListing } from "@/components/product-listing";
import { getPricing } from "@/lib/fx";
import { getCategories, listProducts } from "@/lib/products";

const title = "Men";
const intro = "Tailoring, leather and everyday essentials.";

export const metadata: Metadata = { title: `${title} | Maison`, description: intro };

export default async function Page({ params, searchParams }: PageProps<"/[market]/men">) {
  const { market } = await params;
  const [products, categories] = await Promise.all([listProducts({ department: "men" }, market), getCategories()]);
  const pricing = await getPricing(market);
  return (
    <ProductListing
      list="men"
      title={title}
      intro={intro}
      products={products}
      pricing={pricing}
      searchParams={await searchParams}
      tabs={categoryTabs(categories)}
    />
  );
}
