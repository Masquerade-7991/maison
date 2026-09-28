"use server";

// Public endpoint like every Server Action: role first, then every field validated here.
import { revalidatePath } from "next/cache";
import { updateStock } from "@/lib/admin-catalogue";
import { isUuid, parseStock, reader, STOCK_ERROR } from "@/lib/admin-rules";
import { assertAdmin } from "@/lib/session";

export type StockFormState = {
  error?: string;
  saved?: boolean;
  /** What the admin typed, kept on a rejected save. */
  value?: string;
  /** The quantity in the database now: the next save's expected number. */
  stock?: number;
} | null;

export async function updateStockAction(_prev: StockFormState, fd: FormData): Promise<StockFormState> {
  await assertAdmin();
  const get = reader(fd);
  const id = get("id");
  const expected = parseStock(get("expectedStock"));
  if (!isUuid(id) || expected === null) return { error: "This form is out of date. Reload the page and try again." };
  const next = parseStock(get("stockQuantity"));
  if (next === null) return { error: STOCK_ERROR, value: get("stockQuantity") };
  if (next === expected) return { saved: true, stock: expected };
  const result = await updateStock(id, expected, next);
  if (!result.ok) return { error: result.error, value: get("stockQuantity"), stock: result.currentStock };
  revalidatePath("/", "layout"); // the storefront is ISR: show the new stock at once
  return { saved: true, stock: result.stock };
}
