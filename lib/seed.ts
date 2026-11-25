// Dummy seed data. Brands, products, certificates and prices are all invented.

import {
  Data,
  Brand,
  Product,
  Evidence,
  Profile,
  ReasonLine,
  Route,
  RouteKind,
  Status,
  INTERESTS,
  CATEGORIES,
  ageText,
  bandOf,
  bandLabel,
  inr,
} from "./types";
import { FIXTURES } from "./fixtures";

export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
export const isoDay = (d: Date) => d.toISOString().slice(0, 10);

const HOSTS: Record<string, string> = {
  "b-oak": "littleoak.example",
  "b-tinker": "tinkerandco.example",
  "b-pebble": "pebbleplay.example",
  "b-nimbus": "nimbuskids.example",
  "b-kiki": "kikicraft.example",
  "b-banyan": "banyanbooks.example",
};

export function makeBrands(now: Date): Brand[] {
  const day = (n: number) => isoDay(addDays(now, n));
  return [
    { id: "b-oak", name: "Little Oak Toys", url: "https://littleoak.example", platform: "shopify", authorisation: { doc: "oak-authorisation-letter.pdf", grantedOn: day(-90), expiresOn: day(270) }, terms: "Affiliate, 6% (demo)" },
    { id: "b-tinker", name: "Tinker & Co", url: "https://tinkerandco.example", platform: "shopify", authorisation: { doc: "tinker-email-approval.pdf", grantedOn: day(-60), expiresOn: day(300) }, terms: "Affiliate, 5% (demo)" },
    { id: "b-pebble", name: "Pebble Play", url: "https://pebbleplay.example", platform: "schema_org", authorisation: { doc: "pebble-authorisation.pdf", grantedOn: day(-45), expiresOn: day(320) }, terms: "Referral fee per click-out (demo)" },
    { id: "b-nimbus", name: "Nimbus Kids", url: "https://nimbuskids.example", platform: "schema_org", authorisation: { doc: "nimbus-authorisation.pdf", grantedOn: day(-30), expiresOn: day(335) }, terms: "No deal signed yet" },
    { id: "b-kiki", name: "Kiki Craft", url: "https://kikicraft.example", platform: "csv", authorisation: { doc: "kiki-authorisation.pdf", grantedOn: day(-20), expiresOn: day(345) }, terms: "No deal signed yet. Supplies a CSV." },
    { id: "b-banyan", name: "Banyan Books", url: "https://banyanbooks.example", platform: "custom", authorisation: { doc: "banyan-authorisation.pdf", grantedOn: day(-400), expiresOn: day(-35) }, terms: "No deal. Authorisation EXPIRED (demo of the scraper block)." },
  ];
}

