// Admin form rules. Pure (no db), so the check file and client components can import them; the copy
// that counts runs in the Server Actions. The database constraints stay the last line of defence.

export const DEPARTMENTS = ["women", "men", "unisex"] as const;
export type Department = (typeof DEPARTMENTS)[number];

/** The only image host next.config.ts allows, so an admin can't save a URL the storefront can't render. */
export const IMAGE_HOST = "images.unsplash.com";

export const MAX_STOCK = 100_000;
const MAX_CENTS = 100_000_000; // $1,000,000

export type ProductInput = {
  name: string;
  slug: string;
  description: string;
  categoryId: string;
  department: Department;
  colour: string;
  priceCents: number;
  compareAtCents: number | null;
  stockQuantity: number;
  madeToOrder: boolean;
  stockDetail: string | null;
  isGift: boolean;
  imageUrl: string;
  imageAlt: string;
};

export type ProductField = keyof ProductInput;
export type FieldErrors = Partial<Record<ProductField, string>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string) => UUID.test(v);

/** "1,450.00" or "$1450" → 145000. Parsed as text, never as a float. null = not a valid amount. */
export function toCents(raw: string): number | null {
  const s = raw.trim().replace(/^\$/, "").replace(/,(?=\d{3}(\D|$))/g, "");
  const m = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "0").padEnd(2, "0"));
}

/** Cents back to the form's text, e.g. 145000 → "1450.00". */
export const centsToInput = (c: number) => `${Math.trunc(c / 100)}.${String(c % 100).padStart(2, "0")}`;

export const slugify = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");

export const isValidSlug = (s: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) && s.length <= 80;

export function isAllowedImageUrl(raw: string) {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && u.hostname === IMAGE_HOST;
  } catch {
    return false;
  }
}

/** A whole number of units from 0 to MAX_STOCK; null otherwise. */
export function parseStock(raw: string): number | null {
  const s = raw.trim();
  if (!/^\d{1,6}$/.test(s)) return null;
  const n = Number(s);
  return n <= MAX_STOCK ? n : null;
}

export const STOCK_ERROR = `Enter a whole number from 0 to ${MAX_STOCK.toLocaleString("en")}.`;

type Get = (name: string) => string;

/** A FormData reader that treats missing fields as "" and never returns a File. */
export const reader = (fd: FormData): Get => (name) => {
  const v = fd.get(name);
  return typeof v === "string" ? v : "";
};

/** The submitted text fields, echoed back so a rejected form keeps what the admin typed. */
export const formValues = (fd: FormData) =>
  Object.fromEntries([...fd.entries()].filter(([k, v]) => !k.startsWith("$") && typeof v === "string")) as Record<string, string>;

/**
 * Validates the product form. `slug` is only read on create (the edit form doesn't send it: changing
 * a slug would break every link and bookmark to the product), and derived from the name when blank.
 */
