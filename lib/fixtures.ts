// Dated "saved pages" used as scraper fixtures. In the real build these are
// files in the repo (fixtures/<site>/<date>/page.html + expected.json) and CI
// fails if an adapter's output for an unchanged fixture differs (a Defect under B4).
// Here the raw page is generated from a spec so the demo stays consistent.

import { Platform } from "./types";

export interface Parsed {
  name: string;
  price: number;
  currency: string;
  image: string;
  description: string;
  availability: string;
}
export interface Fixture {
  id: string;
  brandId: string;
  platform: Platform;
  url: string;
  capturedOn: string;
  raw: string;
  required: (keyof Parsed)[];
  expected: Parsed;
  productId?: string; // present when the product is already in the catalogue
}

interface Spec {
  id: string;
  brandId: string;
  platform: Platform;
  url: string;
  capturedOn: string;
  name: string;
  price: number;
  desc: string;
  inStock: boolean;
  productId?: string;
}

const REQUIRED: (keyof Parsed)[] = ["name", "price", "currency", "image"];
const img = (id: string) => `https://cdn.example.com/${id}.jpg`;

function rawFor(s: Spec): string {
  const image = img(s.id);
  if (s.platform === "shopify") {
    return JSON.stringify(
      {
        title: s.name,
        handle: s.id,
        vendor: s.brandId,
        variants: [{ price: s.price.toFixed(2), available: s.inStock }],
        images: [{ src: image }],
        body_html: `<p>${s.desc}</p>`,
      },
      null,
      2,
    );
  }
  if (s.platform === "schema_org") {
    const ld = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: s.name,
      image,
      description: s.desc,
      offers: {
        "@type": "Offer",
        price: String(s.price),
        priceCurrency: "INR",
        availability: `https://schema.org/${s.inStock ? "InStock" : "OutOfStock"}`,
      },
    };
    return `<html><head><title>${s.name}</title><script type="application/ld+json">${JSON.stringify(ld)}</script></head><body><h1>${s.name}</h1></body></html>`;
  }
  if (s.platform === "csv") {
    return `name,price,image,description,availability\n"${s.name}",${s.price},${image},"${s.desc}",${s.inStock ? "in_stock" : "out_of_stock"}`;
  }
  // custom (site-specific adapter, priced per site)
  return `<html><body><h1 class="bk-title">${s.name}</h1><span class="bk-price">₹ ${s.price.toLocaleString("en-IN")}</span><img class="bk-cover" src="${image}"><div class="bk-blurb">${s.desc}</div><span class="bk-stock">${s.inStock ? "In stock" : "Out of stock"}</span></body></html>`;
}

const specs: Spec[] = [
  { id: "rainbow-stacker", brandId: "b-oak", platform: "shopify", url: "https://littleoak.example/products/rainbow-stacker", capturedOn: "2026-11-02", name: "Wooden rainbow stacker", price: 1499, desc: "Seven solid wood arches in rainbow colours. Ages 1+. Stack, nest and balance.", inStock: true, productId: "p-rainbow-stacker" },
  { id: "wooden-blocks-100", brandId: "b-oak", platform: "shopify", url: "https://littleoak.example/products/natural-blocks-100", capturedOn: "2026-11-02", name: "100-piece natural building blocks", price: 1899, desc: "One hundred smooth wooden blocks in a cotton bag. Ages 3+.", inStock: true, productId: "p-blocks-100" },
  { id: "wooden-xylophone", brandId: "b-oak", platform: "shopify", url: "https://littleoak.example/products/rainbow-xylophone", capturedOn: "2026-11-05", name: "Rainbow xylophone", price: 1199, desc: "Eight-note wooden xylophone with two mallets. Ages 2+.", inStock: true },
  { id: "gear-set", brandId: "b-tinker", platform: "shopify", url: "https://tinkerandco.example/products/gear-builder-60", capturedOn: "2026-11-04", name: "Gear builder set (60 pieces)", price: 1299, desc: "Interlocking gears, axles and a base plate. Ages 5+.", inStock: true, productId: "p-gear-set" },
  { id: "kalimba", brandId: "b-pebble", platform: "schema_org", url: "https://pebbleplay.example/shop/thumb-piano", capturedOn: "2026-11-03", name: "Mini thumb piano", price: 799, desc: "Seventeen-key kalimba tuned to C major. Ages 3+.", inStock: true, productId: "p-thumb-piano" },
  { id: "felt-farm", brandId: "b-pebble", platform: "schema_org", url: "https://pebbleplay.example/shop/felt-farm-set", capturedOn: "2026-11-06", name: "Felt farm play set", price: 1349, desc: "Soft felt barn, fences and eight animals. Ages 2+.", inStock: true },
  { id: "bug-catcher", brandId: "b-nimbus", platform: "schema_org", url: "https://nimbuskids.example/outdoor/bug-catcher", capturedOn: "2026-11-03", name: "Bug catcher and magnifier set", price: 549, desc: "Clear viewing jar, tweezers and magnifier. Ages 4+.", inStock: true, productId: "p-bug-catcher" },
  { id: "sand-kit", brandId: "b-nimbus", platform: "schema_org", url: "https://nimbuskids.example/outdoor/sand-play-kit", capturedOn: "2026-11-06", name: "Sand play kit", price: 649, desc: "Eight-piece sand moulds and sieve in a mesh bag. Ages 2+.", inStock: false },
  { id: "watercolour", brandId: "b-kiki", platform: "csv", url: "https://kikicraft.example/catalogue.csv#watercolour-set", capturedOn: "2026-11-01", name: "Kids watercolour set", price: 349, desc: "Twelve washable colours and a brush. Ages 4+.", inStock: true, productId: "p-watercolour" },
  { id: "story-box", brandId: "b-banyan", platform: "custom", url: "https://banyanbooks.example/box/picture-book-box", capturedOn: "2026-10-20", name: "Picture book box set (6 books)", price: 1199, desc: "Six picture books about animals. Ages 2+.", inStock: true, productId: "p-story-box" },
];

export const FIXTURES: Fixture[] = specs.map((s) => ({
  id: s.id,
  brandId: s.brandId,
  platform: s.platform,
  url: s.url,
  capturedOn: s.capturedOn,
  raw: rawFor(s),
  required: REQUIRED,
  productId: s.productId,
  // "expected.json": frozen by hand in the real build
  expected: {
    name: s.name,
    price: s.price,
    currency: "INR",
    image: img(s.id),
    description: s.desc,
    availability: s.inStock ? "in_stock" : "out_of_stock",
  },
}));
