import type { Metadata } from "next";
import { categoryTabs, ProductListing } from "@/components/product-listing";
import { getPricing } from "@/lib/fx";
import { getCategories, listProducts, NEW_COUNT } from "@/lib/products";

const title = "New arrivals";
const intro = "The latest pieces, added weekly.";

export const metadata: Metadata = { title: `${title} | Maison`, description: intro };

export default async function Page({ params, searchParams }: PageProps<"/[market]/new-arrivals">) {
  const { market } = await params;
  const [products, categories] = await Promise.all([listProducts({ newest: NEW_COUNT }, market), getCategories()]);
  const pricing = await getPricing(market);
  return (
    <ProductListing
      title={title}
      intro={intro}
      products={products}
      pricing={pricing}
      searchParams={await searchParams}
      tabs={categoryTabs(categories)}
      showNew={false}
    />
  );
}