export function parseProductForm(get: Get, { create }: { create: boolean }): { ok: true; value: ProductInput } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const text = (field: ProductField, max: number, label: string) => {
    const v = get(field).trim();
    if (!v) errors[field] = `${label} is required.`;
    else if (v.length > max) errors[field] = `${label} must be ${max} characters or fewer.`;
    return v;
  };

  const name = text("name", 120, "Name");
  const description = text("description", 4000, "Description");
  const colour = text("colour", 60, "Colour");
  const imageAlt = text("imageAlt", 200, "Image description");

  let slug = "";
  if (create) {
    const typed = get("slug").trim();
    slug = typed || slugify(name);
    // A blank name already has its own error; don't add a second one for the slug derived from it.
    if (!isValidSlug(slug) && (typed || name)) errors.slug = "Use lowercase letters, numbers and single hyphens.";
  }

  const categoryId = get("categoryId");
  if (!isUuid(categoryId)) errors.categoryId = "Choose a category.";

  const department = get("department") as Department;
  if (!DEPARTMENTS.includes(department)) errors.department = "Choose a department.";

  const priceCents = toCents(get("price"));
  if (priceCents === null) errors.priceCents = "Enter a price like 1450 or 1450.00.";
  else if (priceCents <= 0) errors.priceCents = "Price must be above zero.";
  else if (priceCents > MAX_CENTS) errors.priceCents = "Price is too high.";

  const rawCompare = get("compareAt").trim();
  const compareAtCents = rawCompare ? toCents(rawCompare) : null;
  if (rawCompare && compareAtCents === null) errors.compareAtCents = "Enter an amount like 1800.00, or leave it empty.";
  else if (compareAtCents !== null && priceCents !== null && compareAtCents <= priceCents)
    errors.compareAtCents = "The original price must be above the price.";
  else if (compareAtCents !== null && compareAtCents > MAX_CENTS) errors.compareAtCents = "Amount is too high.";

  const stockQuantity = parseStock(get("stockQuantity"));
  if (stockQuantity === null) errors.stockQuantity = STOCK_ERROR;

  const stockDetail = get("stockDetail").trim() || null;
  if (stockDetail && stockDetail.length > 200) errors.stockDetail = "Keep this under 200 characters.";

  const imageUrl = get("imageUrl").trim();
  if (!isAllowedImageUrl(imageUrl)) errors.imageUrl = `Use an https://${IMAGE_HOST}/… image URL.`;

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      slug,
      description,
      categoryId,
      department,
      colour,
      priceCents: priceCents!,
      compareAtCents,
      stockQuantity: stockQuantity!,
      madeToOrder: get("madeToOrder") === "on",
      stockDetail,
      isGift: get("isGift") === "on",
      imageUrl,
      imageAlt,
    },
  };
}

export type CategoryInput = {
  name: string;
  slug: string;
  description: string;
  imageUrl: string | null;
  imageAlt: string | null;
  position: number;
};

export type CategoryField = keyof CategoryInput;
export type CategoryErrors = Partial<Record<CategoryField, string>>;

export const MAX_POSITION = 9999;

/**
 * Validates the category form. The slug is always derived from the name, and only on create: every
 * /collections/<slug> link depends on it. The image is optional, but URL and description come together
 * (a category with an image joins the homepage Collections strip).
 */
export function parseCategoryForm(get: Get, { create }: { create: boolean }): { ok: true; value: CategoryInput } | { ok: false; errors: CategoryErrors } {
  const errors: CategoryErrors = {};
  const name = get("name").trim();
  if (!name) errors.name = "Name is required.";
  else if (name.length > 60) errors.name = "Name must be 60 characters or fewer.";

  const slug = create ? slugify(name) : "";
  if (create && name && !isValidSlug(slug)) errors.name = "The name needs at least one letter or number for its URL.";

  const description = get("description").trim();
  if (!description) errors.description = "Description is required.";
  else if (description.length > 1000) errors.description = "Description must be 1000 characters or fewer.";

  const imageUrl = get("imageUrl").trim() || null;
  const imageAlt = get("imageAlt").trim() || null;
  if (imageUrl && !isAllowedImageUrl(imageUrl)) errors.imageUrl = `Use an https://${IMAGE_HOST}/… image URL, or leave it empty.`;
  else if (!imageUrl && imageAlt) errors.imageUrl = "Add the image URL, or clear the image description.";
  if (imageUrl && !imageAlt) errors.imageAlt = "Describe the image for screen readers.";
  else if (imageAlt && imageAlt.length > 200) errors.imageAlt = "Keep this under 200 characters.";

  const rawPosition = get("position").trim();
  const position = /^\d{1,4}$/.test(rawPosition) ? Number(rawPosition) : null;
  if (position === null) errors.position = `Enter a whole number from 0 to ${MAX_POSITION}.`;

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { name, slug, description, imageUrl, imageAlt, position: position! } };
}