interface P {
  id: string; brand: string; name: string; cat: string; price: number; min: number; max: number;
  int: string[]; emoji: string; color: string; material: string; pieces: string; gift: boolean; boost: number;
  status: Status; desc: string; checked?: number; // days ago
}
const mo = (y: number) => Math.round(y * 12);
// prettier-ignore
const PRODUCTS: P[] = [
  { id: "rainbow-stacker", brand: "b-oak", name: "Wooden rainbow stacker", cat: "building", price: 1499, min: 12, max: 48, int: ["building", "art"], emoji: "🌈", color: "#fde7c8", material: "Solid beech wood, water-based paint", pieces: "7", gift: true, boost: 8, status: "published", desc: "Seven solid wood arches in rainbow colours. Ages 1+. ISI-marked. Stack, nest and balance." },
  { id: "blocks-100", brand: "b-oak", name: "100-piece natural building blocks", cat: "building", price: 1899, min: 36, max: 120, int: ["building"], emoji: "🧱", color: "#f3e3c3", material: "Untreated beech wood, cotton bag", pieces: "100", gift: true, boost: 6, status: "published", desc: "One hundred smooth wooden blocks in a cotton bag. Ages 3+." },
  { id: "kitchen", brand: "b-oak", name: "Tabletop pretend kitchen", cat: "pretend", price: 2799, min: 36, max: 96, int: ["pretend"], emoji: "🍳", color: "#ffd9d9", material: "Birch plywood, water-based paint", pieces: "14", gift: true, boost: 4, status: "published", desc: "Compact wooden kitchen with hob, sink and utensils. Ages 3+." },
  { id: "stacking-cups", brand: "b-tinker", name: "Soft stacking cups", cat: "sensory", price: 449, min: 6, max: 36, int: ["nature"], emoji: "🥤", color: "#d8f0e4", material: "Food-grade silicone", pieces: "8", gift: false, boost: 3, status: "published", desc: "Eight squishy cups with drainage holes for bath and sand. Ages 6 months+." },
  { id: "dino-puzzle", brand: "b-tinker", name: "Dinosaur floor puzzle (48 pieces)", cat: "puzzles", price: 599, min: 36, max: 84, int: ["dinosaurs"], emoji: "🦕", color: "#dff0d0", material: "Recycled card", pieces: "48", gift: true, boost: 5, status: "published", desc: "Large floor puzzle of a dinosaur scene. Ages 3+.", checked: 24 },
  { id: "gear-set", brand: "b-tinker", name: "Gear builder set (60 pieces)", cat: "stem", price: 1299, min: 60, max: 120, int: ["building", "vehicles"], emoji: "⚙️", color: "#dde6f7", material: "BPA-free plastic", pieces: "60", gift: true, boost: 5, status: "published", desc: "Interlocking gears, axles and a base plate. Ages 5+." },
  { id: "rocket-kit", brand: "b-kiki", name: "Cardboard rocket craft kit", cat: "art", price: 699, min: 60, max: 120, int: ["space", "art"], emoji: "🚀", color: "#e3ddf7", material: "Recycled cardboard", pieces: "24", gift: true, boost: 4, status: "published", desc: "Pre-cut cardboard parts, stickers and paint pens. Ages 5+." },
  { id: "watercolour", brand: "b-kiki", name: "Kids watercolour set", cat: "art", price: 349, min: 48, max: 144, int: ["art", "nature"], emoji: "🎨", color: "#ffe9f1", material: "Washable pigment, bamboo brush", pieces: "13", gift: false, boost: 3, status: "published", desc: "Twelve washable colours and a brush. Ages 4+." },
  { id: "clay-kit", brand: "b-kiki", name: "Air-dry clay studio kit", cat: "art", price: 899, min: 72, max: 144, int: ["art", "animals"], emoji: "🏺", color: "#f6e1d3", material: "Air-dry clay", pieces: "20", gift: true, boost: 4, status: "published", desc: "Clay, tools and paints to make animal figures. Ages 6+." },
  { id: "thumb-piano", brand: "b-pebble", name: "Mini thumb piano", cat: "music", price: 799, min: 36, max: 180, int: ["music"], emoji: "🎹", color: "#fff1c9", material: "Mahogany body, steel tines", pieces: "1", gift: true, boost: 6, status: "published", desc: "Seventeen-key kalimba tuned to C major. Ages 3+." },
  { id: "drum-set", brand: "b-pebble", name: "Wooden toddler drum set", cat: "music", price: 1399, min: 18, max: 60, int: ["music"], emoji: "🥁", color: "#ffe0cc", material: "Solid wood, natural rubber", pieces: "5", gift: true, boost: 3, status: "published", desc: "Small drum, tambourine and two sticks. Ages 18 months+." },
  { id: "balance-bike", brand: "b-nimbus", name: "Lightweight balance bike", cat: "outdoor", price: 4999, min: 24, max: 60, int: ["vehicles"], emoji: "🚲", color: "#d6ecf8", material: "Aluminium frame, EVA tyres", pieces: "1", gift: true, boost: 2, status: "published", desc: "Pedal-free bike with adjustable seat. Ages 2+." },
  { id: "bug-catcher", brand: "b-nimbus", name: "Bug catcher and magnifier set", cat: "outdoor", price: 549, min: 48, max: 120, int: ["nature", "animals"], emoji: "🔍", color: "#e5f3cf", material: "Polycarbonate jar, steel tweezers", pieces: "5", gift: false, boost: 5, status: "published", desc: "Clear viewing jar, tweezers and magnifier. Ages 4+." },
  { id: "kite", brand: "b-nimbus", name: "Rainbow kite", cat: "outdoor", price: 399, min: 72, max: 180, int: ["nature"], emoji: "🪁", color: "#d8eefc", material: "Ripstop nylon, fibreglass spars", pieces: "1", gift: false, boost: 2, status: "published", desc: "Easy-launch delta kite with 30 m line. Ages 6+." },
  { id: "plush-elephant", brand: "b-pebble", name: "Organic cotton plush elephant", cat: "soft", price: 999, min: 0, max: 36, int: ["animals"], emoji: "🐘", color: "#e8e4f2", material: "Organic cotton (GOTS-certified fabric), polyester-free filling", pieces: "1", gift: true, boost: 7, status: "published", desc: "Soft elephant, machine washable. Suitable from birth." },
  { id: "story-box", brand: "b-banyan", name: "Picture book box set (6 books)", cat: "books", price: 1199, min: 24, max: 72, int: ["stories", "animals"], emoji: "📚", color: "#fbe6c8", material: "Paper and board", pieces: "6", gift: true, boost: 6, status: "published", desc: "Six picture books about animals. Ages 2+." },
  { id: "space-atlas", brand: "b-banyan", name: "Illustrated space atlas", cat: "books", price: 1099, min: 84, max: 144, int: ["space", "stories"], emoji: "🪐", color: "#dcd9f5", material: "Paper and board", pieces: "1", gift: true, boost: 5, status: "published", desc: "Hardback atlas of the solar system with fold-out maps. Ages 7+." },
  { id: "science-lab", brand: "b-tinker", name: "Junior science experiment kit", cat: "stem", price: 1799, min: 84, max: 168, int: ["space", "nature"], emoji: "🔬", color: "#d9f1ee", material: "Mixed plastics, glassware-free", pieces: "30", gift: true, boost: 5, status: "published", desc: "Thirty simple experiments with a guide book. Ages 7+." },
  { id: "detective-game", brand: "b-tinker", name: "Co-op detective board game", cat: "puzzles", price: 1599, min: 96, max: 180, int: ["stories"], emoji: "🕵️", color: "#e8e6e1", material: "Card and board", pieces: "60", gift: true, boost: 4, status: "published", desc: "Cooperative mystery game for two to four players. Ages 8+." },
  { id: "vehicles", brand: "b-oak", name: "Wooden vehicle set (8 pieces)", cat: "pretend", price: 1099, min: 24, max: 72, int: ["vehicles"], emoji: "🚚", color: "#fde2c0", material: "Solid beech wood", pieces: "8", gift: true, boost: 4, status: "published", desc: "Eight small wooden vehicles in a canvas bag. Ages 2+." },
  { id: "glow-ball", brand: "b-nimbus", name: "Glow-in-the-dark sensory ball", cat: "sensory", price: 299, min: 6, max: 48, int: ["nature"], emoji: "🔮", color: "#e7f0ff", material: "TPR rubber", pieces: "1", gift: false, boost: 1, status: "published", desc: "Soft textured ball that glows after light exposure. Ages 6 months+." },
  // Pipeline products (not live)
  { id: "magnetic-tiles", brand: "b-tinker", name: "Magnetic building tiles (40)", cat: "building", price: 2499, min: 36, max: 120, int: ["building"], emoji: "🧲", color: "#dfe7fb", material: "ABS plastic, sealed magnets", pieces: "40", gift: true, boost: 5, status: "evidence_check", desc: "Forty magnetic tiles in assorted shapes. Ages 3+." },
  { id: "sensory-bin", brand: "b-kiki", name: "Sensory play bin starter", cat: "sensory", price: 749, min: 12, max: 60, int: ["nature"], emoji: "🧺", color: "#eaf4dc", material: "", pieces: "", gift: false, boost: 2, status: "screened", desc: "Bin with scoops, cups and textured fillers. Ages 1+." },
  { id: "fairy-wings", brand: "b-pebble", name: "Felt fairy wings", cat: "pretend", price: 649, min: 36, max: 96, int: ["pretend"], emoji: "🧚", color: "#fbe0f3", material: "", pieces: "", gift: true, boost: 2, status: "discovered", desc: "Soft felt wings with elastic straps. Ages 3+." },
  { id: "animal-cube", brand: "b-nimbus", name: "Wooden animal puzzle cube", cat: "puzzles", price: 899, min: 18, max: 60, int: ["animals"], emoji: "🐾", color: "#f6ead3", material: "Beech wood, water-based paint", pieces: "6", gift: true, boost: 3, status: "expert_review", desc: "Six-sided puzzle cube with farm animals. Ages 18 months+." },
  { id: "kids-tent", brand: "b-oak", name: "Cotton canvas play tent", cat: "pretend", price: 3299, min: 36, max: 108, int: ["pretend", "nature"], emoji: "⛺", color: "#e6f1d6", material: "Cotton canvas, pine poles", pieces: "1", gift: true, boost: 3, status: "commercial_onboarding", desc: "Teepee-style tent with window. Ages 3+." },
  { id: "dino-book", brand: "b-banyan", name: "Dinosaur lift-the-flap book", cat: "books", price: 499, min: 24, max: 72, int: ["dinosaurs", "stories"], emoji: "🦖", color: "#dcf0d4", material: "", pieces: "", gift: true, boost: 3, status: "selected", desc: "Sturdy board book with big flaps. Ages 2+." },
];

