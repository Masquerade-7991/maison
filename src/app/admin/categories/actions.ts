"use server";

// Server Actions are public endpoints: each checks the role first, then validates every field here.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createCategory, deleteCategory, updateCategory } from "@/lib/admin-catalogue";
import { formValues, isUuid, parseCategoryForm, reader, type CategoryErrors } from "@/lib/admin-rules";
import { assertAdmin } from "@/lib/session";

export type CategoryFormState = {
  errors?: CategoryErrors;
  error?: string;
  /** What the admin typed, echoed back so a rejected form keeps their input. */
  values?: Record<string, string>;
  saved?: boolean;
} | null;

// Categories feed the navigation, listings and the homepage strip: refresh the whole ISR tree.
const refreshStorefront = () => revalidatePath("/", "layout");

const outOfDate = { error: "This form is out of date. Reload the page and try again." };

export async function createCategoryAction(_prev: CategoryFormState, fd: FormData): Promise<CategoryFormState> {
  await assertAdmin();
  const parsed = parseCategoryForm(reader(fd), { create: true });
  if (!parsed.ok) return { errors: parsed.errors, values: formValues(fd) };
  const result = await createCategory(parsed.value);
  if (!result.ok) return { errors: result.errors, error: result.error, values: formValues(fd) };
  refreshStorefront();
  redirect(`/admin/categories/${result.id}?saved=created`);
}

export async function updateCategoryAction(_prev: CategoryFormState, fd: FormData): Promise<CategoryFormState> {
  await assertAdmin();
  const id = reader(fd)("id");
  if (!isUuid(id)) return outOfDate;
  const parsed = parseCategoryForm(reader(fd), { create: false });
  if (!parsed.ok) return { errors: parsed.errors, values: formValues(fd) };
  const result = await updateCategory(id, parsed.value); // the slug is never written on edit
  if (!result.ok) return { errors: result.errors, error: result.error, values: formValues(fd) };
  refreshStorefront();
  return { saved: true };
}

export async function deleteCategoryAction(_prev: CategoryFormState, fd: FormData): Promise<CategoryFormState> {
  await assertAdmin();
  const id = reader(fd)("id");
  if (!isUuid(id)) return outOfDate;
  const result = await deleteCategory(id);
  if (!result.ok) return { error: result.error };
  refreshStorefront();
  redirect("/admin/categories?deleted=1");
}
