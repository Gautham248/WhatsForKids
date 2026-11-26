// Word lists for the slot parser (pure data). The logic lives in parser.ts.
// English plus common romanised Hindi (Hinglish). No Devanagari.

/** Words that point at a product category. A word may appear in both CAT_WORDS and INT_WORDS. */
export const CAT_WORDS: Record<string, string[]> = {
  building: ["block", "building", "lego", "stacker", "stacking", "construction", "tiles", "magnetic"],
  pretend: ["pretend", "kitchen", "role play", "roleplay", "dress up", "dollhouse", "tent"],
  art: ["art", "craft", "paint", "painting", "watercolour", "watercolor", "clay", "drawing", "colouring", "coloring"],
  books: ["book", "story book", "storybook", "reading", "picture book", "atlas"],
  outdoor: ["outdoor", "outside", "garden", "bike", "kite", "park", "bug"],
  puzzles: ["puzzle", "board game", "game", "jigsaw"],
  music: ["music", "drum", "piano", "instrument", "kalimba", "xylophone", "musical"],
  stem: ["science", "stem", "experiment", "robot", "gear", "lab", "engineering"],
  soft: ["plush", "soft toy", "teddy", "stuffed", "cuddly", "stuffie"],
  sensory: ["sensory", "texture", "textured", "calming", "fidget"],
};

/** Words that point at an interest. */
export const INT_WORDS: Record<string, string[]> = {
  dinosaurs: ["dino", "dinosaur", "t-rex", "trex"],
  animals: ["animal", "elephant", "dog", "cat", "farm", "zoo", "puppy"],
  music: ["music", "song", "sing", "drum", "piano"],
  art: ["art", "paint", "draw", "craft", "clay", "colour"],
  building: ["build", "blocks", "lego", "construct"],
  vehicles: ["vehicle", "car", "truck", "train", "bus", "plane", "bike"],
  space: ["space", "rocket", "planet", "astronaut", "star", "moon"],
  nature: ["nature", "bug", "insect", "plant", "flower", "garden", "outdoor"],
  stories: ["story", "stories", "book", "mystery", "detective"],
  pretend: ["pretend", "kitchen", "role play", "shop", "fairy"],
};

/** Common alternative spellings, rewritten before matching. Typos are handled by the fuzzy matcher instead. */
export const SPELLING: Record<string, string> = {
  color: "colour",
  colors: "colour",
  coloring: "colouring",
  legos: "lego",
  dinos: "dino",
  stuffy: "stuffie",
  stuffies: "stuffie",
};

/** Filler words that carry no slot. Used to decide which words were left unexplained. */
export const STOP = new Set(
  (
    "a an the for my is are am to of and or with me i we want need looking look find show something some good nice best ideas idea gift gifts present toy toys kid kids child children old year years yr yrs under below rs inr please can could you get buy what which recommend suggest any your our he she his her they who that this it in on at be like loves love likes who's whats what's hi hello hey there boy girl son daughter new little something that's thing things option options about around within upto up than less more much too also just only really very so then if when where how do does did would should will have has had been being from into out as by off one " +
    // Hinglish fillers and child words
    "ka ki ke liye kuch kuchh accha acha achha chahiye chaiye hai hain mein me tak andar wala wali wale ko mera meri mere bhi aur se pasand saman samaan liye baccha bachcha bacche bachche bachchi bacchi khilona khilone tohfa tohfe beta bete beti ladka ladke ladki"
  ).split(" "),
);

/** English number words. Runs of these ("twenty five hundred") are turned into digits before parsing. */
export const NUM_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
export const NUM_SCALE: Record<string, number> = { hundred: 100, thousand: 1000 };

