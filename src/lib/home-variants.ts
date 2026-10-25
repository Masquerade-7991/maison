// The homepage per region: the hero, which sections appear and in what order, and the pieces each one
// features. Plain data, read by src/app/[market]/page.tsx. Written for the season (October 2026 into early
// 2027): new seasons and campaigns (Ramadan from about 8 Feb 2027, spring in the north) are edits here.
// Pure (.ts imports), so home-variants.check.mjs runs it in Node.
import { atelier, hero } from "./sample-data.ts";

// Photos the catalogue already uses (images.unsplash.com is the only host next.config.ts allows).
const photo = (id: string, w = 2400) => `https://images.unsplash.com/photo-${id}?w=${w}&q=80`;

type Image = { src: string; alt: string };
type Link = { href: string; label: string };

export type HomeSection =
  /** Categories with an image; `lead` puts these slugs first (the first is the large tile). */
  | { kind: "collections"; lead?: string[] }
  | { kind: "new-arrivals" }
  /** Hand-picked pieces in order, by slug: the first 8 that are in stock (4 if fewer), so the extras are backups. */
  | { kind: "products"; title: string; slugs: string[]; link: Link }
  | { kind: "editorial"; image: Image; label: string; title: string; body: string; cta: Link }
  | { kind: "stories"; title: string; slugs: string[] }
  /** Shortcuts into /gifts by the listing's price bands, written in the visitor's currency. */
  | { kind: "gift-prices" }
  /** The services strip; `lead` puts these titles first. */
  | { kind: "services"; lead?: string[] };

export type HomeVariant = {
  id: string;
  hero: Image & { position: string; label: string; title: string; body: string; primary: Link; secondary: Link };
  sections: HomeSection[];
};

const quietSeason: HomeVariant = {
  id: "default",
  hero: {
    ...hero,
    position: "center 25%",
    label: "Autumn–Winter 2026",
    title: "The Quiet Season",
    body: "Soft tailoring, heavy wool and pale blues for the colder months.",
    primary: { href: "/women", label: "Shop the collection" },
    secondary: { href: "/men", label: "Shop men" },
  },
  sections: [
    { kind: "collections" },
    { kind: "new-arrivals" },
    {
      kind: "editorial",
      image: atelier,
      label: "The edit",
      title: "Knitwear, softly",
      body: "Cashmere, merino and bouclé in undyed tones. Pieces designed to layer through the colder months and wear for years after.",
      cta: { href: "/collections/ready-to-wear", label: "Discover the edit" },
    },
    { kind: "services" },
  ],
};

// North America: the holiday season opens with Thanksgiving. Luxury shoppers choose fewer, better gifts
// (handbags and fine jewellery lead), many also buy for themselves, and most prefer to shop online.
const gifting: HomeVariant = {
  id: "north-america",
  hero: {
    src: photo("1483985988355-763728e1935b"),
    alt: "Woman in a burgundy coat and sunglasses carrying shopping bags",
    position: "center 30%",
    label: "Holiday 2026",
    title: "The Gifting Season",
    body: "For them, and for you: leather, gold and soft wool, wrapped and ready to give.",
    primary: { href: "/gifts", label: "Shop gifts" },
    secondary: { href: "/new-arrivals", label: "New arrivals" },
  },
  sections: [
    {
      kind: "products",
      title: "The gift edit",
      slugs: ["leather-top-handle-bag", "pearl-strand-necklace", "leather-crossbody-bag", "crystal-tennis-bracelet", "chain-shoulder-bag", "halo-solitaire-ring", "leather-strap-watch", "merino-knit-scarf", "twisted-gold-hoops", "bifold-wallet"],
      link: { href: "/gifts", label: "All gifts" },
    },
    { kind: "gift-prices" },
    {
      kind: "editorial",
      image: { src: photo("1515562141207-7a88fb7ce338", 1600), alt: "Pearl necklace with a crystal clasp in a gift box" },
      label: "Ready to give",
      title: "Wrapped, boxed, delivered",
      body: "Every piece arrives in our signature packaging with free express delivery, and 30 days to change your mind.",
      cta: { href: "/gifts", label: "Find a gift" },
    },
    { kind: "new-arrivals" },
    { kind: "services", lead: ["Signature packaging", "Complimentary shipping"] },
  ],
};

