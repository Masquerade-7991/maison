// Static storefront chrome only. No catalogue data lives here; that comes from src/lib/products.ts.

export const nav = [
  { label: "Women", href: "/women" },
  { label: "Men", href: "/men" },
  { label: "Bags", href: "/collections/bags" },
  { label: "Accessories", href: "/collections/accessories" },
  { label: "Gifts", href: "/gifts" },
  // ponytail: editorial section, 404s until it exists.
  { label: "Stories", href: "/stories" },
];

export const footer = [
  { title: "Client services", links: ["Contact us", "Shipping", "Returns", "FAQ"] },
  { title: "The house", links: ["About", "Sustainability", "Careers", "Stores"] },
  { title: "Legal", links: ["Privacy", "Terms", "Cookies", "Accessibility"] },
];

export const hero = {
  src: "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=2400&q=80",
  alt: "Woman in a pale blue coat in a cathedral square surrounded by pigeons",
};

export const atelier = {
  src: "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?ar=4:5&fit=crop&w=1600&q=80",
  alt: "Neutral knitwear hanging on a rail beside dried pampas grass",
};

export const services = [
  { title: "Complimentary shipping", body: "Free express delivery on every order, with signature on arrival." },
  { title: "Returns within 30 days", body: "Send it back in its original packaging for a full refund." },
  { title: "Signature packaging", body: "Every piece arrives wrapped and boxed, ready to give." },
  { title: "Client advisors", body: "Styling and sizing help by chat, phone or appointment." },
];

// Product page "Details & care" and the display-only size list, by category slug.
// ponytail: no variants yet, so sizes are not stocked individually.
export const categoryDetails: Record<string, { details: string[]; sizes: string[] }> = {
  "ready-to-wear": { details: ["Regular fit, true to size", "Made in Italy", "Dry clean only"], sizes: ["XS", "S", "M", "L", "XL"] },
  bags: { details: ["Full-grain leather", "Cotton-linen lining", "Brass hardware", "Made in Italy"], sizes: [] },
  shoes: { details: ["Leather upper and lining", "Rubber-injected leather sole", "Made in Portugal"], sizes: ["38", "39", "40", "41", "42", "43", "44"] },
  accessories: { details: ["Presented in a signature box", "Made in Italy"], sizes: [] },
  jewellery: { details: ["18k gold-plated brass", "Hypoallergenic", "Presented in a signature pouch"], sizes: [] },
};

export const detailsFor = (categorySlug: string) => categoryDetails[categorySlug] ?? { details: [], sizes: [] };
