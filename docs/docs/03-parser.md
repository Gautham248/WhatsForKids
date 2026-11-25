# 03. The parser

Turns what a parent typed (or tapped) into a coded slot object. It does not pick products and never
writes reply text. File: `lib/parser.ts`. Consumed by `lib/chat.ts`.

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
4. **`rulesParse(text)`**: normalise (`norm`), then independent extractors:
   - age (`ageFrom`): ranges, "N years/yrs/yo/y/o", months, "aged N", life-stage words (newborn, baby,
     toddler, preschool, nursery, LKG, UKG, teen, tween). Over 14 gives `out_of_range`.
   - budget (`budgetFrom`): "under/below/upto/within/max/around/budget of N", currency forms, "between A and B"
     (uses the upper number), "over N", "cheap" (500), "any budget" (clears). `capFrom` takes the largest
     cap <= N.
   - category (`CAT_WORDS`, first match wins) and interests (`INT_WORDS`, up to 2).
   - recipient and occasion by keywords (niece, nephew, gift, birthday, return gift, Diwali ...).
   - intent: `out_of_range` > `cert` (ISI, BIS, non-toxic ...) > `advice` (only if no category/budget/
     interest found) > `search` (any slot) > `greeting` > `other`.
   - gender by keywords (boy, son, nephew, he / girl, daughter, niece, she). Both present → not set.
   - personalisable by keywords (personalised, customised, engraved, "with their name").
5. **`needsLlm(parse)`** decides whether rules are enough:
   no slots found -> model; typo / number word / "turning" / "bday" left over -> model; more than 3
   unexplained words -> model; otherwise rules. Intents `advice/greeting/cert/out_of_range` never call it.
6. **`llmParse`** (SIMULATED): normalises number words, fixes typos with Levenshtein against the
   dictionaries (`nearWord`), rewrites "turning N", then runs `rulesParse` again. Token counts
   (`650 + len/4 + prev slots/4` in, 120 out) and rupee cost (`llmCost`, Haiku 5.5 list price, Rs 95/US$) are
   computed realistically so the cost panel is meaningful.
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

## Not in the demo: target design for "handles any input"

These are the improvements designed for production. They are **good experiments** (see `07-experiments.md`).

- **Confidence per slot** (`high`/`low`): number-based age is high; life-stage words and "just started
  school" are low. Low-confidence slots can be shown back ("Looking for ages 3-5. Right?").
- **Conflicts**: two different ages ("my 4 and 9 year olds") -> ask which child, do not guess.
- **Negations and exclusions**: "not noisy", "no screens", "nothing battery operated". Currently the rules
  would match the opposite words. Detect negation scope and either exclude or ask.
- **Budget words**: "premium/splurge" -> top cap at low confidence; "pocket money" -> 500.
- **Normaliser upgrades**: `1.5k`, `2 thousand`, `Rs.1,500/-`, `18mo`, `class 2`, Hinglish stems.
- **Model trigger rule**: long message (> ~15 words) with few slots found, or negations/conflicts detected.
  Model output merges *below* rule results (rules win on conflict) and is dropped if off-enum.
- **Decision layer**: what to do with partial results (see table below). Mostly implemented in
  `respond()` in `lib/chat.ts`; conflict handling is not.

| Parsed | Experience |
| --- | --- |
| age + (category or interests) | results immediately (3 cards) |
| age only | results (up to 6) plus narrowing pills |
| no age | asks for age plus the other missing details, all as pill groups (implemented) |
| nothing / "something nice" | greeting + pills, never an error |
| conflicting ages | "Which child is this for?" (not implemented; saved child profiles each get a pill) |
| advice / cert / off-topic | templated answer or polite redirect (implemented) |
| rules and model both empty | browse pills, never a dead end |

Rule: ask for everything missing in one turn; never refuse to show results once age exists.

## Safety properties (keep these true)

- Output is validated against enums; an off-vocabulary value is dropped, never stored.
- The model sees the previous slots + the new message, not chat history (cost lever and privacy).
- Message text is treated as data; the model's only output is slot JSON. Worst case from injection is a wrong slot.
- On model failure or kill-switch, fall back to the rules result and ask for what is missing.
- Gender is parsed only when volunteered or picked, and is used only in reply wording. `search` never reads it
  (a smoke test checks results are identical with and without it).

## Test it as data

`scripts/smoke.ts` holds the current cases. Production plan: a **golden set of ~200 labelled messages**
(short, long, typos, number formats, negations, multi-child, vague, off-topic, injection attempts) run in
CI with per-slot accuracy. Every real failure becomes a case. Track "model used %" (target <= ~20% of
typed turns); above that, grow the synonym tables instead of paying for calls. Because raw chat is not
stored, log only counters (model fallback, zero-slot parse, rephrase).