/** Hindi numbers. Only read when followed by a unit (hazaar, sau, saal…), because "do" and "das" are also English words. */
export const HI_NUM: Record<string, number> = {
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, chhah: 6, saat: 7, aath: 8, nau: 9, das: 10,
  dedh: 1.5, dhai: 2.5, dhaai: 2.5, sava: 1.25,
};
/** Words meaning "thousand" or "hundred". */
export const THOUSAND_WORDS = ["k", "thousand", "hazaar", "hazar", "hajar", "hazzar"];
export const HUNDRED_WORDS = ["hundred", "sau"];
/** Hindi words for years of age ("5 saal ka"). */
export const YEAR_WORDS = ["saal", "sal", "baras", "varsh"];

/** Budget words without a number. */
export const BUDGET_WORDS: { re: RegExp; cap: 500 | 1000 | 2000 | 5000 }[] = [
  { re: /\b(pocket money)\b/, cap: 500 },
  { re: /\b(money no bar|no budget constraint|premium|splurge|luxury|high end|expensive one)\b/, cap: 5000 },
  { re: /\b(cheap|affordable|inexpensive|low cost|budget friendly|sasta|saste|sasti|kam daam|kam price)\b/, cap: 500 },
];

/** Life-stage words with an assumed age in years (low confidence). */
export const LIFE_STAGES: { re: RegExp; years: number }[] = [
  { re: /\b(newborn|infant|baby|babies|toddler)\b/, years: 1 },
  { re: /\b((just )?started school|preschool(er)?|nursery|play ?school|lkg|ukg|kindergarten(er)?|kg kid)\b/, years: 4 },
  { re: /\b(tweens?)\b/, years: 10 },
  { re: /\b(teen(ager)?s?)\b/, years: 13 },
];

/** Relationship words. Plural forms ("nephews") are accepted by the patterns in parser.ts. */
export const GIFT_PEOPLE = ["nephew", "niece", "cousin", "friend", "grandson", "granddaughter", "grandchild", "godson", "goddaughter", "neighbour", "neighbor", "classmate", "bhatija", "bhatije", "bhatiji", "bhanja", "bhanje", "bhanji"];
export const GIFT_WORDS = ["gift", "present", "birthday", "bday", "return gift", "tohfa", "tohfe", "janamdin", "janmdin"];
export const OWN_PEOPLE = ["son", "daughter", "kid", "child", "toddler", "baby", "boy", "girl", "little one"];
export const OWN_HINGLISH = ["beta", "bete", "beti", "mera beta", "meri beti", "mere bete"];
export const BOY_WORDS = ["boy", "boys", "son", "sons", "nephew", "nephews", "grandson", "grandsons", "godson", "brother", "him", "he", "hes", "his", "beta", "bete", "ladka", "ladke", "bhatija", "bhatije", "bhanja", "bhanje"];
export const GIRL_WORDS = ["girl", "girls", "daughter", "daughters", "niece", "nieces", "granddaughter", "granddaughters", "goddaughter", "sister", "her", "she", "shes", "beti", "ladki", "bhatiji", "bhanji", "bachchi", "bacchi"];
export const BIRTHDAY_WORDS = ["birthday", "bday", "janamdin", "janmdin", "janam din"];
export const FESTIVAL_WORDS = ["diwali", "deepavali", "festival", "christmas", "eid", "holi", "rakhi", "raksha bandhan", "puja", "pooja", "navratri", "durga puja", "pongal", "onam"];

/** Nouns that mean "I want a product" even when no slot is given ("need a toy"). */
export const PRODUCT_NOUNS = ["toy", "toys", "gift", "gifts", "present", "presents", "book", "books", "game", "games", "khilona", "khilone", "tohfa", "tohfe", "something to play with", "playset"];

/** Ordinary English words that sit one letter away from a dictionary word. Never "fixed" as typos. */
export const NOT_TYPOS = new Set(
  "print prints point points plans plays plant plane party parts paints painted stars start stage story pianos drums dress press bugs hugs mugs class glass grass brass games names frames craft draft drift lamb labs lips stamp stack stick track trick trucks bricks socks rocks books looks hooks cooks gears years tears bears dears stem steam team".split(" "),
);
