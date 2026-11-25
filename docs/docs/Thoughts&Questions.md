## 1. Recommendations and reasons

### If "Why we picked it" is written once, how can it fit different requests?

The same RC car could be picked for "birthday gift for an 8-year-old" and for "toys for a 15-year-old under Rs 2,000". The parent needs a different reason each time.

**Suggested:** Split this into two pieces of text.

- "Why we picked it" on the product page stays fixed. It explains why the product is in the catalogue at all, and it reads the same for everyone.
- The one-line reason on the chat card changes with the request. When the admin reviews a product, they approve a short list of reasons, each tagged with what it answers: gift, age fit, budget, skill or interest. For the RC car that could be "ready to play out of the box, good for unwrapping" (gift), "rechargeable and fast enough to hold a teenager's interest" (age fit, older) and "one of the few hobby-grade cars under Rs 2,000" (budget).
- The chat shows the reason whose tag matches the request. The birthday query gets the gift reason, and the 15-year-old query gets the age and budget reasons.

A person approves every sentence, and we don't pay to write new text on each search. We could generate a fresh reason for every search, but that costs more and can make claims nobody checked.

### How do we stop the same products showing up for every query, with the same reason?

**Suggested:** Four rules.

- The reason follows the query. Since the reason is picked by tag, two different queries that return the same product show different reasons.
- No repeats within a session. Products already shown in the chat move down the list unless the parent asks for them again.
- Spread the results. No more than two products from the same brand or sub-category in one set.
- Watch the numbers. Count how often each product is shown. If a handful of products appear in most results, the catalogue is too thin in that area. That's a curation job, not a code fix.

Repetition is usually a catalogue problem. With only four RC cars, every RC query shows the same four. Before launch, agree a minimum number of products per age band and category.

### How many results should we show?

**Suggested:** Three for a specific request ("magnetic tiles, 6-year-old, Rs 1,500") and up to six for a vague one ("gift for my nephew"), with refine pills underneath. The admin can change the limits.

### What happens when nothing matches?

**Suggested:** Never show an empty screen. Say what didn't match and offer to relax one thing at a time, for example "Nothing under Rs 500 for this age. Here are options up to Rs 800." Schedule B tests a "no-match response", so the wording needs agreeing now.

## 2. What we ask the parent

### What is the bare minimum we need before we search?

For example, "show me toys for a 5-year-old": show results with refine pills, or first ask "educational or just for fun?"

**Suggested:** Only the child's age is required. If we have it, search straight away and show refine pills for type, budget and occasion. Parents who wanted a quick look get results, and parents who want to narrow down tap a pill.

Ask a question only when the age is missing, and ask just one, as tap options (0-2, 3-5, 6-8, 9-12, 13+). Several questions up front feel like a form, and many parents will leave.

### Should we filter by "for a boy" or "for a girl"?

**Suggested:** No hard filter. Treat it as a soft hint for interests and never hide products because of gender. Many parents dislike gendered toy aisles, and a filter would look bad on a platform built on trust. We should agree the policy now.

### What age range does the platform cover?

The 15-year-old example is outside "toys" for safety rules: India's toy safety order covers toys for children up to 14.

**Suggested:** Decide now whether launch covers 0-14 or goes up to 18. If teenagers are in, the catalogue needs gadgets, books and hobby kits as well as toys, with different evidence rules for each.

### Is the main user buying for their own child, or a gift for someone else's?

**Suggested:** Assume gifting is a large share. It changes quite a bit. Gift buyers know less about the child, care more about how it looks unwrapped and what it costs, and have less use for a saved child profile.

### What should the chat do with questions that aren't about products?

For example, "my child won't sleep" or "is screen time bad?"

**Suggested:** Say politely that the chat only helps find products, and offer a related search when there is one ("Here are bedtime books for 3-year-olds"). No parenting or medical advice. That protects the brand and keeps costs down.

## 3. Product information and curation

### Will the admin vet each product manually and write "why we picked it" and the other sections?

**Suggested:** Yes, a person reviews every product, but they shouldn't write from scratch. The AI drafts each section from the seller's description, and the admin reads, edits and approves. Each product would take about 10-15 minutes (my estimate). So the real questions are:

- Who on the client's side does this?
- How many products a week can they review?
- Do they have the expertise for the evidence checks (certificates, materials), or will they need help?

If the answer is one part-time person, the catalogue will grow slowly and the chat will repeat itself.