const KIND: Record<string, RouteKind> = { "b-oak": "affiliate", "b-tinker": "affiliate", "b-pebble": "referral", "b-nimbus": "none", "b-kiki": "none", "b-banyan": "none" };

export const disclosureFor = (kind: RouteKind, brand: string) =>
  kind === "affiliate"
    ? `We may earn a commission if you buy from ${brand} through this link. It does not change the price you pay.`
    : kind === "referral"
      ? `${brand} pays us a small referral fee when you click through to their site. It does not change the price you pay.`
      : kind === "direct"
        ? `We have a direct arrangement with ${brand}. It does not change the price you pay.`
        : `We have no commercial arrangement with ${brand}. We earn nothing if you buy.`;

const SKILL: Record<string, string> = {
  building: "Open-ended building with no instructions needed",
  pretend: "Pretend play that grows with the child's own stories",
  art: "A low-mess way to try making things",
  books: "Short enough for one sitting, rich enough to revisit",
  outdoor: "A reason to get outside and look closely",
  puzzles: "A satisfying challenge that rewards patience",
  music: "Early music-making without any lessons",
  stem: "Hands-on experimenting at the child's own pace",
  soft: "A cuddly companion for quiet moments",
  sensory: "Gentle textures to explore at the child's own pace",
};

const PLAY: Record<string, [string, string][]> = {
  building: [["Build a home", "Make a house for a toy. What does it need?"], ["Tallest tower", "Take turns adding one piece. Who makes it wobble?"], ["Copy me", "Build something small, then ask your child to copy it."]],
  pretend: [["Open for business", "Run a shop or cafe. Who is the customer today?"], ["Story time", "Act out a favourite book using what is in the set."], ["Swap roles", "Let your child be the grown-up and give you instructions."]],
  art: [["Make a gift", "Create something for someone you both know."], ["One colour only", "Try a picture using only two colours. What changes?"], ["Gallery wall", "Pick a spot and display today's work together."]],
  books: [["Spot and point", "Pause on a page and ask what they notice."], ["Change the ending", "Make up a new ending and see who laughs first."], ["Act it out", "Use voices and sounds for each character."]],
  outdoor: [["Ten minute hunt", "Find five different things and compare them."], ["Draw what you saw", "Sketch your find when you get home."], ["Slow walk", "See how many sounds you can name."]],
  puzzles: [["Edges first", "Sort the pieces together before you start."], ["Race the clock", "Time one go, then try to beat it gently."], ["Tell the story", "Describe the picture as it appears."]],
  music: [["Copy the beat", "Play a short pattern and ask them to echo it."], ["Loud and quiet", "Play the same pattern soft, then loud."], ["Name that song", "Hum a tune and let them guess."]],
  stem: [["Guess first", "Ask what might happen before you try."], ["Change one thing", "Repeat with a small change and compare."], ["Explain it back", "Ask them to tell you what they saw."]],
  soft: [["Bedtime friend", "Make a small routine with the toy at bedtime."], ["Feelings check", "Ask how the toy feels today."], ["Pass it on", "Take turns holding it and telling a short story."]],
  sensory: [["Hide and find", "Hide small things and feel for them."], ["Warm and cool", "Compare what changes in water."], ["Quiet corner", "Use it as part of a calm-down routine."]],
};

