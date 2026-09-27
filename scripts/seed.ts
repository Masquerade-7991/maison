// Re-seeds the catalogue: npm run db:seed. Safe to run repeatedly; it clears the three
// catalogue tables first. Everything runs in one db.batch() so a failure leaves nothing half-written.
import "dotenv/config";
import { db } from "../src/db";
import { categories, productImages, products } from "../src/db/schema";

// Fixed base so createdAt ordering (and so the homepage "newest 8") is identical on every run.
const BASE_DATE = Date.UTC(2026, 8, 1);
const HOUR = 3_600_000;

const photo = (id: string, crop = "crop=faces,entropy") =>
  `https://images.unsplash.com/photo-${id}?ar=4:5&fit=crop&${crop}&w=1600&q=80`;

const categoryRows = [
  { slug: "ready-to-wear", name: "Ready-to-wear", description: "Tailoring, knitwear, dresses and outerwear.", image: "1483985988355-763728e1935b", imageAlt: "Woman in a burgundy coat and sunglasses carrying shopping bags" },
  { slug: "bags", name: "Bags", description: "Top-handles, shoulder bags and backpacks in leather and canvas.", image: "1584917865442-de89df76afd3", imageAlt: "Red leather top-handle bag on a white plinth" },
  { slug: "shoes", name: "Shoes", description: "Pumps, brogues, boots and sneakers, built to be resoled." },
  { slug: "accessories", name: "Accessories", description: "Watches, eyewear, hats and small leather goods.", image: "1511499767150-a48a237f0083", imageAlt: "Gold round sunglasses with green lenses on white marble" },
  { slug: "jewellery", name: "Jewellery", description: "Necklaces, bracelets and earrings, polished by hand." },
];

// Product description by category; the colour is appended per product.
const descriptionFor: Record<string, string> = {
  "ready-to-wear": "Cut for an easy, considered fit and finished by hand. Designed to layer through the seasons and wear for years.",
  bags: "Structured in full-grain leather with a softly lined interior, sized for the everyday essentials.",
  shoes: "Built on a comfortable last with a leather lining and a stitched sole that can be resoled.",
  accessories: "A finishing piece in lasting materials, made to be worn daily and passed on.",
  jewellery: "Polished by hand and set to catch the light without overwhelming it.",
};

type SeedProduct = {
  slug: string;
  name: string;
  category: string;
  department: "women" | "men" | "unisex";
  colour: string;
  priceCents: number;
  compareAtCents?: number;
  stockQuantity: number;
  madeToOrder?: boolean;
  stockDetail?: string;
  isGift?: boolean;
  photo: string;
  alt: string;
};

