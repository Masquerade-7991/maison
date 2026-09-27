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

  // Wider catalogue: older than everything above, so the homepage and /new-arrivals are unchanged.
  // Ready-to-wear
  {slug: "check-wool-coat", name: "Check wool coat", category: "ready-to-wear", department: "women", colour: "Green", priceCents: 245000, photo: "1485968579580-b6d095142e6e", alt: "Woman in a dark green check coat on a city street", stockQuantity: 10},
  {slug: "floral-tea-dress", name: "Floral tea dress", category: "ready-to-wear", department: "women", colour: "White", priceCents: 89000, photo: "1496747611176-843222e1e57c", alt: "Woman in a white floral wrap dress by the sea", stockQuantity: 10},
  {slug: "striped-wide-leg-trouser", name: "Striped wide-leg trouser", category: "ready-to-wear", department: "women", colour: "Black", priceCents: 68000, compareAtCents: 85000, photo: "1509631179647-0177331693ae", alt: "Woman in black-and-white striped wide-leg trousers against a teal wall", stockQuantity: 10},
  {slug: "double-faced-wool-coat", name: "Double-faced wool coat", category: "ready-to-wear", department: "women", colour: "Blue", priceCents: 275000, photo: "1539109136881-3be0616acf4b", alt: "Woman in a pale blue wool coat in a cathedral square", stockQuantity: 3},
  {slug: "pleated-tennis-skirt", name: "Pleated tennis skirt", category: "ready-to-wear", department: "women", colour: "White", priceCents: 42000, photo: "1582142306909-195724d33ffc", alt: "Woman in a white pleated skirt and denim jacket on a street", stockQuantity: 10},
  {slug: "corduroy-midi-dress", name: "Corduroy midi dress", category: "ready-to-wear", department: "women", colour: "Red", priceCents: 98000, photo: "1585487000160-6ebcfceb0d03", alt: "Woman in a burgundy corduroy midi dress beside a palm", stockQuantity: 10},
  {slug: "denim-shirt-dress", name: "Denim shirt dress", category: "ready-to-wear", department: "women", colour: "Blue", priceCents: 76000, photo: "1591369822096-ffd140ec948f", alt: "Woman in a short-sleeved denim shirt dress", stockQuantity: 0},
  {slug: "cotton-chino-trouser", name: "Cotton chino trouser", category: "ready-to-wear", department: "men", colour: "Tan", priceCents: 39000, photo: "1473966968600-fa801b869a1a", alt: "Man in khaki chinos, a denim jacket and white sneakers", stockQuantity: 10},
  {slug: "denim-trucker-jacket", name: "Denim trucker jacket", category: "ready-to-wear", department: "men", colour: "Blue", priceCents: 58000, photo: "1551537482-f2075a1d41f2", alt: "Man in a light-wash denim jacket against a teal door", stockQuantity: 10},
  {slug: "unstructured-camel-blazer", name: "Unstructured camel blazer", category: "ready-to-wear", department: "men", colour: "Tan", priceCents: 165000, photo: "1552374196-1ab2a1c593e8", alt: "Man in a camel blazer seated on a wooden stool", stockQuantity: 10},
  {slug: "windowpane-check-blazer", name: "Windowpane check blazer", category: "ready-to-wear", department: "men", colour: "Navy", priceCents: 185000, photo: "1592878904946-b3cd8ae243d0", alt: "Man in a navy windowpane-check blazer, shirt and tie", stockQuantity: 10},
  {slug: "check-three-piece-suit", name: "Check three-piece suit", category: "ready-to-wear", department: "men", colour: "Blue", priceCents: 395000, photo: "1594938298603-c8148c4dae35", alt: "Man in a blue check three-piece suit and striped tie", stockQuantity: 2},
  {slug: "raw-denim-jeans", name: "Raw denim jeans", category: "ready-to-wear", department: "men", colour: "Navy", priceCents: 32000, photo: "1624378439575-d8705ad7ae80", alt: "Dark raw-denim jeans laid flat on white paper", stockQuantity: 10},
  {slug: "cotton-field-jacket", name: "Cotton field jacket", category: "ready-to-wear", department: "unisex", colour: "Green", priceCents: 72000, photo: "1544022613-e87ca75a784a", alt: "Person in an olive cotton field jacket and a black beanie", stockQuantity: 10},
  // Bags
  {slug: "pleated-half-moon-bag", name: "Pleated half-moon bag", category: "bags", department: "women", colour: "Green", priceCents: 189000, photo: "1564422170194-896b89110ef8", alt: "Teal pleated half-moon bag beside a leather tote", stockQuantity: 10},
  {slug: "croc-embossed-mini-bag", name: "Croc-embossed mini bag", category: "bags", department: "women", colour: "Red", priceCents: 132000, photo: "1575032617751-6ddec2089882", alt: "Hand holding a burgundy croc-embossed mini bag with a gold clasp", stockQuantity: 1, isGift: true},
  {slug: "leather-city-backpack", name: "Leather city backpack", category: "bags", department: "men", colour: "Black", priceCents: 98000, photo: "1581605405669-fcdf81165afa", alt: "Hand holding a black backpack against a white wall", stockQuantity: 10},
  {slug: "woven-leather-shoulder-bag", name: "Woven leather shoulder bag", category: "bags", department: "women", colour: "Brown", priceCents: 210000, photo: "1598532163257-ae3c6b2524b6", alt: "Cognac woven leather bag with a gold chain strap", stockQuantity: 10},
  {slug: "leather-crossbody-bag", name: "Leather crossbody bag", category: "bags", department: "unisex", colour: "Tan", priceCents: 78000, photo: "1600857062241-98e5dba7f214", alt: "Tan leather crossbody bag with a flap front", stockQuantity: 10, isGift: true},
  {slug: "buckled-leather-satchel", name: "Buckled leather satchel", category: "bags", department: "men", colour: "Grey", priceCents: 145000, compareAtCents: 185000, photo: "1605733513597-a8f8341084e6", alt: "Grey leather satchel with twin buckle straps", stockQuantity: 10},
  {slug: "structured-work-tote", name: "Structured work tote", category: "bags", department: "women", colour: "Black", priceCents: 168000, photo: "1614179689702-355944cd0918", alt: "Black structured tote on white bedding", stockQuantity: 10},
  // Shoes
  {slug: "polished-leather-blucher", name: "Polished leather blucher", category: "shoes", department: "men", colour: "Brown", priceCents: 79000, photo: "1449505278894-297fdb3edbc1", alt: "Brown leather lace-up shoes on a wooden floor", stockQuantity: 10},
  {slug: "suede-court-pump", name: "Suede court pump", category: "shoes", department: "women", colour: "Navy", priceCents: 72000, photo: "1515347619252-60a4bf4fff4f", alt: "Hand holding a navy suede court pump", stockQuantity: 10},
  {slug: "crystal-embellished-pump", name: "Crystal-embellished pump", category: "shoes", department: "women", colour: "Silver", priceCents: 145000, photo: "1518049362265-d5b2a6467637", alt: "Silver crystal-embellished pumps in front of a white chapel", stockQuantity: 2, isGift: true},
  {slug: "leather-work-boot", name: "Leather work boot", category: "shoes", department: "men", colour: "Brown", priceCents: 98000, photo: "1520639888713-7851133b1ed0", alt: "Person lacing brown leather work boots", stockQuantity: 10},
  {slug: "double-monk-strap", name: "Double monk strap", category: "shoes", department: "men", colour: "Brown", priceCents: 115000, photo: "1533867617858-e7b97e060509", alt: "Brown double monk strap shoes on a wooden floor", madeToOrder: true, stockDetail: "Handmade to order. Ships in 3–4 weeks.", stockQuantity: 0},
  {slug: "pointed-leather-pump", name: "Pointed leather pump", category: "shoes", department: "women", colour: "Cream", priceCents: 68000, photo: "1535043934128-cf0b28d52f95", alt: "Cream pointed-toe pumps on a reflective floor", stockQuantity: 10},
  {slug: "chunky-runner-sneaker", name: "Chunky runner sneaker", category: "shoes", department: "unisex", colour: "White", priceCents: 59000, photo: "1560769629-975ec94e6a86", alt: "Multicoloured chunky sneakers on white plinths", stockQuantity: 10},
  {slug: "crossover-platform-sandal", name: "Crossover platform sandal", category: "shoes", department: "women", colour: "Red", priceCents: 54000, compareAtCents: 69000, photo: "1562273138-f46be4ebdf33", alt: "Burgundy crossover platform sandals on a pale pink ground", stockQuantity: 10},
  {slug: "black-leather-pump", name: "Black leather pump", category: "shoes", department: "women", colour: "Black", priceCents: 65000, photo: "1596703263926-eb0762ee17e4", alt: "Hand holding a black leather pump by the heel", stockQuantity: 10},
  {slug: "waxed-suede-boot", name: "Waxed suede boot", category: "shoes", department: "men", colour: "Green", priceCents: 89000, photo: "1605812860427-4024433a70fd", alt: "Worn olive suede boots hanging against a dark background", stockQuantity: 0},
  // Accessories
  {slug: "acetate-sunglasses", name: "Acetate sunglasses", category: "accessories", department: "unisex", colour: "Black", priceCents: 38000, photo: "1473496169904-658ba7c44d8a", alt: "Black sunglasses resting on a sand dune by the sea", stockQuantity: 10, isGift: true},
  {slug: "metal-cat-eye-sunglasses", name: "Metal cat-eye sunglasses", category: "accessories", department: "women", colour: "Gold", priceCents: 42000, photo: "1508296695146-257a814070b4", alt: "Rose-gold cat-eye sunglasses with brown lenses", stockQuantity: 10, isGift: true},
  {slug: "washed-cotton-cap", name: "Washed cotton cap", category: "accessories", department: "unisex", colour: "Grey", priceCents: 18000, photo: "1521369909029-2afed882baee", alt: "Washed grey cotton cap on a white surface", stockQuantity: 10},
  {slug: "field-watch", name: "Field watch", category: "accessories", department: "men", colour: "Black", priceCents: 52000, photo: "1533139502658-0198f920d8e8", alt: "Watch with a black strap standing on a rock at sunset", stockQuantity: 10, isGift: true},
  {slug: "ribbed-wool-beanie", name: "Ribbed wool beanie", category: "accessories", department: "unisex", colour: "Pink", priceCents: 16000, photo: "1576871337632-b9aef4c17ab9", alt: "Pink, brown and yellow ribbed beanies on concrete", stockQuantity: 10, isGift: true},
  {slug: "clear-frame-sunglasses", name: "Clear-frame sunglasses", category: "accessories", department: "unisex", colour: "Tan", priceCents: 39000, photo: "1577803645773-f96470509666", alt: "Clear-frame sunglasses with amber lenses by the sea", stockQuantity: 10},
  {slug: "merino-knit-scarf", name: "Merino knit scarf", category: "accessories", department: "unisex", colour: "Green", priceCents: 29000, photo: "1457545195570-67f207084966", alt: "Folded knit scarves in green and grey stacked on a shelf", stockQuantity: 10, isGift: true},
  {slug: "wide-brim-felt-hat", name: "Wide-brim felt hat", category: "accessories", department: "women", colour: "Red", priceCents: 46000, photo: "1529958030586-3aae4ca485ff", alt: "Felt hats in burgundy, grey and white", stockQuantity: 10},
  {slug: "cotton-bucket-hat", name: "Cotton bucket hat", category: "accessories", department: "unisex", colour: "Tan", priceCents: 22000, photo: "1578681994506-b8f463449011", alt: "Man in a tan cotton bucket hat and black sweatshirt", stockQuantity: 10},
  {slug: "printed-silk-tie", name: "Printed silk tie", category: "accessories", department: "men", colour: "Purple", priceCents: 19000, photo: "1589756823695-278bc923f962", alt: "Rolled lilac printed silk tie on a wooden table", stockQuantity: 10, isGift: true},
  {slug: "polka-dot-silk-tie", name: "Polka-dot silk tie", category: "accessories", department: "men", colour: "Black", priceCents: 19000, photo: "1598033129183-c4f50c736f10", alt: "Man in a white shirt and a dark polka-dot silk tie", stockQuantity: 10, isGift: true},
  // Jewellery
  {slug: "pearl-strand-necklace", name: "Pearl strand necklace", category: "jewellery", department: "women", colour: "White", priceCents: 185000, photo: "1515562141207-7a88fb7ce338", alt: "Pearl necklace with a crystal clasp in a gift box", stockQuantity: 10, isGift: true},
  {slug: "infinity-drop-earrings", name: "Infinity drop earrings", category: "jewellery", department: "women", colour: "Gold", priceCents: 36000, photo: "1535556116002-6281ff3e9f36", alt: "Gold link drop earrings on a white notebook", stockQuantity: 10, isGift: true},
  {slug: "stacking-ring-set", name: "Stacking ring set", category: "jewellery", department: "women", colour: "Gold", priceCents: 88000, photo: "1543294001-f7cd5d7fb516", alt: "Stack of gold mesh rings set with pavé crystals", stockQuantity: 10, isGift: true},
  {slug: "crystal-tennis-bracelet", name: "Crystal tennis bracelet", category: "jewellery", department: "women", colour: "Silver", priceCents: 225000, photo: "1573408301185-9146fe634ad0", alt: "Crystal tennis bracelet on a black reflective surface", stockQuantity: 2, isGift: true},
  {slug: "silver-hoop-earrings", name: "Silver hoop earrings", category: "jewellery", department: "women", colour: "Silver", priceCents: 28000, photo: "1600721391776-b5cd0e0048f9", alt: "Woman wearing small silver hoop earrings and a fine gold chain", stockQuantity: 10, isGift: true},
  {slug: "chunky-chain-bracelet", name: "Chunky chain bracelet", category: "jewellery", department: "men", colour: "Gold", priceCents: 64000, photo: "1602173574767-37ac01994b2a", alt: "Chunky gold chain bracelet on an open magazine", stockQuantity: 10, isGift: true},
  {slug: "pink-sapphire-ring", name: "Pink sapphire ring", category: "jewellery", department: "women", colour: "Pink", priceCents: 320000, photo: "1603561591411-07134e71a2a9", alt: "Rose-gold ring with a pink cushion-cut stone and a pavé band", stockQuantity: 1, isGift: true},
  {slug: "medallion-pendant-necklace", name: "Medallion pendant necklace", category: "jewellery", department: "unisex", colour: "Gold", priceCents: 48000, photo: "1506630448388-4e683c67ddb0", alt: "Gold and silver pendant necklaces hanging in a row", stockQuantity: 10, isGift: true},
  {slug: "twisted-gold-hoops", name: "Twisted gold hoops", category: "jewellery", department: "women", colour: "Gold", priceCents: 34000, photo: "1617038260897-41a1f14a8ca0", alt: "Twisted gold hoop earrings on a white stone", stockQuantity: 10, isGift: true},
  {slug: "halo-solitaire-ring", name: "Halo solitaire ring", category: "jewellery", department: "women", colour: "Silver", priceCents: 410000, photo: "1605100804763-247f67b3557e", alt: "Ring with a round centre stone in a pavé halo, on a dark stand", stockQuantity: 10, isGift: true},
  {slug: "layered-chain-necklace", name: "Layered chain necklace", category: "jewellery", department: "women", colour: "Gold", priceCents: 44000, photo: "1590548784585-643d2b9f2925", alt: "Woman wearing layered fine gold chain necklaces", stockQuantity: 10, isGift: true},
  {slug: "heart-pendant-necklace", name: "Heart pendant necklace", category: "jewellery", department: "women", colour: "Silver", priceCents: 39000, photo: "1588444837495-c6cfeb53f32d", alt: "Silver heart pendant necklace set with pavé crystals", stockQuantity: 0, isGift: true},
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