### Many products won't have detailed descriptions. How do we fill the other sections?

**Suggested:** Don't invent anything the source doesn't support. Split the sections into three tiers:

- Required to publish: name, brand, price, link, photo, age band, and evidence for any safety or material claim. A product missing any of these can't go live.
- Generated from the product type when the seller says little: "Ways to play together" can be written from what a stacker or a puzzle generally does, labelled as general ideas and approved by the admin.
- Hidden when there's nothing to say: "Expert input", piece counts, materials. An empty section is better than a made-up one.

When a product is thin, the admin can ask the brand for more details. That's easier here because the brand has already authorised us. The sample page shows the problem: age is blank, and material says "needs confirmation" in one place and "reviewed" in another.

### Which claims need proof before they can be shown?

**Suggested:** Safety certification (BIS licence and ISI mark for toys), materials ("non-toxic", "natural wood"), age suitability, and anything about development ("builds motor skills"). Each needs a document, a date and an expiry. Schedule B tests this but never lists the claims, so the list should go into the contract.

### How fresh do prices and stock need to be?

**Suggested:** Refresh weekly, show "price as of [date]" everywhere, and hide a product that hasn't been refreshed in, say, 30 days. Price changes wait for admin approval, so prices will sometimes be a few days old. The sample's "confirm before purchase" wording covers that. Real-time stock is out of scope.

### What happens when a brand discontinues a product or changes its page?

**Suggested:** The refresh run flags it, the product is hidden automatically and the admin is told. Parents should never click through to a dead page.

### Who handles a brand complaining about how we described their product?

**Suggested:** The client's admin handles it, using an "unpublish now" button. Every word was approved by a person, so there's a clear owner.

## 4. Scraper and sources

### Which sites are we targeting first? Do we need a custom adapter for each?

**Suggested:**  

- Shopify stores, which are common among Indian D2C brands, expose product data in a standard format, so one adapter covers all of them.
- WooCommerce and other sites that publish standard product data in the page (schema.org) can share a second adapter.
- Custom adapters only for the remaining sites, priced per site.
- CSV upload for any brand that would rather send a spreadsheet than be scraped.

Ask the client for the launch brand list and check which platform each one runs on before the site count in Schedule B is fixed. That number is the main price lever for the scraper.

### What about Amazon, Flipkart and FirstCry?

**Suggested:** Not through the scraper, since Schedule B limits it to authorised brand pages. If the client wants marketplace links, add them by hand or by CSV, and keep in mind that Amazon only allows its prices to be shown through its own API. The simplest launch is brand sites only.

## 5. Money and cost

### How will we know whether the platform is working?

**Suggested:** Agree three numbers to watch from day one: the share of chats that end in a click to a brand, clicks per chat, and sales reported back by brands. Schedule B already tracks clicks, but sales tracking needs adding.

### Who pays the AI and hosting bills, and what is the monthly limit?

**Suggested:** After handoff the client does (Schedule B, B6). They should set a monthly ceiling now, and we should build a hard cap and alerts so a traffic spike or a bot can't run up a surprise bill. With the design we're proposing, the AI cost is around Rs 0.10 per chat (my estimate).

### Should guests be limited?

**Suggested:** Yes. Around five messages per guest chat and a daily limit per device, then ask them to sign in. This stops people using the box as a free general chatbot.

### Will there be sponsored or paid placements?

**Suggested:** If brands will ever pay for position, the results need a clearly labelled "Sponsored" slot and a rule that payment can't get an unvetted product listed. Adding it later is a contract change.

## 6. Accounts and children's data

### Does the optional child profile add enough value to justify the risk?

**Suggested:** Keep it minimal: age band and interests only, with no name, birth date or photo. India's data protection law treats anyone under 18 as a child and requires verified parental consent, and Schedule B leaves the consent standard to the client.

### What about parents with more than one child?

**Suggested:** Allow several profiles, each just an age band and interests, so the parent can switch between them.

### What should signed-in parents get that guests don't?

**Suggested:** Saved products and chat history at launch (already in Schedule B). Shareable birthday wishlists are the most valuable next step, because relatives buy from them. That's a later change, but worth flagging now.

<aside>
💡

One feature we could add: a shareable wishlist. Parents build a list of items and share it with family, and family can buy straight from that list.

</aside>

<aside>
💡

Some toys offer personalization

</aside>