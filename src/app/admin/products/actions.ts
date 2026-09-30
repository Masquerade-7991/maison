"use server";

// Server Actions are public endpoints: each checks the role first, then validates every field here.
// The form's own checks are only a convenience.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createProduct, updateProduct } from "@/lib/admin-catalogue";
import { formValues as echo, isUuid, parseProductForm, parseStock, reader, type FieldErrors } from "@/lib/admin-rules";
import { assertAdmin } from "@/lib/session";

export type ProductFormState = {
  errors?: FieldErrors;
  error?: string;
  /** What the admin typed, echoed back so a rejected form keeps their input. */
  values?: Record<string, string>;
  currentStock?: number;
  saved?: boolean;
} | null;

// ponytail: every catalogue page is ISR (revalidate = 300), so one edit invalidates the whole tree:
// home, listings, search, product pages and bags see it at once. Switch to per-path or tag
// revalidation if admin edits ever become frequent.
const refreshStorefront = () => revalidatePath("/", "layout");

export async function createProductAction(_prev: ProductFormState, fd: FormData): Promise<ProductFormState> {
  await assertAdmin();
  const parsed = parseProductForm(reader(fd), { create: true });
  if (!parsed.ok) return { errors: parsed.errors, values: echo(fd) };
  const result = await createProduct(parsed.value);
  if (!result.ok) return { errors: result.errors, error: result.error, values: echo(fd) };
  refreshStorefront();
  redirect(`/admin/products/${result.id}?saved=created`);
}

export async function updateProductAction(_prev: ProductFormState, fd: FormData): Promise<ProductFormState> {
  await assertAdmin();
  const id = reader(fd)("id");
  const expected = parseStock(reader(fd)("expectedStock"));
  if (!isUuid(id) || expected === null) return { error: "This form is out of date. Reload the page and try again." };
  const parsed = parseProductForm(reader(fd), { create: false });
  if (!parsed.ok) return { errors: parsed.errors, values: echo(fd) };
  const result = await updateProduct(id, parsed.value, expected); // the slug is never read on edit
  if (!result.ok) return { errors: result.errors, error: result.error, values: echo(fd), currentStock: result.currentStock };
  refreshStorefront();
  return { saved: true };
}
