"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useState } from "react";
import type { CategoryFormState } from "@/app/admin/categories/actions";
import { Field, Section, Spinner } from "@/components/admin/form-parts";
import { IMAGE_HOST, MAX_POSITION, isAllowedImageUrl, slugify, type CategoryField } from "@/lib/admin-rules";

type Action = (prev: CategoryFormState, fd: FormData) => Promise<CategoryFormState>;

export type CategoryFormValues = Record<"name" | "slug" | "description" | "imageUrl" | "imageAlt" | "position", string>;

export function CategoryForm({
  action,
  initial,
  categoryId,
  justCreated = false,
}: {
  action: Action;
  initial: CategoryFormValues;
  categoryId?: string;
  justCreated?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const creating = !categoryId;
  // A rejected submit keeps what the admin typed; a successful one re-renders from the saved category.
  const v = (k: keyof CategoryFormValues) => state?.values?.[k] ?? initial[k];

  // Live previews only; the server re-validates everything.
  const [imageUrl, setImageUrl] = useState(v("imageUrl"));
  const [nameForSlug, setNameForSlug] = useState(v("name"));

  const err = (name: CategoryField) => state?.errors?.[name];
  const field = (name: CategoryField) => ({
    id: name,
    name,
    "aria-invalid": err(name) ? true : undefined,
    "aria-describedby": err(name) ? `${name}-error` : undefined,
  });
  const message = state?.error ?? (state?.errors ? "Please correct the highlighted fields." : null);

  return (
    <form action={formAction} className="max-w-3xl" noValidate>
      {categoryId && <input type="hidden" name="id" value={categoryId} />}

      {(message || state?.saved || justCreated) && (
        <p role={message ? "alert" : "status"} className={`mb-8 border-l-2 pl-4 ${message ? "border-danger text-danger" : "border-ink"}`}>
          {message ?? (justCreated && !state?.saved ? "Category created. It is live in the store now." : "Changes saved. The store shows them now.")}
        </p>
      )}

      <fieldset disabled={pending} className="space-y-10">
        <Section title="Details">
          <Field
            label="Name"
            name="name"
            error={err("name")}
            hint={creating ? `Its URL will be /collections/${slugify(nameForSlug) || "…"}, which can't be changed later.` : undefined}
          >
            <input {...field("name")} defaultValue={v("name")} onInput={(e) => setNameForSlug(e.currentTarget.value)} maxLength={60} required className="field" />
          </Field>
          {!creating && (
            <div>
              <p className="label text-muted">URL</p>
              <p className="mt-3 break-all">/collections/{initial.slug}</p>
            </div>
          )}
          <Field label="Description" name="description" error={err("description")} wide>
            <textarea {...field("description")} defaultValue={v("description")} rows={3} maxLength={1000} required className="field py-3 leading-relaxed" />
          </Field>
          <Field label="Position" name="position" error={err("position")} hint="Lower numbers come first.">
            <input {...field("position")} defaultValue={v("position")} type="number" min={0} max={MAX_POSITION} step={1} inputMode="numeric" required className="field tabular-nums" />
          </Field>
        </Section>

        <Section title="Image">
          <p className="text-muted sm:col-span-2">Optional. A category with an image appears in the homepage Collections strip.</p>
          <Field label="Image URL" name="imageUrl" error={err("imageUrl")} hint={`An https://${IMAGE_HOST}/ link: the only image host the store serves.`} wide>
            <input {...field("imageUrl")} defaultValue={v("imageUrl")} onInput={(e) => setImageUrl(e.currentTarget.value)} type="url" spellCheck={false} className="field" />
          </Field>
          <Field label="Image description" name="imageAlt" error={err("imageAlt")} hint="Required with an image. Read aloud by screen readers." wide>
            <input {...field("imageAlt")} defaultValue={v("imageAlt")} maxLength={200} className="field" />
          </Field>
          <div className="media-product w-32 bg-surface">
            {isAllowedImageUrl(imageUrl) ? (
              <Image src={imageUrl} alt="" fill sizes="8rem" />
            ) : (
              <span className="absolute inset-0 grid place-items-center p-3 text-center text-muted">No image</span>
            )}
          </div>
        </Section>
      </fieldset>

      <div className="rule mt-10 flex flex-col gap-3 pt-8 sm:flex-row sm:items-center">
        <button type="submit" disabled={pending} className="btn btn-primary sm:w-auto sm:px-10">
          {pending && <Spinner />}
          {pending ? "Saving…" : creating ? "Create category" : "Save changes"}
        </button>
        <Link href="/admin/categories" className="btn btn-secondary sm:w-auto sm:px-10">{creating ? "Cancel" : "Back to categories"}</Link>
      </div>
    </form>
  );
}

/** Rendered only for an empty category; the server re-checks, since a product may be added meanwhile. */
export function DeleteCategoryForm({ action, categoryId }: { action: Action; categoryId: string }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={categoryId} />
      {state?.error && <p role="alert" className="mb-4 border-l-2 border-danger pl-4 text-danger">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn btn-secondary w-auto px-8 text-danger">
        {pending && <Spinner />}
        {pending ? "Deleting…" : "Delete category"}
      </button>
    </form>
  );
}
