# How the chat understands parents, in plain English



## The short version

When a parent types something like *"gift for my 4 year old niece who loves dinosaurs, under 1000"*, the chat doesn't "understand" it the way a person does. It picks out a handful of facts and fills in a short form:

| Box on the form | Filled with |
| --- | --- |
| Age | 3–5 years |
| Budget | Up to ₹1,000 |
| Likes | Dinosaurs |
| Who it's for | A gift |
| Boy or girl | Girl |

That little form is all the search ever sees. The products are then picked by ordinary rules (age fits, price fits, matches what the child likes), and the reply is written from fixed templates. **No AI writes anything the parent reads.**

The part that fills in the form is called the *parser*. It works in two layers:

1. **A rulebook** (built, real, free). It's a list of patterns, like "a number followed by *year old* is an age" or "*under* followed by a number is a budget". It also tidies the message first: number words, "1.5k", common Hinglish and small typos. About 85% of messages are handled here, instantly and at no cost.
2. **An AI helper**, only for the messages the rulebook can't make sense of. It fills in the same form. In the demo it is *pretend* by default; a switch in Ops can turn on a real one (Claude Haiku). More on that below.

## The form, box by box

Only fixed values are allowed in each box. The parser can't invent a new one.

- **Age:** one of five bands: 0–2, 3–5, 6–8, 9–12, 13–14. Over 14, the chat politely says it only covers children up to 14.
- **Budget:** one of four limits: up to ₹500, ₹1,000, ₹2,000 or ₹5,000. "Under 1,200" becomes "up to ₹1,000", the nearest limit below.
- **Kind of thing:** building, pretend play, art, books, outdoor, puzzles, music, science, soft toys, sensory.
- **Likes** (up to two): dinosaurs, animals, music, art, building, vehicles, space, nature, stories, pretend play.
- **Who it's for:** their own child, or a gift.
- **Occasion:** birthday, festival, or return gift.
- **Boy or girl:** used **only to word the reply** ("…for a girl"). It never changes which products are shown. A test checks this.
- **Can be personalised:** show only products the brand can add a name to (the name is entered on the brand's own site; we never ask for it).

## What happens when a parent sends a message

Think of it as a short checklist the chat runs every time:

**1. Safety checks first.**
- Very long messages are cut to 300 characters.
- Guests get 5 typed messages per chat and 15 per day on one device; signed-in parents get more.
- If the AI budget for the day has run out, the AI helper is switched off and only the rulebook is used.

'**2. The rulebook tidies the message, then reads it.**

First it tidies: number words become digits ("five" → 5, "twenty five hundred" → 2500), shorthand is expanded ("1.5k" → 1500, "do hazaar" → 2000), and small typos are fixed when there is only one sensible fix ("dinasaurs" → dinosaurs). Then it looks for each box separately:
- *Age:* "4 year old", "18 months", "5 saal ka", "4-6 years", "turning 7", "class 2" (class + 5 = age 7), and words like toddler, baby, LKG, preschool, tween, teen. Ages guessed from words like "toddler" are marked as a guess.
- *Budget:* "under 1000", "₹1,500", "Rs.1,500/-", "2k", "1000 tak", "between 500 and 1000", "cheap" or "pocket money" (₹500), "premium" (₹5,000, marked as a guess), "any budget" (clears it).
- *Kind of thing and likes:* word lists, e.g. "lego", "blocks", "stacking" → building; "dino", "T-rex" → dinosaurs.
- *Gift or own child:* "niece", "nephew", "bhanji", "gift", "birthday" → gift; "my son", "meri beti", "my toddler" → own child.
- *Boy or girl:* "son", "nephew", "beta" → boy; "daughter", "niece", "beti" → girl. "he" or "she" alone counts as a guess. If both appear, it's left blank.
- It also spots *what kind of message* this is: a product search, a hello, a certification question ("ISI certified…"), a parenting question ("my child won't sleep"), or something off-topic.

It also understands three trickier things:
- **"Not" and "no".** "No dinosaurs, he likes space" means space, *not* dinosaurs. Words after "no", "not", "without", "doesn't like" (or before "nahi", "mat do") are set aside as things to leave out.
- **Two children at once.** "Toys for my 4 and 9 year olds" has two ages, so the chat asks which child rather than guessing.
- **Corrections.** "Actually make it 6", "not 5, 6" or "change budget to 2000" replace what was said before.

**3. Does the rulebook need help?** The AI helper is called only if:
- the rulebook found nothing at all, or
- the message is long (more than 15 words) but only one box was filled, or
- there's a "no" or "not" before something the rulebook doesn't recognise ("nothing noisy"), or
- the only thing found is an age guessed from a word like "toddler", or
- more than three words were left unexplained.

Typos and written-out numbers no longer need the AI helper, because the rulebook now handles them for free. Otherwise the rulebook's answer is used as is.

**4. The answer is added to what the chat already knows.** New facts replace old ones ("actually under 2000" changes the budget), likes are combined (up to two), and "start over" clears everything.

**5. Search and reply.** With the form filled in:
- If the parent mentioned **two ages**, it asks "Which child is this for?" with one tap option per age, and searches once they pick.
- If something was **left out** ("no dinosaurs"), the reply starts with "Leaving out dinosaurs." If it's something the catalogue can't filter yet ("nothing noisy"), the chat says so honestly and asks the parent to check each product page.
- If the age or budget was **a guess** ("toddler", "premium"), the reply says "Looking at ages 0–2. Right?" with tap options to change it.
- If the **age is known**, products are shown straight away, and the reply lists **everything still missing** (budget, what they like, gift or not, boy or girl) with tap options for each, so the parent can answer it all in one go.
- If the **age is missing**, the chat asks for it, along with the other missing details, all as tap options.
- If **nothing matches**, it relaxes one thing at a time (first a slightly higher budget) and never shows an empty screen.
- **Parenting questions** get a polite "I only help find products", plus one related search where it makes sense ("Bedtime books for 0–2").
- **Certification questions** are answered only from documents we actually hold.

### Tapping instead of typing

The tap options (pills) skip the parser entirely: each pill is already a filled-in box ("Up to ₹1,000", "Loves space"). A parent can tap several and press **Show ideas**, or tap some *and* type something, and both go in together. If the typed words and a tapped pill disagree, **the typed words win**.

## The AI helper: what's real and what's pretend

The AI helper's only job is to fill in the same form. It's told to return only the form, never text for the parent, so the worst a trick message can do is fill a box wrongly. Its answer is then checked: anything not on the fixed lists is thrown away, and **the rulebook always wins**. The AI can fill a box the rulebook left empty, but never change one the rulebook filled, and never add back something the parent said to leave out.

There's a switch for it in **Admin → Ops → Parser model**:
- **Simulated** (the default). No AI is called. A stand-in tidies the message and runs the rulebook again. The token count and rupee cost it shows are calculated the way the real thing would be charged, so the cost panels are realistic, but nothing leaves the browser.
- **Real (Claude Haiku).** The chat sends the new message (up to 300 characters) and the current form to our own server, which asks Claude Haiku to fill in the form. It costs around a paisa per call, and the cost shown is the real one. While it waits, the chat shows "Thinking…". If the AI fails or takes more than about 2 seconds, the rulebook's answer is used and nothing is charged. This only works once a key is set up on the server; until then Ops shows "not configured" and the chat quietly uses the rulebook.

The spending caps and the kill switch work in both modes: when today's AI budget runs out, the chat carries on with the rulebook alone.

## How well it works today

We keep a test set of 214 real-looking messages (clean ones, typos, Hinglish, "not" phrases, two children, corrections, trick messages, long rambling ones) and check what the rulebook fills in for each.

| | Before this work | Now |
| --- | --- | --- |
| Boxes filled correctly | 85.5% | **99.4%** |
| Messages fully right | 103 of 214 | **209 of 214** |
| Messages that need the AI helper | 35.5% | **15.4%** |

Some examples, rulebook only:

| Message | What it got | Verdict |
| --- | --- | --- |
| "gift for my 4 year old niece who loves dinosaurs, under 1000" | 3–5, ₹1,000, dinosaurs, gift, girl | ✅ Rulebook alone |
| "five yr old likes dinasaurs" | 3–5, dinosaurs | ✅ Rulebook alone (used to need the AI helper) |
| "my son is turning 7, something with rockets" | 6–8, space, own child, boy | ✅ Rulebook alone (used to need the AI helper) |
| "budget 1.5k for a 6 year old" | 6–8, up to ₹1,000 | ✅ Understands "1.5k" |
| "under 2 thousand for a toddler" | 0–2 (a guess, so it checks), up to ₹2,000 | ✅ |
| "no dinosaurs, he likes space" | space; dinosaurs left out | ✅ |
| "toys for my 4 and 9 year olds" | asks "Which child is this for?" | ✅ |
| "kuch accha gift for 5 saal ka beta" | 3–5, gift, boy | ✅ Common Hinglish |
| "nothing noisy for a 3 year old" | 3–5; says it can't filter "noisy" yet | ⚠️ Honest, but can't remove noisy toys |
| "something for a kid who just started school" | 3–5 (a guess) | ⚠️ Checks with the parent; may ask the AI helper |
| "something for a kid who is 4" | nothing | ❌ Needs the AI helper |

The five messages from the test set the rulebook still gets wrong are long, chatty ones ("my sister's son…", "she is 4") and one trick message. Those are exactly what the AI helper is for.

## Privacy, in one paragraph

The parent's actual words are never saved. They exist only for the moment the message is being read. What's kept is the filled-in form (age band, budget, likes, and so on). For signed-in parents that form goes into their search history, and for clicks to a brand it's attached to the click record. When the real AI helper is on, it sees only the new message and the current form, never the whole conversation, and our server doesn't log the message.

## Where it lives (for the curious)

- `lib/parser.ts`: the rulebook, the pretend AI helper, the rule for when to call it, and the checks on the real AI's answer.
- `lib/lexicon.ts`: the word lists (categories, likes, Hinglish, number words, "not" words).
- `app/api/parse/route.ts`: the small server step that calls the real AI (off unless a key is set).
- `lib/chat.ts`: the checklist above (safety checks, combining answers, choosing the reply and the tap options).
- `lib/rank.ts`: picking products from the filled-in form.
- `scripts/smoke.ts` and `scripts/golden.ts`: automatic checks (`npm run test:logic`, `npm run test:golden`).
