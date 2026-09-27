"use server";

// Bag Server Actions. They are public endpoints, so each one reads the session itself, validates every
// field it receives, and re-checks live stock. The browser only ever sends a slug, a size and a quantity:
// never a price, a product id or a user id.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addLine, findProductForBag, productLines, removeLine, setLineQuantity } from "@/lib/cart";
import { isValidQuantity, isValidSize, maxAllowed } from "@/lib/cart-rules";
import { detailsFor } from "@/lib/sample-data";
import { getSession } from "@/lib/session";

export type BagActionState = { ok: true; message: string } | { ok: false; message: string } | null;

const SLUG = /^[a-z0-9-]{1,120}$/;

function readLine(form: FormData) {
  return { slug: String(form.get("slug") ?? ""), size: String(form.get("size") ?? "") };
}

type BagProduct = NonNullable<Awaited<ReturnType<typeof findProductForBag>>>;

async function productFor(slug: string, size: string): Promise<{ error: string } | { product: BagProduct }> {
  if (!SLUG.test(slug)) return { error: "This piece is no longer available." };
  const product = await findProductForBag(slug);
  if (!product) return { error: "This piece is no longer available." };
  const { sizes } = detailsFor(product.categorySlug);
  if (!isValidSize(sizes, size)) return { error: sizes.length ? "Please choose a size." : "This piece is one size." };
  return { product };
}

export async function addToBagAction(_prev: BagActionState, form: FormData): Promise<BagActionState> {
  const { slug, size } = readLine(form);
  const session = await getSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(SLUG.test(slug) ? `/products/${slug}` : "/bag")}`);

  const found = await productFor(slug, size);
  if ("error" in found) return { ok: false, message: found.error };
  const { product } = found;

  const allowed = maxAllowed(product);
  if (allowed === 0) return { ok: false, message: "This piece is sold out." };
  const inBag = (await productLines(session.user.id, product.id)).reduce((n, l) => n + l.quantity, 0);
  if (inBag + 1 > allowed) {
    return {
      ok: false,
      message: product.madeToOrder || allowed === 10
        ? `You can add up to ${allowed} of this piece, and your bag already has ${inBag}.`
        : `Only ${allowed} available, and your bag already has ${inBag}.`,
    };
  }

  await addLine(session.user.id, product.id, size, 1);
  revalidatePath("/bag");
  return { ok: true, message: "Added to your bag." };
}

export async function updateQuantityAction(_prev: BagActionState, form: FormData): Promise<BagActionState> {
  const session = await getSession();
  if (!session) redirect("/sign-in?next=%2Fbag");
  const { slug, size } = readLine(form);
  const quantity = Number(form.get("quantity"));
  if (!isValidQuantity(quantity)) return { ok: false, message: "Choose a quantity between 1 and 10." };

  const found = await productFor(slug, size);
  if ("error" in found) return { ok: false, message: found.error };
  const { product } = found;

  const lines = await productLines(session.user.id, product.id);
  const otherSizes = lines.filter((l) => l.size !== size).reduce((n, l) => n + l.quantity, 0);
  const allowed = maxAllowed(product);
  if (otherSizes + quantity > allowed) {
    const room = Math.max(0, allowed - otherSizes);
    return { ok: false, message: room ? `Only ${room} available for this line.` : "This piece is no longer available." };
  }
  if (!(await setLineQuantity(session.user.id, product.id, size, quantity))) {
    return { ok: false, message: "That line is no longer in your bag." };
  }
  revalidatePath("/bag");
  return { ok: true, message: "Quantity updated." };
}

export async function removeFromBagAction(form: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/sign-in?next=%2Fbag");
  const { slug, size } = readLine(form);
  if (!SLUG.test(slug)) return;
  const product = await findProductForBag(slug);
  if (product) await removeLine(session.user.id, product.id, size);
  revalidatePath("/bag");
}
