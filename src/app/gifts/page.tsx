import type { Metadata } from "next";
import { categoryTabs, ProductListing } from "@/components/product-listing";
import { getCategories, listProducts } from "@/lib/products";

const title = "Gifts";
const intro = "Considered pieces, wrapped and ready to give.";

export const metadata: Metadata = { title: `${title} | Maison`, description: intro };

export default async function Page({ searchParams }: PageProps<"/gifts">) {
  const [products, categories] = await Promise.all([listProducts({ gift: true }), getCategories()]);
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