const POINTS: Record<string, [string, string][]> = {
  building: [["Open-ended play", "There is no single right way to use it, so it can become whatever the child imagines."], ["Patience and balance", "Stacking takes a few wobbles, which makes it a gentle way to practise trying again."], ["Play together", "Easy for a grown-up to join in without taking over."]],
  pretend: [["Stories of their own", "Simple pieces leave room for the child to invent the plot."], ["Real-life roles", "Children often act out what they see around them."], ["Easy to share", "Works for siblings or friends playing side by side."]],
  art: [["Make something real", "Finished pieces can be given, hung up or kept."], ["Choices to make", "Colour and shape decisions stay with the child."], ["Short sessions", "Easy to start and stop in one sitting."]],
  books: [["Talk about it", "Pictures give plenty to point at and discuss."], ["Repeat favourites", "Short stories stand up to many re-reads."], ["Wind-down time", "A calm way to end the day."]],
  outdoor: [["Look closely", "Gives a reason to slow down and notice small things."], ["Fresh air", "Easy to take to a park or garden."], ["Talk afterwards", "Plenty to describe once you are home."]],
  puzzles: [["A clear goal", "Finishing gives a satisfying end point."], ["Take turns", "Works well with one child and one grown-up."], ["Scales with age", "Can be redone faster each time."]],
  music: [["Sound exploring", "Children can try loud, soft, fast and slow."], ["Play along", "Easy to join in with a song or a recording."], ["No lessons needed", "Fun from the first go."]],
  stem: [["Try and see", "Small experiments invite questions."], ["Step by step", "Clear steps are easy to follow together."], ["Make it again", "Repeating with changes is part of the fun."]],
  soft: [["Comfort", "A familiar object can be reassuring at quiet times."], ["Gentle first friend", "Soft and light enough for small hands."], ["Easy to wash", "Practical for everyday life."]],
  sensory: [["Different textures", "Children can compare how things feel."], ["Calm play", "Slow, repeating actions suit quiet moments."], ["Bath and tray friendly", "Easy to use in simple set-ups."]],
};

