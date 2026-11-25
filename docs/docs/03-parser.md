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

1. **Tap path.** Pills send coded updates (`age`, `cat`, `budget`, `interest`, `recipient`, `relax`,
   `profile`, `load`, `reset`). No parsing, no model. Max 40 taps per chat.
2. **Guards** for typed text: trim to 300 chars; turn cap (guest 5, signed-in 10, both in `ops`);
   the model kill-switch (`ops.llmDisabled`) forces rules-only.
3. **`rulesParse(text)`**: normalise (`norm`), then independent extractors:
   - age (`ageFrom`): ranges, "N years/yrs/yo/y/o", months, "aged N", life-stage words (newborn, baby,
     toddler, preschool, nursery, LKG, UKG, teen, tween). Over 14 gives `out_of_range`.
   - budget (`budgetFrom`): "under/below/upto/within/max/around/budget of N", currency forms, "between A and B"
     (uses the upper number), "over N", "cheap" (500), "any budget" (clears). `capFrom` takes the largest
     cap <= N.
   - category (`CAT_WORDS`, first match wins) and interests (`INT_WORDS`, up to 2).
   - recipient and occasion by keywords (niece, nephew, gift, birthday, return gift, Diwali ...).
   - intent: `out_of_range` > `cert` (ISI, BIS, non-toxic ...) > `advice` (only if no category/budget/
     interest found) > `search` (any slot) > `greeting` > `other`.
4. **`needsLlm(parse)`** decides whether rules are enough:
   no slots found -> model; typo / number word / "turning" / "bday" left over -> model; more than 3
   unexplained words -> model; otherwise rules. Intents `advice/greeting/cert/out_of_range` never call it.
5. **`llmParse`** (SIMULATED): normalises number words, fixes typos with Levenshtein against the
   dictionaries (`nearWord`), rewrites "turning N", then runs `rulesParse` again. Token counts
   (`650 + len/4 + prev slots/4` in, 120 out) and rupee cost (`llmCost`, Haiku 5.5 list price, Rs 95/US$) are
   computed realistically so the cost panel is meaningful.
6. **`mergeSlots(prev, incoming, clear, reset)`**: new values override old; interests merge (new first,
   max 2); `clear` removes a slot ("any budget"); `reset` wipes.
7. **`slotKey(slots)`** = cache key: `age=..|cat=..|max=..|int=a+b|for=..|occ=..`.

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
| no age | one question with age pills (implemented) |
| nothing / "something nice" | greeting + pills, never an error |
| conflicting ages | "Which child is this for?" (not implemented) |
| advice / cert / off-topic | templated answer or polite redirect (implemented) |
| rules and model both empty | browse pills, never a dead end |

Rule: at most one question per turn; never refuse to show results once age exists.

## Safety properties (keep these true)

- Output is validated against enums; an off-vocabulary value is dropped, never stored.
- The model sees the previous slots + the new message, not chat history (cost lever and privacy).
- Message text is treated as data; the model's only output is slot JSON. Worst case from injection is a wrong slot.
- On model failure or kill-switch, fall back to the rules result and ask the single missing question.

## Test it as data

`scripts/smoke.ts` holds the current cases. Production plan: a **golden set of ~200 labelled messages**
(short, long, typos, number formats, negations, multi-child, vague, off-topic, injection attempts) run in
CI with per-slot accuracy. Every real failure becomes a case. Track "model used %" (target <= ~20% of
typed turns); above that, grow the synonym tables instead of paying for calls. Because raw chat is not
stored, log only counters (model fallback, zero-slot parse, rephrase).