// UK and Europe: buying with purpose over impulse and logos; quiet luxury has become heritage classics.
const madeToLast: HomeVariant = {
  id: "europe",
  hero: {
    src: photo("1539533018447-63fcce2678e3"),
    alt: "Woman in a long belted camel coat walking down stone steps",
    position: "center 35%",
    label: "Autumn–Winter 2026",
    title: "Made to Last",
    body: "Bought once, worn for years: tailoring, wool coats and leather made to be mended, not replaced.",
    primary: { href: "/collections/ready-to-wear", label: "Shop the collection" },
    secondary: { href: "/stories", label: "Read the stories" },
  },
  sections: [
    {
      kind: "products",
      title: "Pieces to keep",
      slugs: ["belted-camel-coat", "wool-two-piece-suit", "double-faced-wool-coat", "buckled-leather-satchel", "check-wool-coat", "unstructured-camel-blazer", "leather-top-handle-bag", "check-three-piece-suit", "leather-backpack", "windowpane-check-blazer"],
      link: { href: "/collections/ready-to-wear", label: "View all" },
    },
    { kind: "stories", title: "Made to be kept", slugs: ["a-coat-for-twenty-winters", "coming-home-to-be-mended", "the-care-of-leather"] },
    {
      kind: "editorial",
      image: { src: photo("1617137968427-85924c800a22", 1600), alt: "Man in a navy suit walking past a glass building" },
      label: "Tailoring",
      title: "Cut to be kept",
      body: "Wool suiting and unstructured jackets made in Italy, built to be altered and worn for decades.",
      cta: { href: "/men", label: "Shop tailoring" },
    },
    { kind: "collections" },
    { kind: "services", lead: ["Returns within 30 days", "Client advisors"] },
  ],
};

// Japan, South Korea, Hong Kong: product-first and phone-first; craft and logo-free quality, and in Hong
// Kong a strong rebound in jewellery and watches.
const inDetail: HomeVariant = {
  id: "east-asia",
  hero: {
    src: photo("1524592094714-0f0654e20314"),
    alt: "Hand holding a watch with a white face and a taupe leather strap",
    position: "center 45%",
    label: "New season",
    title: "In Detail",
    body: "The newest pieces first, and the small things made well: gold, watches and fine leather.",
    primary: { href: "/new-arrivals", label: "Shop new arrivals" },
    secondary: { href: "/collections/jewellery", label: "Jewellery" },
  },
  sections: [
    { kind: "new-arrivals" },
    {
      kind: "editorial",
      image: { src: photo("1617038260897-41a1f14a8ca0", 1600), alt: "Twisted gold hoop earrings on a white stone" },
      label: "Close up",
      title: "Small things, made well",
      body: "Polished gold, simple watch faces and hand-finished leather: the pieces you notice at arm's length.",
      cta: { href: "/collections/jewellery", label: "Shop jewellery" },
    },
    {
      kind: "products",
      title: "Gold and time",
      slugs: ["twisted-gold-hoops", "leather-strap-watch", "layered-chain-necklace", "field-watch", "stacking-ring-set", "silver-pocket-watch", "medallion-pendant-necklace", "minimal-white-watch", "silver-hoop-earrings", "crescent-pendant-necklace"],
      link: { href: "/collections/accessories", label: "View all" },
    },
    { kind: "stories", title: "The craft", slugs: ["six-pairs-of-hands", "gold-that-is-meant-to-age", "the-care-of-leather"] },
    { kind: "services" },
  ],
};