export function profileFor(p: Product, brandName: string, source = "Curator (demo)"): Profile {
  const cat = CATEGORIES[p.category].toLowerCase();
  return {
    productId: p.id,
    state: "approved",
    intro: `${p.name} is a ${cat} pick from ${brandName} for ${ageText(p.ageMin, p.ageMax)}. ${p.shortDesc}`,
    points: POINTS[p.category].map(([title, body]) => ({ title, body })),
    play: PLAY[p.category].map(([title, prompt]) => ({ title, prompt })),
    why: `We picked ${p.name} because it is simple to understand, suits ${ageText(p.ageMin, p.ageMax)}, and the brand lists clear product details. Our team read the product page and the evidence on file before publishing.`,
    source,
  };
}

export function reasonsFor(p: Product, approved: boolean): ReasonLine[] {
  const mid = bandLabel(bandOf((p.ageMin + p.ageMax) / 2));
  const L: ReasonLine[] = [];
  const push = (tag: ReasonLine["tag"], text: string, interest?: string) =>
    L.push({ id: `r-${p.id}-${tag}${interest ? "-" + interest : ""}`, productId: p.id, tag, text, interest, approved });
  if (p.giftable) push("gift", `A dependable birthday pick, easy to wrap. ${SKILL[p.category]}.`);
  push("age_fit", `Made for ${ageText(p.ageMin, p.ageMax)}, so it suits ${mid} well.`);
  push("budget", `Priced at ${inr(p.price)}, within reach for most gifting budgets.`);
  push("skill", `${SKILL[p.category]}.`);
  for (const i of p.interests) push("interest", `For kids who love ${INTERESTS[i].toLowerCase()}: this puts it front and centre.`, i);
  return L;
}

