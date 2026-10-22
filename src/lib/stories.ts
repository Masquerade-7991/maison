// The Stories journal: editorial content, kept in code like the About page. No database rows: a story
// is written once and edited by hand. Product slugs are looked up live; a slug that no longer exists
// simply drops out of "Shop the story".

// Photos the catalogue already uses (images.unsplash.com is the only host next.config.ts allows).
const photo = (id: string) => `https://images.unsplash.com/photo-${id}?ar=4:5&fit=crop&w=1600&q=80`;

type Topic = "Craft" | "Materials" | "Workshops" | "Style notes" | "Care";

type Block = { kind: "p"; text: string } | { kind: "h2"; text: string } | { kind: "quote"; text: string; by: string };

export type Story = {
  slug: string;
  topic: Topic;
  title: string;
  dek: string; // the standfirst under the headline, also the meta description
  author: string;
  published: string; // ISO date
  image: { src: string; alt: string };
  body: Block[];
  shop: { label: string; href: string; products: string[] };
};

const p = (text: string): Block => ({ kind: "p", text });
const h2 = (text: string): Block => ({ kind: "h2", text });
const quote = (text: string, by: string): Block => ({ kind: "quote", text, by });

// Newest first; the first story is the cover of /stories.
export const stories: Story[] = [
  {
    slug: "six-pairs-of-hands",
    topic: "Craft",
    title: "Six pairs of hands",
    dek: "A woven shoulder bag takes eleven days to make in our Florentine workshop. We followed one from the first cut to the signature inside the flap.",
    author: "Giulia Benassi",
    published: "2026-10-14",
    image: { src: photo("1598532163257-ae3c6b2524b6"), alt: "Cognac woven leather bag with a gold chain strap" },
    body: [
      p("The hide arrives rolled, like a carpet, and is unrolled on the cutting table before anyone speaks. Marco, who has cut for the house for twenty-two years, reads it with his palms first: the backbone runs straight and firm, the belly is softer and stretches, and a scar from a fence is marked in chalk so the pattern can step around it."),
      p("Nothing is cut by machine. The pattern pieces are cardboard, worn smooth at the edges, and each bag uses the hide in the same order: the panels that will be seen from the firmest part, the gussets and straps from the rest. What is left over becomes the small leather goods."),
      h2("Woven, then woven again"),
      p("The front panel is cut into strips four millimetres wide and woven by hand on a board, then soaked and pressed so the weave sets. It is the slowest part of the work. A good day is two panels; a humid day is one, because the leather moves."),
      quote("You can't rush leather. It remembers everything you do to it, and it tells you about it later.", "Marco, cutter"),
      h2("Edges, painted not sealed"),
      p("Where a factory would fold and glue an edge, ours are sanded, painted with a pigmented wax and burnished by hand, then repeated. Six coats is our minimum. It is the detail that most people never notice and the one that decides how a bag looks in ten years."),
      p("Assembly, stitching, hardware and the final inspection pass through four more benches. At the last one, the bag is numbered and signed on the underside of the flap, the way the first twelve were in 1987."),
    ],
    shop: { label: "Shop bags", href: "/collections/bags", products: ["woven-leather-shoulder-bag", "leather-top-handle-bag", "structured-satchel"] },
  },
  {
    slug: "coming-home-to-be-mended",
    topic: "Care",
    title: "Coming home to be mended",
    dek: "Every piece we make can come back to the workshop for as long as it is loved. A morning on the repair bench, where nothing is thrown away.",
    author: "The Maison atelier",
    published: "2026-09-30",
    image: { src: photo("1622560480605-d83c853bc5c3"), alt: "Worn brown leather backpack against a white wall" },
    body: [
      p("The repair bench sits by the window, apart from the new work, and it is the busiest bench in the building. This week it holds a backpack that has crossed four continents, a belt with a cracked keeper and a wallet that went through a washing machine."),
      p("Each one arrives with a note. Some are practical; most are not. The backpack's owner wrote two pages about where it had been, and asked us not to make it look new."),
      h2("Repair, not replace"),
      p("We restitch by hand with the same waxed linen thread we use for new pieces, replace hardware from the same suppliers and recondition leather with the waxes it was finished with. Where a panel is beyond saving, we cut a new one from a matching hide and let it age in."),
      quote("A patina is a record. Our job is to keep the record and fix the thing.", "Anna, repairs"),
      h2("How it works"),
      p("Write to us from the contact page with a photograph of the piece. We send a prepaid label, quote the work before we start, and return it in its original packaging. Repairs are free for the first year and at cost after that, for life."),
    ],
    shop: { label: "Write to us about a repair", href: "/contact", products: ["leather-backpack", "leather-belt", "bifold-wallet"] },
  },
  {
    slug: "a-coat-for-twenty-winters",
    topic: "Style notes",
    title: "A coat for twenty winters",
    dek: "How to choose an outer layer you will still reach for in 2046: cloth, cut and colour, and the three questions our tailors ask first.",
    author: "Sofia Ricci",
    published: "2026-09-12",
    image: { src: photo("1539533018447-63fcce2678e3"), alt: "Woman in a long belted camel coat walking down stone steps" },
    body: [
      p("The best coat in most wardrobes is the oldest one. It is rarely the most fashionable, and almost never the one bought on impulse. It is the one whose shoulders fit, whose cloth has softened rather than pilled, and whose colour goes with everything else that has come and gone."),
      h2("Start with the cloth"),
      p("Look for a dense, double-faced wool or a wool and cashmere blend with real weight in the hand. Hold it to the light: you should not see through it. A good cloth drapes when you hold it by one corner, and springs back when you crush it in your fist."),
      h2("Then the shoulder"),
      p("A coat is a shoulder with a garment hanging from it. The seam should sit at the edge of your own shoulder, with room to wear a knit beneath. Everything else, sleeve length, hem and waist, can be altered. The shoulder cannot."),
      quote("Buy the coat that fits your shoulders and your life. The fashion will come round to it.", "Our head tailor"),
      h2("Colour last"),
      p("Camel, navy, charcoal and a deep green have outlasted every trend we have seen since 1987. If you want something brighter, let it be the second coat."),
    ],
    shop: { label: "Shop ready-to-wear", href: "/collections/ready-to-wear", products: ["belted-camel-coat", "double-faced-wool-coat", "check-wool-coat"] },
  },
  {
    slug: "gold-that-is-meant-to-age",
    topic: "Materials",
    title: "Gold that is meant to age",
    dek: "Why we leave our chains unlacquered, what happens to recycled gold over a decade of wear, and how to tell plate from the real thing.",
    author: "Giulia Benassi",
    published: "2026-08-27",
    image: { src: photo("1590548784585-643d2b9f2925"), alt: "Woman wearing layered fine gold chain necklaces" },
    body: [
      p("Most fine jewellery is sold looking its best on the first day. Ours is made to look its best after the hundredth: the links are cast in recycled gold, polished once, and left unlacquered so they soften with skin, light and time."),
      h2("Solid, plated or filled"),
      p("Solid gold is gold all the way through. Plate is a thin film over brass or silver, measured in microns, and wears through where a piece rubs. Gold filled sits between the two: a thick layer bonded under heat. We say exactly which on every product page, and we never call plate gold."),
      quote("A chain should go dull where it rests on the collarbone. That's where it has been loved.", "Lucia, goldsmith"),
      h2("Living with it"),
      p("Take rings off to wash your hands, store pieces apart so they don't scratch one another, and polish with a soft cloth when you want the shine back. Or don't: the warm, satin finish that comes with wear is the reason we make it this way."),
    ],
    shop: { label: "Shop jewellery", href: "/collections/jewellery", products: ["layered-chain-necklace", "twisted-gold-hoops", "chunky-chain-bracelet"] },
  },
  {
    slug: "where-the-wool-comes-down-from-the-hills",
    topic: "Workshops",
    title: "Where the wool comes down from the hills",
    dek: "Biella has spun wool for seven hundred years. The family who knits our scarves has been there for four generations of it.",
    author: "Sofia Ricci",
    published: "2026-08-08",
    image: { src: photo("1457545195570-67f207084966"), alt: "Folded knit scarves in green and grey stacked on a shelf" },
    body: [
      p("Biella sits where the Alps flatten into the plain, and the water that comes down from them is soft enough to wash wool without hardening it. That accident of geography is why the town has spun and woven since the thirteenth century, and why the Sella family's knitting workshop is there at all."),
      p("They joined the circle in 1998, the first workshop Elena went looking for. Today the third and fourth generations work side by side on machines that are older than most of the people using them."),
      h2("Slow knitting"),
      p("A merino scarf is knitted slowly, at low tension, so the yarn keeps its loft. It is then washed in that same mountain water, dried flat on racks and brushed by hand. Each stage adds a day; together they are the difference between a scarf that pills in a season and one that softens for twenty."),
      quote("My grandmother could tell the yarn by the sound the machine made. I'm still learning to hear it.", "Chiara Sella"),
    ],
    shop: { label: "Shop accessories", href: "/collections/accessories", products: ["merino-knit-scarf", "ribbed-wool-beanie", "wide-brim-felt-hat"] },
  },
  {
    slug: "the-care-of-leather",
    topic: "Care",
    title: "The care of leather",
    dek: "A five-minute ritual, once a season, that keeps shoes, boots and bags looking better at ten years than at ten weeks.",
    author: "The Maison atelier",
    published: "2026-07-21",
    image: { src: photo("1608256246200-53e635b5b65f"), alt: "Pair of dark brown lace-up leather boots on a black surface" },
    body: [
      p("Leather is skin, and it wants what skin wants: to be kept clean, fed now and then, and allowed to breathe. Almost every ruined pair of shoes we see on the repair bench was ruined by neglect or by a radiator, rarely by wear."),
      h2("Once a season"),
      p("Brush off the dust with a horsehair brush. Wipe with a barely damp cloth and let it dry away from heat. Work in a thin layer of neutral cream with your fingers, leave it for ten minutes, then buff with a clean cloth until it no longer feels tacky."),
      h2("Every day"),
      p("Rest shoes for a day between wears and keep cedar trees in them overnight to draw out moisture and hold their shape. Store bags stuffed with tissue, upright, in the dust bag they came in, never in plastic."),
      quote("Rain won't ruin good leather. Drying it on a radiator will.", "Anna, repairs"),
      p("And when something does go wrong, a scuff, a stain or a sole worn through, send it home to us before trying to fix it yourself."),
    ],
    shop: { label: "Shop shoes", href: "/collections/shoes", products: ["lace-up-leather-boot", "leather-derby-shoe", "polished-leather-blucher"] },
  },
];

export const getStory = (slug: string) => stories.find((s) => s.slug === slug) ?? null;

// ponytail: 200 words a minute over the text blocks; good enough for a reading-time label.
export function readingMinutes(s: Story) {
  const words = s.body.reduce((n, b) => n + b.text.split(/\s+/).length, s.dek.split(/\s+/).length);
  return Math.max(1, Math.ceil(words / 200));
}

export const formatStoryDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
