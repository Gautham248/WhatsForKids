# 03. The parser

Turns what a parent typed (or tapped) into a coded slot object. It does not pick products and never
writes reply text. Files: `lib/parser.ts` (logic) and `lib/lexicon.ts` (word lists). Consumed by `lib/chat.ts`.

## Output

```ts
interface Slots {            // lib/types.ts. This is the ONLY thing persisted about a chat.
  age?: Band;                // "0-2" | "3-5" | "6-8" | "9-12" | "13+"
  category?: string;         // slug from CATEGORIES
  budget?: BudgetCap;        // 500 | 1000 | 2000 | 5000
  interests?: string[];      // slugs from INTERESTS, max 2
  recipient?: "own" | "gift";
  occasion?: "birthday" | "festival" | "return_gift";
  gender?: "boy" | "girl";   // reply wording only. Never a filter, never a ranking input.
  personalisable?: boolean;  // only products with a curator personalisation note
}
interface Parse {            // internal result of rulesParse / llmParse
  intent: "search" | "greeting" | "advice" | "cert" | "out_of_range" | "other";
  slots: Slots; clear: (keyof Slots)[]; reset: boolean;
  cert?: string; outOfRange?: number;
  matched: string[]; unexplained: string[];     // used for the "needs model?" decision and the Inspector
  fixes: string[];                              // what the normaliser rewrote (number words, typos)
  confidence: Partial<Record<keyof Slots, "high" | "low">>;  // "low" = a guess worth echoing back
  conflicts?: { ages?: Band[] };                // two or more different ages; no age is set
  excluded?: { categories: string[]; interests: string[]; other: string[] };  // "no dinosaurs"
  corrections: (keyof Slots)[];                 // slots this message corrected ("actually make it 6")
}
```

## Implemented in the demo

Per turn (`runTurn` in `lib/chat.ts`):