// Australia and Singapore: spring into a summer Christmas, and warm all year in Southeast Asia, where
// summer and resort wear outsell cold-weather clothes. No coats or knitwear.
const intoTheLight: HomeVariant = {
  id: "warm",
  hero: {
    src: photo("1496747611176-843222e1e57c"),
    alt: "Woman in a white floral wrap dress by the sea, holding a straw bag",
    position: "center 40%",
    label: "Spring–Summer",
    title: "Into the Light",
    body: "Silk, cotton and woven straw for warm days and long evenings.",
    primary: { href: "/women", label: "Shop women" },
    secondary: { href: "/collections/accessories", label: "Accessories" },
  },
  sections: [
    {
      kind: "products",
      title: "Made for the sun",
      slugs: ["silk-maxi-dress", "floral-tea-dress", "wicker-top-handle-bag", "round-metal-sunglasses", "floral-wrap-dress", "cotton-poplin-shirt", "belted-cotton-playsuit", "cotton-bucket-hat", "cotton-chino-trouser", "acetate-sunglasses"],
      link: { href: "/women", label: "View all" },
    },
    { kind: "collections", lead: ["accessories", "bags"] },
    {
      kind: "editorial",
      image: { src: photo("1572804013309-59a88b7e92f1", 1600), alt: "Woman in a red floral wrap dress against an ochre wall" },
      label: "Sun-ready",
      title: "Light layers, bright days",
      body: "Sunglasses, straw and fine cotton, from a morning swim to dinner outside.",
      cta: { href: "/collections/accessories", label: "Shop accessories" },
    },
    { kind: "services", lead: ["Complimentary shipping", "Returns within 30 days"] },
  ],
};

// UAE: the region's luxury hub; October to April is the social season, gifting and exclusivity drive
// spending, and longer silhouettes lead (modest fashion is the top category around Ramadan).
const theSeason: HomeVariant = {
  id: "gulf",
  hero: {
    src: photo("1605100804763-247f67b3557e"),
    alt: "Ring with a round centre stone in a pavé halo, on a dark stand",
    position: "center 50%",
    label: "The 2026–27 season",
    title: "Evenings, Gathered",
    body: "Long silhouettes, fluid silk and fine jewellery for the season's dinners and celebrations.",
    primary: { href: "/women", label: "Shop the season" },
    secondary: { href: "/collections/jewellery", label: "Fine jewellery" },
  },
  sections: [
    {
      kind: "products",
      title: "For the evening",
      slugs: ["silk-maxi-dress", "striped-wide-leg-trouser", "unstructured-camel-blazer", "belted-camel-coat", "chain-shoulder-bag", "croc-embossed-mini-bag", "wool-two-piece-suit", "leather-top-handle-bag", "structured-satchel", "pleated-half-moon-bag"],
      link: { href: "/women", label: "View all" },
    },
    {
      kind: "editorial",
      image: { src: photo("1595777457583-95e059d581b8", 1600), alt: "Woman in a flowing red maxi dress on a garden path" },
      label: "Gifting",
      title: "Gifts with meaning",
      body: "Fine jewellery and leather in our signature packaging, wrapped and boxed, ready to give.",
      cta: { href: "/gifts", label: "Shop gifts" },
    },
    {
      kind: "products",
      title: "Fine jewellery",
      slugs: ["halo-solitaire-ring", "pearl-strand-necklace", "crystal-tennis-bracelet", "pink-sapphire-ring", "sapphire-drop-earrings", "twisted-gold-hoops", "stacking-ring-set", "silver-pocket-watch", "layered-chain-necklace", "crescent-pendant-necklace"],
      link: { href: "/collections/jewellery", label: "View all" },
    },
    { kind: "services", lead: ["Signature packaging", "Client advisors"] },
  ],
};

export const homeVariants = [quietSeason, gifting, madeToLast, inDetail, intoTheLight, theSeason];

// Market id → variant. India and International keep the default.
const byMarket: Record<string, HomeVariant> = {
  us: gifting,
  ca: gifting,
  gb: madeToLast,
  eu: madeToLast,
  ch: madeToLast,
  jp: inDetail,
  kr: inDetail,
  hk: inDetail,
  au: intoTheLight,
  sg: intoTheLight,
  ae: theSeason,
};

export const homeVariantFor = (marketId: string): HomeVariant => byMarket[marketId] ?? quietSeason;