// Newest first: row i is created i hours before BASE_DATE.
const productRows: SeedProduct[] = [
  {slug: "satin-bomber-jacket", name: "Satin bomber jacket", category: "ready-to-wear", department: "women", colour: "Brown", priceCents: 145000, photo: "1591047139829-d91aecb6caea", alt: "Copper satin bomber jacket on a hanger", stockQuantity: 10},
  {slug: "crochet-fringe-poncho", name: "Crochet fringe poncho", category: "ready-to-wear", department: "women", colour: "Cream", priceCents: 98000, photo: "1434389677669-e08b4cac3105", alt: "Cream crochet poncho with fringe on a wooden hanger", stockQuantity: 10},
  {slug: "wicker-top-handle-bag", name: "Wicker top-handle bag", category: "bags", department: "women", colour: "Tan", priceCents: 210000, photo: "1590874103328-eac38a683ce7", alt: "Tan leather and wicker top-handle bag in a shop window", stockQuantity: 2, isGift: true},
  {slug: "round-metal-sunglasses", name: "Round metal sunglasses", category: "accessories", department: "unisex", colour: "Gold", priceCents: 46000, photo: "1511499767150-a48a237f0083", alt: "Gold round sunglasses with green lenses on white marble", stockQuantity: 10, isGift: true},
  {slug: "printed-stiletto-pump", name: "Printed stiletto pump", category: "shoes", department: "women", colour: "Blue", priceCents: 85000, photo: "1543163521-1bf539c55dd2", alt: "Blue floral-print stiletto pumps against a pale blue wall", stockQuantity: 10},
  {slug: "tailored-jogger-trouser", name: "Tailored jogger trouser", category: "ready-to-wear", department: "women", colour: "Pink", priceCents: 72000, photo: "1594633312681-425c7b97ccd1", alt: "Model wearing dusty-pink cuffed trousers and heels", stockQuantity: 10},
  {slug: "tan-leather-biker-jacket", name: "Tan leather biker jacket", category: "ready-to-wear", department: "men", colour: "Tan", priceCents: 320000, photo: "1487222477894-8943e31ef7b2", alt: "Man in a tan leather biker jacket and round sunglasses", stockQuantity: 10},
  {slug: "minimal-white-watch", name: "Minimal white watch", category: "accessories", department: "unisex", colour: "White", priceCents: 69000, photo: "1523275335684-37898b6baf30", alt: "White watch with a black face on a grey surface", stockQuantity: 10, isGift: true},
  {slug: "leather-top-handle-bag", name: "Leather top-handle bag", category: "bags", department: "women", colour: "Red", priceCents: 240000, photo: "1584917865442-de89df76afd3", alt: "Red leather top-handle bag on a white plinth", stockQuantity: 1, isGift: true},
  {slug: "belted-camel-coat", name: "Belted camel coat", category: "ready-to-wear", department: "women", colour: "Tan", priceCents: 290000, photo: "1539533018447-63fcce2678e3", alt: "Woman in a long belted camel coat walking down stone steps", stockQuantity: 10},
  {slug: "black-leather-jacket", name: "Black leather jacket", category: "ready-to-wear", department: "women", colour: "Black", priceCents: 340000, photo: "1551028719-00167b16eac5", alt: "Black leather biker jacket laid on white linen", compareAtCents: 420000, stockQuantity: 10},
  {slug: "silk-maxi-dress", name: "Silk maxi dress", category: "ready-to-wear", department: "women", colour: "Red", priceCents: 180000, photo: "1595777457583-95e059d581b8", alt: "Woman in a flowing red maxi dress on a garden path", stockQuantity: 0},
  {slug: "floral-wrap-dress", name: "Floral wrap dress", category: "ready-to-wear", department: "women", colour: "Red", priceCents: 135000, photo: "1572804013309-59a88b7e92f1", alt: "Woman in a red floral wrap dress against an ochre wall", stockQuantity: 10},
  {slug: "off-shoulder-jersey-dress", name: "Off-shoulder jersey dress", category: "ready-to-wear", department: "women", colour: "Purple", priceCents: 165000, photo: "1566174053879-31528523f8ae", alt: "Woman in a plum off-shoulder dress against a lilac backdrop", stockQuantity: 10},
  {slug: "dot-print-chambray-shirt", name: "Dot-print chambray shirt", category: "ready-to-wear", department: "women", colour: "Blue", priceCents: 52000, photo: "1596755094514-f87e34085b2c", alt: "Blue dot-print chambray shirt on a hanger", stockQuantity: 10},
  {slug: "belted-cotton-playsuit", name: "Belted cotton playsuit", category: "ready-to-wear", department: "women", colour: "Green", priceCents: 69000, photo: "1618932260643-eee4a2f652a6", alt: "Olive belted playsuit hanging against a white wall", stockQuantity: 10},
  {slug: "chain-shoulder-bag", name: "Chain shoulder bag", category: "bags", department: "women", colour: "Pink", priceCents: 160000, photo: "1566150905458-1bf1fc113f0d", alt: "Pink leather shoulder bag with a chain strap on a white block", stockQuantity: 3, isGift: true},
  {slug: "structured-satchel", name: "Structured satchel", category: "bags", department: "women", colour: "Green", priceCents: 175000, photo: "1594223274512-ad4803739b7c", alt: "Teal leather satchel with a gold clasp beside green leaves", stockQuantity: 10},
  {slug: "botanical-print-tote", name: "Botanical print tote", category: "bags", department: "women", colour: "Pink", priceCents: 220000, photo: "1591561954557-26941169b49e", alt: "Pale pink tote bag with a botanical print on a dark background", stockQuantity: 10},
  {slug: "crescent-pendant-necklace", name: "Crescent pendant necklace", category: "jewellery", department: "women", colour: "Gold", priceCents: 62000, photo: "1599643478518-a784e5dc4c8f", alt: "Gold chain necklaces with a crescent and a blue crystal pendant", stockQuantity: 10, isGift: true},
  {slug: "crystal-link-bracelet", name: "Crystal link bracelet", category: "jewellery", department: "women", colour: "Gold", priceCents: 54000, photo: "1611591437281-460bfbe1220a", alt: "Rose-gold crystal bracelet on a pink surface", stockQuantity: 10, isGift: true},
  {slug: "sapphire-drop-earrings", name: "Sapphire drop earrings", category: "jewellery", department: "women", colour: "Blue", priceCents: 98000, photo: "1535632066927-ab7c9ab60908", alt: "Blue stone drop earrings with crystal surrounds on a green leaf", stockQuantity: 0, isGift: true},
  {slug: "felt-fedora", name: "Felt fedora", category: "accessories", department: "women", colour: "Blue", priceCents: 48000, photo: "1514327605112-b887c0e61c0a", alt: "Woman wearing a slate-blue felt fedora with a black band", stockQuantity: 10},
  {slug: "wool-two-piece-suit", name: "Wool two-piece suit", category: "ready-to-wear", department: "men", colour: "Navy", priceCents: 360000, photo: "1617137968427-85924c800a22", alt: "Man in a navy suit walking past a glass building", madeToOrder: true, stockDetail: "Made to measure. Ships in 4–6 weeks.", stockQuantity: 0},
  {slug: "leather-rider-jacket", name: "Leather rider jacket", category: "ready-to-wear", department: "men", colour: "Black", priceCents: 310000, photo: "1520975954732-35dd22299614", alt: "Man in a black leather jacket crouching on a brick rooftop", stockQuantity: 10},
  {slug: "cotton-poplin-shirt", name: "Cotton poplin shirt", category: "ready-to-wear", department: "men", colour: "White", priceCents: 45000, photo: "1602810318383-e386cc2a3ccf", alt: "Folded grey, white and burgundy dress shirts on a wooden table", stockQuantity: 10},
  {slug: "heavyweight-cotton-t-shirt", name: "Heavyweight cotton T-shirt", category: "ready-to-wear", department: "men", colour: "White", priceCents: 29000, photo: "1521572163474-6864f9cf17ab", alt: "Man wearing a plain white crew-neck T-shirt", stockQuantity: 10},
  {slug: "brushed-fleece-hoodie", name: "Brushed fleece hoodie", category: "ready-to-wear", department: "men", colour: "Grey", priceCents: 59000, photo: "1556821840-3a63f95609a7", alt: "Man in a grey hooded sweatshirt seen from behind, looking over a valley", compareAtCents: 79000, stockQuantity: 10},
  {slug: "crew-neck-sweatshirt", name: "Crew-neck sweatshirt", category: "ready-to-wear", department: "men", colour: "White", priceCents: 48000, photo: "1620799140408-edc6dcb6d633", alt: "White crew-neck sweatshirt laid flat", stockQuantity: 10},
  {slug: "leather-derby-shoe", name: "Leather derby shoe", category: "shoes", department: "men", colour: "Brown", priceCents: 89000, photo: "1614252235316-8c857d38b5f4", alt: "Close-up of a brown leather derby shoe with a perforated toe", stockQuantity: 2},
  {slug: "suede-brogue", name: "Suede brogue", category: "shoes", department: "men", colour: "Green", priceCents: 95000, photo: "1560343090-f0409e92791a", alt: "Green suede brogue on a pale pink plinth", stockQuantity: 10},
  {slug: "lace-up-leather-boot", name: "Lace-up leather boot", category: "shoes", department: "men", colour: "Brown", priceCents: 120000, photo: "1608256246200-53e635b5b65f", alt: "Pair of dark brown lace-up leather boots on a black surface", stockQuantity: 10},
  {slug: "leather-backpack", name: "Leather backpack", category: "bags", department: "men", colour: "Brown", priceCents: 190000, photo: "1622560480605-d83c853bc5c3", alt: "Worn brown leather backpack against a white wall", stockQuantity: 0, isGift: true},
  {slug: "nylon-backpack", name: "Nylon backpack", category: "bags", department: "men", colour: "Navy", priceCents: 110000, photo: "1553062407-98eeb64c6a62", alt: "Navy nylon backpack standing on a white floor", stockQuantity: 10},
  {slug: "silver-pocket-watch", name: "Silver pocket watch", category: "accessories", department: "men", colour: "Silver", priceCents: 140000, photo: "1509048191080-d2984bad6ae5", alt: "Silver pocket watch hanging on a chain above a path", stockQuantity: 10, isGift: true},
  {slug: "leather-belt", name: "Leather belt", category: "accessories", department: "men", colour: "Brown", priceCents: 39000, photo: "1624222247344-550fb60583dc", alt: "Tan leather belt with a silver buckle", stockQuantity: 10, isGift: true},
  {slug: "bifold-wallet", name: "Bifold wallet", category: "accessories", department: "men", colour: "Brown", priceCents: 42000, photo: "1627123424574-724758594e93", alt: "Brown leather bifold wallet on a dark background", stockQuantity: 10, isGift: true},
  {slug: "leather-strap-watch", name: "Leather strap watch", category: "accessories", department: "unisex", colour: "Brown", priceCents: 78000, photo: "1524592094714-0f0654e20314", alt: "Hand holding a watch with a white face and a taupe leather strap", stockQuantity: 10, isGift: true},
  {slug: "low-top-suede-sneaker", name: "Low-top suede sneaker", category: "shoes", department: "unisex", colour: "White", priceCents: 65000, photo: "1603808033192-082d6919d3e1", alt: "White and tan suede sneakers on an orange backdrop", stockQuantity: 10},
  {slug: "mesh-trucker-cap", name: "Mesh trucker cap", category: "accessories", department: "unisex", colour: "White", priceCents: 26000, photo: "1588850561407-ed78c282e89b", alt: "White trucker cap on a white surface", stockQuantity: 10},
];

