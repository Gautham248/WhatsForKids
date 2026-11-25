// Shared types and constants. Everything in this demo is dummy data.

export type Band = "0-2" | "3-5" | "6-8" | "9-12" | "13+";
export const BANDS: Band[] = ["0-2", "3-5", "6-8", "9-12", "13+"];
// Age ranges are stored in months. The catalogue covers 0-14 years.
export const BAND_MONTHS: Record<Band, [number, number]> = {
  "0-2": [0, 35],
  "3-5": [36, 71],
  "6-8": [72, 107],
  "9-12": [108, 155],
  "13+": [156, 179],
};

export type BudgetCap = 500 | 1000 | 2000 | 5000;
export const BUDGETS: BudgetCap[] = [500, 1000, 2000, 5000];
export const budgetLabel = (b: BudgetCap) => `Up to ₹${b.toLocaleString("en-IN")}`;

export type Recipient = "own" | "gift";
export type Occasion = "birthday" | "festival" | "return_gift";
// Used only to word replies. Never a search filter: the catalogue is not gender-tagged.
export type Gender = "boy" | "girl";

// The slot object is the ONLY thing stored about a chat. No raw text.
export interface Slots {
  age?: Band;
  category?: string;
  budget?: BudgetCap;
  interests?: string[];
  recipient?: Recipient;
  occasion?: Occasion;
  gender?: Gender;
}

export const CATEGORIES: Record<string, string> = {
  building: "Building & blocks",
  pretend: "Pretend play",
  art: "Art & craft",
  books: "Books",
  outdoor: "Outdoor",
  puzzles: "Puzzles & games",
  music: "Music",
  stem: "Science & STEM",
  soft: "Soft toys",
  sensory: "Sensory",
};

// Controlled vocabulary assigned at curation time (replaces embeddings in V1).
export const INTERESTS: Record<string, string> = {
  dinosaurs: "Dinosaurs",
  animals: "Animals",
  music: "Music",
  art: "Art",
  building: "Building",
  vehicles: "Vehicles",
  space: "Space",
  nature: "Nature",
  stories: "Stories",
  pretend: "Pretend play",
};

export type Status =
  | "discovered"
  | "screened"
  | "selected"
  | "evidence_check"
  | "expert_review"
  | "commercial_onboarding"
  | "published"
  | "suspended";

export const STAGES: Status[] = [
  "discovered",
  "screened",
  "selected",
  "evidence_check",
  "expert_review",
  "commercial_onboarding",
  "published",
];
export const STAGE_LABEL: Record<Status, string> = {
  discovered: "Discovered",
  screened: "Screened",
  selected: "Selected",
  evidence_check: "Evidence check",
  expert_review: "Expert review",
  commercial_onboarding: "Commercial onboarding",
  published: "Published",
  suspended: "Suspended",
};

export type ClaimType = "safety_cert" | "material" | "age_suitability" | "developmental";
export const CLAIM_LABEL: Record<ClaimType, string> = {
  safety_cert: "Safety compliance",
  material: "Materials and finish",
  age_suitability: "Age suitability",
  developmental: "Developmental claim",
};

export type Platform = "shopify" | "schema_org" | "csv" | "custom";

export interface Brand {
  id: string;
  name: string;
  url: string;
  platform: Platform;
  authorisation: { doc: string; grantedOn: string; expiresOn: string } | null;
  terms: string;
}

export interface Product {
  id: string;
  brandId: string;
  name: string;
  sourceUrl: string;
  price: number; // rupees
  priceAsOf: string; // ISO date
  emoji: string;
  color: string;
  category: string;
  ageMin: number; // months
  ageMax: number; // months
  interests: string[];
  material: string;
  pieces: string;
  availability: string;
  cleaning: string;
  shortDesc: string;
  status: Status;
  lastCheckedAt: string;
  suspendedReason?: string;
  giftable: boolean;
  boost: number; // curator boost 0-10
  // What the "live brand page" currently says. Used only by the scraper demo.
  live: { price: number; availability: string; http: number };
}

export interface Evidence {
  id: string;
  productId: string;
  type: ClaimType;
  claimText: string;
  docName: string;
  issuedOn: string;
  expiresOn: string | null;
  approver: string;
  status: "pending" | "approved" | "rejected";
}

export interface Profile {
  productId: string;
  state: "draft" | "approved";
  intro: string;
  points: { title: string; body: string }[];
  play: { title: string; prompt: string }[];
  why: string;
  source: string; // who/what wrote it
}

export type ReasonTag = "gift" | "age_fit" | "budget" | "skill" | "interest";
export interface ReasonLine {
  id: string;
  productId: string;
  tag: ReasonTag;
  interest?: string;
  text: string;
  approved: boolean;
}

export type RouteKind = "affiliate" | "referral" | "direct" | "none";
export interface Route {
  productId: string;
  kind: RouteKind;
  status: "active" | "inactive";
  disclosure: string;
  url: string;
}

export interface Diff {
  id: string;
  productId: string;
  field: "price" | "availability";
  oldValue: string;
  newValue: string;
  status: "pending" | "approved" | "rejected";
  at: string;
}

export interface StatusLog {
  id: string;
  productId: string;
  from: Status | null;
  to: Status;
  at: string;
  actor: string;
  skippedReason?: string;
}

export interface RedirectEvent {
  id: string;
  at: string;
  productId: string;
  routeKind: RouteKind;
  position: number;
  sessionId: string;
  slots: Slots;
}

export interface HistoryEntry {
  id: string;
  at: string;
  slots: Slots;
  productIds: string[];
}

export interface ChildProfile {
  ageBand: Band;
  interests: string[];
  consentId: string;
}
export interface Consent {
  id: string;
  at: string;
  noticeVersion: string;
  noticeHash: string;
  verificationMethod: string;
  withdrawnAt: string | null;
}
export interface User {
  id: string;
  name: string;
  email: string;
}

export interface ScrapeRun {
  id: string;
  at: string;
  brandId: string;
  kind: "refresh" | "single" | "csv";
  lines: string[];
}

export interface Ops {
  llmDisabled: boolean;
  clockOffsetDays: number;
  breakAdapter: boolean;
  guestCap: number;
  userCap: number;
  catalogueVersion: number;
  llmCalls: number;
  llmCostRs: number;
  annotate: boolean;
  inspector: boolean;
}

export interface Data {
  v: number;
  baseDate: string;
  brands: Brand[];
  products: Product[];
  evidence: Evidence[];
  profiles: Record<string, Profile>;
  reasons: ReasonLine[];
  routes: Record<string, Route>;
  diffs: Diff[];
  statusLog: StatusLog[];
  events: RedirectEvent[];
  scrapeRuns: ScrapeRun[];
  user: User | null;
  saved: string[];
  history: HistoryEntry[];
  child: ChildProfile | null;
  consents: Consent[];
  deletionRequests: { at: string; note: string }[];
  ops: Ops;
}

export const bandOf = (months: number): Band => {
  for (const b of BANDS) if (months <= BAND_MONTHS[b][1]) return b;
  return "13+";
};
export const bandLabel = (b: Band) => (b === "13+" ? "13–14 years" : `${b.replace("-", "–")} years`);
export const ageText = (min: number, max: number) => {
  const f = (m: number) => (m < 24 ? `${m} mo` : `${Math.round((m / 12) * 10) / 10} yr`);
  return `${f(min)} – ${f(max)}`;
};
export const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
