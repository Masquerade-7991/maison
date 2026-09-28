"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useState } from "react";
import type { ProductFormState } from "@/app/admin/products/actions";
import { Check, Field, Section, Spinner } from "@/components/admin/form-parts";
import { DEPARTMENTS, IMAGE_HOST, MAX_STOCK, isAllowedImageUrl, slugify, type ProductField } from "@/lib/admin-rules";
import { stockCopy, stockState, stockTone } from "@/lib/stock";

type Action = (prev: ProductFormState, fd: FormData) => Promise<ProductFormState>;
type Category = { id: string; name: string };

/** Form values as strings (prices already in dollars); checkboxes are "on" or "". */
export type ProductFormValues = Record<
  "name" | "slug" | "description" | "categoryId" | "department" | "colour" | "price" | "compareAt" | "stockQuantity" | "stockDetail" | "imageUrl" | "imageAlt" | "madeToOrder" | "isGift",
  string
>;

// Form names that report under a different key (prices are typed in dollars, stored in cents).
const errorKey: Partial<Record<string, ProductField>> = { price: "priceCents", compareAt: "compareAtCents" };

export function ProductForm({
  action,
  initial,
  categories,
  productId,
  expectedStock,
  justCreated = false,
}: {
  action: Action;
  initial: ProductFormValues;
  categories: Category[];
  productId?: string;
  expectedStock?: number;
  justCreated?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const creating = !productId;
  // A rejected submit keeps what the admin typed; a successful one re-renders from the saved product.
  const v = (k: keyof ProductFormValues) => state?.values?.[k] ?? (state?.values && (k === "madeToOrder" || k === "isGift") ? "" : initial[k]);

  // Live previews only; the server re-validates everything.
  const [stock, setStock] = useState({ q: v("stockQuantity"), mto: v("madeToOrder") === "on" });
  const [imageUrl, setImageUrl] = useState(v("imageUrl"));
  const [nameForSlug, setNameForSlug] = useState(v("name"));

  const err = (name: string) => state?.errors?.[(errorKey[name] ?? name) as ProductField];
  const field = (name: string) => ({
    id: name,
    name,
    "aria-invalid": err(name) ? true : undefined,
    "aria-describedby": err(name) ? `${name}-error` : undefined,
  });
  const quantity = /^\d+$/.test(stock.q) ? Number(stock.q) : null;
  const preview = quantity === null ? null : stockState({ stockQuantity: quantity, madeToOrder: stock.mto });
  const message = state?.error ?? (state?.errors ? "Please correct the highlighted fields." : null);

  return (
    <form action={formAction} className="max-w-3xl" noValidate>
      {productId && <input type="hidden" name="id" value={productId} />}
      {expectedStock !== undefined && <input type="hidden" name="expectedStock" value={state?.currentStock ?? expectedStock} />}

      {(message || state?.saved || justCreated) && (
        <p role={message ? "alert" : "status"} className={`mb-8 border-l-2 pl-4 ${message ? "border-danger text-danger" : "border-ink"}`}>
          {message ?? (justCreated && !state?.saved ? "Product created. It is live in the store now." : "Changes saved. The store shows them now.")}
        </p>
      )}

      <fieldset disabled={pending} className="space-y-10">
        <Section title="Details">
          <Field label="Name" name="name" error={err("name")}>
            <input {...field("name")} defaultValue={v("name")} onInput={(e) => setNameForSlug(e.currentTarget.value)} maxLength={120} required className="field" />
          </Field>
          {creating ? (
            <Field label="URL slug" name="slug" error={err("slug")} hint={`Leave empty to use “${slugify(nameForSlug) || "…"}”. It can't be changed later.`}>
              <input {...field("slug")} defaultValue={v("slug")} maxLength={80} placeholder={slugify(nameForSlug)} autoCapitalize="none" spellCheck={false} className="field" />
            </Field>
          ) : (
            <div>
              <p className="label text-muted">URL</p>
              <p className="mt-3 break-all">/products/{initial.slug}</p>
            </div>
          )}
          <Field label="Description" name="description" error={err("description")} wide>
            <textarea {...field("description")} defaultValue={v("description")} rows={4} maxLength={4000} required className="field py-3 leading-relaxed" />
          </Field>
          <Field label="Category" name="categoryId" error={err("categoryId")}>
            <select {...field("categoryId")} defaultValue={v("categoryId")} required className="field">
              <option value="" disabled>Choose…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Department" name="department" error={err("department")}>
            <select {...field("department")} defaultValue={v("department")} required className="field capitalize">
              {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
          <Field label="Colour" name="colour" error={err("colour")}>
            <input {...field("colour")} defaultValue={v("colour")} maxLength={60} required className="field" />
          </Field>
          <Check name="isGift" label="Show in Gifts" defaultChecked={v("isGift") === "on"} />
        </Section>

        <Section title="Price">
          <Field label="Price (USD)" name="price" error={err("price")}>
            <input {...field("price")} defaultValue={v("price")} inputMode="decimal" placeholder="1450.00" required className="field tabular-nums" />
          </Field>
          <Field label="Original price (USD)" name="compareAt" error={err("compareAt")} hint="Optional. Shown struck through when set; must be above the price.">
            <input {...field("compareAt")} defaultValue={v("compareAt")} inputMode="decimal" className="field tabular-nums" />
          </Field>
        </Section>

        <Section title="Availability">
          <Field label="Units in stock" name="stockQuantity" error={err("stockQuantity")}>
            <input
              {...field("stockQuantity")}
              defaultValue={v("stockQuantity")}
              onInput={(e) => {
                const q = e.currentTarget.value; // read now: currentTarget is null by the time the updater runs
                setStock((s) => ({ ...s, q }));
              }}
              type="number"
              min={0}
              max={MAX_STOCK}
              step={1}
              inputMode="numeric"
              required
              className="field tabular-nums"
            />
          </Field>
          <div>
            <p className="label text-muted">Shown in store as</p>
            <p className="label mt-3 flex min-h-8 items-center gap-2" aria-live="polite">
              {preview ? (
                <>
                  <span aria-hidden className={`size-1.5 rounded-full ${stockTone[preview]}`} />
                  {stockCopy(preview, quantity ?? 0)}
                </>
              ) : (
                <span className="text-muted">—</span>
              )}
            </p>
          </div>
          <Check
            name="madeToOrder"
            label="Made to order: stays buyable when stock reaches 0"
            defaultChecked={v("madeToOrder") === "on"}
            onChange={(on) => setStock((s) => ({ ...s, mto: on }))}
          />
          <Field label="Availability note" name="stockDetail" error={err("stockDetail")} hint="Optional, shown under the stock status, e.g. “Ships in 3–4 weeks”." wide>
            <input {...field("stockDetail")} defaultValue={v("stockDetail")} maxLength={200} className="field" />
          </Field>
        </Section>

        <Section title="Image">
          <Field label="Image URL" name="imageUrl" error={err("imageUrl")} hint={`An https://${IMAGE_HOST}/ link: the only image host the store serves.`} wide>
            <input {...field("imageUrl")} defaultValue={v("imageUrl")} onInput={(e) => setImageUrl(e.currentTarget.value)} type="url" required spellCheck={false} className="field" />
          </Field>
          <Field label="Image description" name="imageAlt" error={err("imageAlt")} hint="Read aloud by screen readers." wide>
            <input {...field("imageAlt")} defaultValue={v("imageAlt")} maxLength={200} required className="field" />
          </Field>
          <div className="media-product w-32 bg-surface">
            {isAllowedImageUrl(imageUrl) ? (
              <Image src={imageUrl} alt="" fill sizes="8rem" />
            ) : (
              <span className="absolute inset-0 grid place-items-center p-3 text-center text-muted">No preview</span>
            )}
          </div>
        </Section>
      </fieldset>

      <div className="rule mt-10 flex flex-col gap-3 pt-8 sm:flex-row sm:items-center">
        <button type="submit" disabled={pending} className="btn btn-primary sm:w-auto sm:px-10">
          {pending && <Spinner />}
          {pending ? "Saving…" : creating ? "Create product" : "Save changes"}
        </button>
        <Link href="/admin/products" className="btn btn-secondary sm:w-auto sm:px-10">{creating ? "Cancel" : "Back to products"}</Link>
      </div>
    </form>
  );
}