async function main() {
  const categoryIds = new Map(categoryRows.map((c) => [c.slug, crypto.randomUUID()]));

  const categoryValues = categoryRows.map((c, position) => ({
    id: categoryIds.get(c.slug)!,
    slug: c.slug,
    name: c.name,
    description: c.description,
    imageUrl: c.image ? photo(c.image) : null,
    imageAlt: c.imageAlt ?? null,
    position,
  }));

  const productValues = productRows.map((p, i) => ({
    id: crypto.randomUUID(),
    slug: p.slug,
    name: p.name,
    description: `${descriptionFor[p.category]} Shown in ${p.colour.toLowerCase()}.`,
    categoryId: categoryIds.get(p.category)!,
    department: p.department,
    colour: p.colour,
    priceCents: p.priceCents,
    compareAtCents: p.compareAtCents ?? null,
    stockQuantity: p.stockQuantity,
    madeToOrder: p.madeToOrder ?? false,
    stockDetail: p.stockDetail ?? null,
    isGift: p.isGift ?? false,
    createdAt: new Date(BASE_DATE - i * HOUR),
    updatedAt: new Date(BASE_DATE - i * HOUR),
  }));

  // Position 0 is the packshot; 1 and 2 are tighter crops of the same photo standing in for detail shots.
  const imageValues = productRows.flatMap((p, i) => {
    const productId = productValues[i].id;
    const name = p.name.toLowerCase();
    return [
      { productId, position: 0, url: photo(p.photo), alt: p.alt },
      { productId, position: 1, url: photo(p.photo, "crop=focalpoint&fp-x=0.5&fp-y=0.45&fp-z=1.7"), alt: `Close-up of the ${name}` },
      { productId, position: 2, url: photo(p.photo, "crop=focalpoint&fp-x=0.5&fp-y=0.6&fp-z=2.6"), alt: `Detail of the ${name}` },
    ];
  });

  await db.batch([
    db.delete(productImages),
    db.delete(products),
    db.delete(categories),
    db.insert(categories).values(categoryValues),
    db.insert(products).values(productValues),
    db.insert(productImages).values(imageValues),
  ]);

  console.log(`Seeded ${categoryValues.length} categories, ${productValues.length} products, ${imageValues.length} images.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