const rainbowProfile = (p: Product): Profile => ({
  productId: p.id,
  state: "approved",
  intro: "A set of seven wooden arches in rainbow colours that can be stacked, nested and balanced in many ways.",
  points: [
    { title: "Open-ended play", body: "The arches can become a tunnel, a bridge or a rocking boat. There is no single right way to use them." },
    { title: "Colours and order", body: "Sorting by colour or size gives little ones an easy, low-pressure way to talk about what they see." },
    { title: "Balance and patience", body: "Stacking takes steady hands and a few wobbles, which makes it a gentle way to practise trying again." },
  ],
  play: [
    { title: "Rainbow bridge", prompt: "Build a bridge for toy animals. Which arch should go first?" },
    { title: "Colour hunt", prompt: "Name something in the room that matches each arch." },
    { title: "Quiet tower", prompt: "Take turns adding an arch. Who can stop it wobbling?" },
  ],
  why: "We picked this stacker because it is simple, sturdy and open-ended, it suits a wide age range, and the brand lists its materials clearly. Our team reviewed the product page and the evidence on file before publishing.",
  source: "Curator (demo)",
});

export function makeSeed(now: Date): Data {
  const day = (n: number) => isoDay(addDays(now, n));
  const brands = makeBrands(now);
  const brandName = (id: string) => brands.find((b) => b.id === id)!.name;
  const fixtureUrl = (p: P) => FIXTURES.find((f) => f.productId === "p-" + p.id)?.url ?? `https://${HOSTS[p.brand]}/products/${p.id}`;

  const products: Product[] = PRODUCTS.map((p) => ({
    id: "p-" + p.id,
    brandId: p.brand,
    name: p.name,
    sourceUrl: fixtureUrl(p),
    price: p.price,
    priceAsOf: day(-(p.checked ?? 4)),
    emoji: p.emoji,
    color: p.color,
    category: p.cat,
    ageMin: p.min,
    ageMax: p.max,
    interests: p.int,
    material: p.material,
    pieces: p.pieces,
    availability: "In stock at the brand (as researched)",
    cleaning: p.cat === "soft" ? "Machine wash at 30°C" : p.cat === "art" ? "Wipe clean" : "Wipe with a damp cloth",
    shortDesc: p.desc,
    status: p.status,
    lastCheckedAt: day(-(p.checked ?? 4)),
    giftable: p.gift,
    boost: p.boost,
    live: { price: p.price, availability: "In stock", http: 200 },
  }));
  const byId = (id: string) => products.find((x) => x.id === id)!;
  // Scraper demo: what the "live brand pages" say right now
  byId("p-gear-set").live.price = 1399;
  byId("p-thumb-piano").live.price = 749;
  byId("p-bug-catcher").live.availability = "Out of stock";
  byId("p-glow-ball").live.http = 404;

  const evidence: Evidence[] = [];
  const addEv = (p: Product, type: Evidence["type"], text: string, doc: string, issued: number, expires: number | null, status: Evidence["status"] = "approved") =>
    evidence.push({ id: `e-${p.id}-${type}`, productId: p.id, type, claimText: text, docName: doc, issuedOn: day(issued), expiresOn: expires === null ? null : day(expires), approver: "Client approver (demo)", status });
  const noSafety = new Set(["books", "art"]);
  const evidenced = new Set<Status>(["published", "expert_review", "commercial_onboarding"]);
  for (const p of products) {
    if (!evidenced.has(p.status)) continue;
    addEv(p, "age_suitability", `Age grading ${ageText(p.ageMin, p.ageMax)} reviewed against the maker's guidance and product dimensions.`, `age-review-${p.id}.pdf`, -20, null);
    if (p.material) addEv(p, "material", `Maker's declaration: ${p.material}.`, `material-declaration-${p.id}.pdf`, -20, null);
    if (!noSafety.has(p.category)) {
      const exp = p.id === "p-rainbow-stacker" ? 25 : p.id === "p-drum-set" ? 40 : 365;
      addEv(p, "safety_cert", `ISI mark verified under BIS licence DEMO-${p.id.length}${p.price} (Toys Quality Control Order).`, `bis-licence-${p.id}.pdf`, -60, exp);
    }
  }
  // Pipeline: magnetic tiles has only a pending age review, no safety evidence
  evidence.push({ id: "e-p-magnetic-tiles-age", productId: "p-magnetic-tiles", type: "age_suitability", claimText: "Age grading 3 yr – 10 yr, awaiting review.", docName: "age-review-magnetic.pdf", issuedOn: day(-3), expiresOn: null, approver: "", status: "pending" });

  const profiles: Record<string, Profile> = {};
  const reasons: ReasonLine[] = [];
  for (const p of products) {
    if (p.status === "published" || p.status === "commercial_onboarding") {
      profiles[p.id] = p.id === "p-rainbow-stacker" ? rainbowProfile(p) : profileFor(p, brandName(p.brandId));
      reasons.push(...reasonsFor(p, true));
    }
  }
  const animal = byId("p-animal-cube");
  profiles[animal.id] = { ...profileFor(animal, brandName(animal.brandId), "llm:haiku-5.5 (simulated draft)"), state: "draft" };
  reasons.push(...reasonsFor(animal, false));
  const mt = byId("p-magnetic-tiles");
  profiles[mt.id] = {
    ...profileFor(mt, brandName(mt.brandId), "llm:haiku-5.5 (simulated draft)"),
    state: "draft",
    intro: "ISI certified magnetic tiles from Tinker & Co. Non-toxic and safety tested for ages 3+.",
    points: [
      { title: "Builds fine motor skills", body: "Snapping tiles together improves hand-eye coordination." },
      { title: "Open-ended play", body: "No single right way to build." },
      { title: "Play together", body: "Easy to build side by side." },
    ],
  };

  const routes: Record<string, Route> = {};
  for (const p of products) {
    if (p.status === "published" || p.status === "commercial_onboarding" || p.status === "suspended") {
      const kind = KIND[p.brandId];
      routes[p.id] = {
        productId: p.id,
        kind,
        status: p.status === "commercial_onboarding" ? "inactive" : "active",
        disclosure: disclosureFor(kind, brandName(p.brandId)),
        url: kind === "none" ? p.sourceUrl : `${p.sourceUrl}${p.sourceUrl.includes("?") ? "&" : "?"}ref=wfk-demo`,
      };
    }
  }

  const log = products.map((p, i) => ({ id: `l-${i}`, productId: p.id, from: null, to: p.status, at: day(-30), actor: "Seed (demo)" }));

  return {
    v: 1,
    baseDate: isoDay(now),
    brands,
    products,
    evidence,
    profiles,
    reasons,
    routes,
    diffs: [],
    statusLog: log,
    events: [],
    scrapeRuns: [],
    user: null,
    saved: [],
    history: [],
    child: null,
    consents: [],
    deletionRequests: [],
    ops: { llmDisabled: false, clockOffsetDays: 0, breakAdapter: false, guestCap: 5, userCap: 10, catalogueVersion: 1, llmCalls: 0, llmCostRs: 0, annotate: false, inspector: false },
  };
}
