import type { Metadata } from "next";
import { categoryTabs, ProductListing } from "@/components/product-listing";
import { getPricing } from "@/lib/fx";
import { getCategories, listProducts } from "@/lib/products";

const title = "Gifts";
const intro = "Considered pieces, wrapped and ready to give.";

export const metadata: Metadata = { title: `${title} | Maison`, description: intro };

export default async function Page({ params, searchParams }: PageProps<"/[market]/gifts">) {
  const { market } = await params;
  const [products, categories] = await Promise.all([listProducts({ gift: true }, market), getCategories()]);
  const pricing = await getPricing(market);
  return (
    <ProductListing
      list="gifts"
      title={title}
      intro={intro}
      products={products}
      pricing={pricing}
      searchParams={await searchParams}
      tabs={categoryTabs(categories)}
    />
  );
}