1. **Tap path.** Pills send coded updates (`age`, `cat`, `budget`, `interest`, `recipient`, `occasion`,
   `gender`, `personal`, `relax`, `profile` (per child profile id), `load`, `reset`). Pills in a reply are
   grouped (Age, Budget, They like, Kind of thing, Who it's for, Occasion, Boy or girl, Extras); the parent
   can pick several and apply them as one `multi` action, so one turn and one search. No parsing, no model.
   Max 40 taps per chat.
2. **Typed text plus picked pills.** `send(text, acts)` applies the picked pills first as coded slots,
   then parses the text and merges it, so **the typed words win a conflict**. If the text adds nothing
   (`greeting`/`other`) but pills were picked, it still searches on the pills.
3. **Guards** for typed text: trim to 300 chars; turn cap per chat (guest 5, signed-in 10); guest daily
   cap per device across chats (default 15; the store counts it and passes `deviceCapped`); the model
   kill-switch (`ops.llmDisabled`, also set automatically when the spend cap is hit) forces rules-only.
4. **`rulesParse(text)`**: `normalise` first, then independent extractors.
   - **Normaliser:** English number words to digits ("twenty five hundred" → 2500; a lone "one" is kept
     unless a unit follows); Hindi numbers only before a unit ("do hazaar", "dedh hazaar", "paanch saal");
     `k`/thousand/hazaar ×1000 and hundred/sau ×100; "N and a half"; spelling variants (`SPELLING`);
     "ies" plurals. **Typos** are fixed when unambiguous: at least 5 letters, 1 edit (2 for 8+ letters,
     a swapped pair counts as one), same first letter, never a word in `NOT_TYPOS`; on a tie a
     same-length word wins, otherwise nothing is changed. Every rewrite is listed in `fixes`.
   - **Negation** (NegEx style): cues before the words ("no", "not", "without", "doesn't like", "hates",
     `NEG_BEFORE`) cover up to 4 words, ending at punctuation, `SCOPE_END` words or a new clause;
     Hinglish cues after the words ("nahi", "mat do", `NEG_AFTER`) cover up to 3 words before them.
     Negated words are masked so they are not matched as wanted, and reported in `excluded`.
     "no budget", "not sure" and similar (`NOT_NEGATED_AFTER_NO`) are not negations.
   - **Age:** every explicit age is collected ("N years/yrs/yo/saal", months, ranges count once at their
     midpoint). Two or more different bands is a **conflict**: no age is set. Otherwise implied ages:
     "turning N", "Nth birthday", class/grade/std N (age N + 5), life-stage words (baby, toddler,
     preschool, LKG/UKG, tween, teen; **low** confidence). Over 14 gives `out_of_range`.
   - **Budget** (`budgetFrom`): "under/below/upto/within/max/around/budget of N", currency forms
     ("Rs.1,500/-", "₹2k"), "N rs/bucks", "N budget/tak/ke andar", "between A and B" (upper number),
     "over N" (not after "no/not/nothing"), a bare amount that is not an age or a year, and budget words
     ("pocket money" 500, "cheap/sasta" 500, "premium/splurge" 5000; **low** confidence). "any budget"
     clears. `capFrom` takes the largest cap <= N (500 if below).
   - **Corrections:** "actually", "not 5, 6", "make it 6", "change budget to 2000" replace the earlier
     value (`corrections`); "any type is fine" clears the category, "any interest" clears interests.
   - category (`CAT_WORDS`, first match wins) and interests (`INT_WORDS`, up to 2), on the masked text.
   - recipient and occasion by keywords, including Hinglish relations (bhatija, bhanji ...).
   - intent: `out_of_range` > `cert` (ISI, BIS, non-toxic ...) > `advice` (only if no category/budget/
     interest found) > `search` (any slot, clear, conflict, exclusion, reset, or a product noun such as
     "need a toy") > `greeting` > `other`.
   - gender by keywords (boy, son, nephew, beta / girl, daughter, niece, beti). Both present → not set.
     Pronouns alone (he, she) give **low** confidence. "not for a boy" removes that word.
   - personalisable by keywords (personalised, customised, engraved, "with their name").
5. **`needsLlm(parse, text)`** decides whether rules are enough. Intents `advice/greeting/cert/out_of_range`,
   a reset, and a several-ages conflict never call it (the chat asks "Which child?" instead). It calls the
   model when: no slot was found; the message is long (more than 15 words) with at most one slot; a
   negation held words the rules could not map (`excluded.other`); the only slot is a guessed
   (life-stage) age; or more than 3 words are unexplained. Typos and number words no longer call it.
6. **The model**, chosen by the Ops switch `ops.parserModel`:
   - **Simulated** (default, `llmParse`): normalises, then runs `rulesParse` again. Token counts
     (`650 + len/4 + prev slots/4` in, 120 out) and rupee cost (`llmCost`, Haiku 5.5 list price,
     Rs 95/US$) are computed realistically so the cost panel is meaningful. No API is called.
   - **Real** (Claude Haiku 5.5): the store asks `planTextTurn` whether a model is needed, then calls
     `POST /api/parse` (`app/api/parse/route.ts`) with only the new message (cut to 300 characters) and
     the current slots, aborting after 2.5 s. The route uses structured output with `MODEL_SLOT_SCHEMA`
     (every field from the fixed lists, nullable, plus `intent` and `ages_mentioned`), a 2 s timeout,
     no retries, thinking off, low effort, and a frozen system prompt. It is off (503) unless both
     `ANTHROPIC_API_KEY` and `PARSER_MODEL_ENABLED=1` are set on the server, has a best-effort per-IP
     limit, and never logs the message. `GET /api/parse` reports whether it is configured.
   - The browser checks the answer again (`validateModelSlots`: off-list values dropped, at most 2
     interests) and merges it **below** the rules (`mergeModelBelowRules`: the model only fills empty
     slots, never undoes a clear, an exclusion or a conflict; two ages from the model become a conflict).
     Cost comes from the real token counts. On a failure or timeout the rules result is used, nothing is
     charged, and the Inspector says why. The kill switch forces rules only in either mode.
7. **`mergeSlots(prev, incoming, clear, reset)`**: new values override old; interests merge (new first,
   max 2); `clear` removes a slot ("any budget"); `reset` wipes.
8. **`slotKey(slots)`** = cache key: `age=..|cat=..|max=..|int=a+b|for=..|occ=..|g=..|pers=..`.
9. **Advice questions** get a polite "I only help find products" plus at most one related search from a
   fixed map (`relatedSearch` in `lib/parser.ts`: sleep/bedtime → books, screen time → outdoor, tantrums →
   sensory, homework → puzzles, potty → books). Unmapped topics get no related pill. No advice, ever.

## What we ask, and when (decided 2026-11-25)

After every search the reply names **every** missing detail at once (`missingSlots`/`askFor`: age, budget,
what they like, gift or own, boy or girl) and offers a pill group for each, plus Occasion (unless it is for
their own child) and Extras ("Can be personalised"). The parent answers in one message or one round of
picks, not several chats. This departs on purpose from "ask only one question, only for age"
(Thoughts & Questions): results are already on screen when we ask, so it does not read as a form.

The Inspector (Chat page toggle) shows which path ran and why (`TurnInfo.why`), the slot diff, and cost.

## Decision layer

What the chat does with partial results (`respond()` and the conflict branch in `lib/chat.ts`):

| Parsed | Experience |
| --- | --- |
| age + (category or interests) | results immediately (3 cards) |
| age only | results (up to 6) plus narrowing pills |
| no age | asks for age plus the other missing details, all as pill groups (implemented) |
| nothing / "something nice" | greeting + pills, never an error |
| conflicting ages | "Which child is this for?" with a pill per age and per saved child profile (implemented) |
| advice / cert / off-topic | templated answer or polite redirect (implemented) |
| rules and model both empty | browse pills, never a dead end |

Rule: ask for everything missing in one turn; never refuse to show results once age exists.

### Replies for the new signals (templates in `lib/chat.ts`)

- **Conflict:** "Which child is this for? You mentioned ages 3–5 and 9–12. Pick one and I'll search for
  that age." One pill per band plus saved child profiles. Nothing is searched; other details are kept.
- **Exclusion:** "Leaving out dinosaurs." starts the reply, and the interest or category is removed.
  Words that cannot be filtered get "I can't filter out “noisy” yet, so please check each product page."
- **Guessed age or budget:** "Looking at ages 0–2. Right? If not, pick the age below." with pills for the
  other values. Values given as numbers are never echoed.

## Safety properties (keep these true)

- Output is validated against enums twice (structured output on the server, `validateModelSlots` in the
  browser); an off-vocabulary value is dropped, never stored. The model's form has no free-text field.
- Rules win: model values only fill empty slots.
- The model sees the previous slots + the new message, not chat history (cost lever and privacy).
- Message text is treated as data; the model's only output is slot JSON. Worst case from injection is a wrong slot.
- On model failure, timeout or kill-switch, fall back to the rules result and ask for what is missing.
- The API key lives only on the server (Vercel environment variable), never in the browser. Real mode is
  off by default; set a monthly spend limit in the Anthropic Console before turning it on in production.
- Gender is parsed only when volunteered or picked, and is used only in reply wording. `search` never reads it
  (a smoke test checks results are identical with and without it).

## Test it as data

- `npm run test:logic` (`scripts/smoke.ts`): specific cases, including model validation, the merge rule,
  failure fallback, injection and the gender rule. Model answers are passed in, so no network is needed.
- `npm run test:golden` (`scripts/golden.ts` over `scripts/golden-cases.ts`): 214 labelled messages in 12
  buckets (clean, number formats, age formats, typos, Hinglish, vague, negation, several children,
  corrections, advice/cert/off-topic, injection, long). Rules only. It prints per-slot accuracy, per-bucket
  pass rates and the "would call model" rate, and fails below a regression floor; `--strict` also enforces
  the targets (slot accuracy >= 90%, model rate <= 20%, every number-format, Hinglish, negation and
  several-children case passing).

| Point | Slot accuracy | Cases passed | Would call model |
| --- | --- | --- | --- |
| Before the work (rules only) | 85.5% | 103 / 214 | 35.5% |
| Stronger normaliser and lexicon | 95.9% | 174 / 214 | 11.7% |
| Negation, conflicts, corrections | 99.4% | 209 / 214 | 11.2% |
| New model triggers | 99.4% | 209 / 214 | 15.4% |

The 5 remaining failures are left to the model: one injection ("pretend you are a pirate") and four long
messages ("my sister's son", "she is 4", "son is 10", "drawing and painting"). Every real failure should
become a case. Because raw chat is not stored, log only counters (model fallback, zero-slot parse, rephrase).

## Not built yet

- Exclusions are acknowledged, not filtered: "nothing noisy" cannot remove noisy products until ranking
  gains an exclude filter.
- Devanagari script, voice input, and more interest tags (production target about 30-50).
