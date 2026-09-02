# SOSO Africa High-Conversion Simplified Site

## Approved roadmap and implementation audit

**Status:** Implementation-complete for all code-controlled requirements; launch remains gated by the external items listed below
**Prepared:** 31 August 2026  
**Last audited against the working implementation:** 2 September 2026
**Product:** SOSO Africa storefront  
**Primary objective:** Make the storefront simpler, more product-led, and faster to shop without losing any valuable content from `shopsoso.co`.

---

## 0. Evidence-based status register

This register is the current status for every actionable requirement, exit condition, acceptance criterion, and client decision in the roadmap below. It supersedes older planning language such as “should,” “recommended,” or “to decide.”

### Status legend

- **COMPLETE — CODE:** implemented and covered by source validation, automated tests, a real development HTTP check, or the completed browser review.
- **COMPLETE — APPROVED:** the client approved the direction represented by this roadmap and it is implemented.
- **BLOCKED — CLIENT/PROVIDER:** requires authoritative product, payment, rights, or editorial input that the implementation must not invent.
- **BLOCKED — PRODUCTION:** requires the approved domain, production deployment, live provider, Search Console, or real-device environment. Deployment was intentionally withheld.
- **NOT APPLICABLE:** conditional work that has no approved or operational input.

### 0.1 Strategy, scope, and source review

| Roadmap requirement | Status | Evidence / remaining gate |
|---|---|---|
| Preserve the current menu and immersive full-screen hero | **COMPLETE — CODE** | Responsive header/mega-menu and governed hero media remain in the storefront; browser review covered desktop and mobile navigation. |
| Adopt product-first category rhythm without cloning a reference site | **COMPLETE — CODE** | Five original SOSO category features follow the hero and use SOSO assets, copy, links, crops, and staff controls. |
| Apply Hobbs-like brand/footer discipline while retaining SOSO identity | **COMPLETE — CODE** | Stacked SOSO SVG lockups, blue/white states, desktop footer columns, and mobile accordion are implemented. |
| Preserve valuable current and legacy content | **COMPLETE — CODE** | The product platform, seven About pages, fourteen Journal records, policies, FAQ/service routes, redirects, and metadata are represented in the audited inventory and runtime. |
| Keep conversion actions clear | **COMPLETE — CODE** | Hero, category image/CTA, product cards, occasions, Journal actions, fit help, stylist help, and final CTA lead to concrete next steps. |

### 0.2 Homepage architecture and merchandising

| Roadmap requirement | Status | Evidence / remaining gate |
|---|---|---|
| Hero CTA reads “Shop New Arrivals” and leads to New Arrivals | **COMPLETE — CODE** | The editable default CTA is migrated to `/collections/new-arrivals`; runtime displays it outside a valid campaign window. |
| Campaign wording appears only for a real active promotion and automatically expires | **COMPLETE — CODE** | Staff can enable a campaign CTA with safe target and ISO start/end; the storefront falls back automatically outside the active window; invalid or empty collection targets are rejected. |
| Category order is Kaftan, Agbada, Shirts, Dashiki, Two-Piece Sets | **COMPLETE — CODE** | Public rendering orders exact canonical collection identities; no fuzzy title matching or fabricated target is used. |
| Categories alternate image/text on desktop and stack consistently on mobile | **COMPLETE — CODE** | `CategoryFeature` alternates by canonical position and uses one stable mobile composition. |
| Whole image and CTA are linked to the category | **COMPLETE — CODE** | Both the media frame and text CTA use the exact canonical category destination. |
| Benefit-led category description is concise and staff-editable | **COMPLETE — CODE** | Each category has validated description copy in the versioned platform model and staff editor. |
| Category image control supports one-to-four images, mobile alternatives, crops, static/crossfade mode, and timing | **COMPLETE — CODE** | Platform schema, migration, publication checks, staff editor, and storefront renderer cover these controls while preserving merchant edits. |
| Crossfade is slow, stable, visibility-aware, and reduced-motion safe | **COMPLETE — CODE** | Rotation is bounded to 3–15 seconds, pauses off-screen/when hidden/reduced motion is requested, and keeps stable media dimensions. |
| Rotating media does not request every asset on initial load | **COMPLETE — CODE** | Only current media is mounted initially; the next image is preloaded after the section becomes visible. |
| First category can load eagerly; below-fold category media is lazy | **COMPLETE — CODE** | Fetch priority is high only for the first category; later category images use lazy loading. |
| Every active category has an authoritative collection and an available relevant product | **COMPLETE — CODE** | Publication validation rejects unknown targets, duplicates, unsafe links, and active empty collections. Checkout remains independently fail-closed until authoritative mappings exist. |
| New Arrivals appears after the five categories and prioritizes purchasable/new merchandise | **COMPLETE — CODE** | Product selection excludes unavailable inventory and ranks `isNew` before merchandising priority. |
| Avoid immediate reuse of the fifth category image in New Arrivals | **COMPLETE — CODE** | New Arrivals is a live product-card grid rather than a repeat of the fifth category editorial panel. |
| Boardroom and Wedding remain the two default occasion destinations | **COMPLETE — CODE** | Defaults are Boardroom then Wedding; versioned migration corrects only the untouched shipped reverse order and preserves merchant-authored occasion edits. |
| Keep trust, fit/sizing, stylist help, Journal preview, and final CTA after shopping content | **COMPLETE — CODE** | These sections remain below categories, New Arrivals, and occasions in the required sequence. |
| Render the legacy generic `homepage.story` block | **NOT APPLICABLE** | It was intentionally retired from the simplified homepage because it duplicates the retained trust/fit/About journey and adds no distinct shopping action. Its source field remains migration-safe for existing documents. |

### 0.3 Header, logo, typography, and footer

| Roadmap requirement | Status | Evidence / remaining gate |
|---|---|---|
| Use a stacked SOSO/AFRICA logo in desktop and mobile header | **COMPLETE — CODE / BLOCKED — CLIENT FINAL ASSET APPROVAL** | Original SVG lockup is implemented with white hero state and blue light-surface state, intrinsic dimensions, and accessible “SOSO Africa” text; final production-art approval remains client-controlled. |
| Use a blue stacked footer mark and reusable primary asset | **COMPLETE — CODE** | Footer and shared `BrandLockup` use the reusable SVG family. |
| Supply a compact favicon symbol | **COMPLETE — CODE** | Favicon uses a compact original SOSO “S” symbol rather than a squeezed full wordmark. |
| Retain blue/gold brand use and original media | **COMPLETE — CODE** | CSS tokens and provided SOSO media remain authoritative; no third-party logo or artwork was copied. |
| Use Montserrat 400/500/600/700 locally with `font-display: swap` | **COMPLETE — CODE** | Fontsource serves exactly those four weights; the typography contract validator rejects remote Google Fonts and unsupported weights. |
| Use “Cart,” never customer-facing “Bag” | **COMPLETE — CODE** | v9 migrated known defaults and every customer render normalizes legacy merchant copy to Cart; internal event/schema compatibility identifiers remain intentionally unchanged. |
| Desktop and mobile expose equivalent destinations | **COMPLETE — CODE** | Both views retain Shop, New Arrivals, About, Journal/service, search, stylist help, sign-in/staff as applicable, and Cart destinations. |
| Footer includes shop, About, Journal, help, legal, contact, social, and mobile accordions | **COMPLETE — CODE** | Governed multi-column desktop footer and accessible mobile accordion use the same content model. |
| Newsletter appears only when approved and operational | **NOT APPLICABLE** | No approved operational newsletter provider or consent flow was supplied, so no dead form was added. |

### 0.4 Legacy About and Journal migration

| Roadmap requirement | Status | Evidence / remaining gate |
|---|---|---|
| Keep complete About pages under `/about/:slug` | **COMPLETE — CODE** | Seven audited records use the dedicated About renderer and canonical metadata. |
| Preserve fourteen Journal articles with source truth, dates, and URLs | **COMPLETE — CODE** | Bundled records and regression tests cover all fourteen; CMS records remain authoritative for matching slugs. |
| Give every article a near-opening takeaway, logical headings, SEO title/description/canonical, image alt, related links, and restrained actions | **COMPLETE — CODE** | Per-article validation covers the refreshed archival fields; prerendered output and runtime include fit, stylist, and safe shopping/reading paths. |
| Preserve original records while separating future editorial rewrites | **COMPLETE — CODE** | Source URLs/dates/archive fields remain; publishability and editorial approval stay separate from technical rendering. |
| Approve business, investment, impact, authorship, expertise, and similar claims before indexing | **BLOCKED — CLIENT/PROVIDER** | The source claims are preserved but deliberately remain behind the editorial/indexing approval gate. |
| Confirm rights and durably host legacy media rather than relying on 138 remote URLs | **BLOCKED — CLIENT/PROVIDER** | Technical media governance exists, but rights confirmation and an approved source for durable mirroring are required before copying. |

### 0.5 Redirects, SEO, AEO/GEO, and indexing

| Roadmap requirement | Status | Evidence / remaining gate |
|---|---|---|
| Maintain a machine-readable legacy inventory and redirect map | **COMPLETE — CODE** | JSON/Markdown inventories and bundled redirect decisions cover audited pages, posts, category spelling, canonical routes, and retirements. |
| Seed redirects idempotently without replacing merchant-managed records | **COMPLETE — CODE** | Advisory-locked database seeding and repeat-run tests preserve existing records byte-for-byte. |
| Return real HTTP 301 responses rather than client-only redirects | **COMPLETE — CODE** | API redirect endpoint and Vercel rewrites are implemented; development HTTP checks confirmed About and `danshiki` 301 responses. |
| Normalize customer-facing Dashiki and redirect Danshiki/Dansiki variants | **COMPLETE — CODE** | Canonical collection/content uses Dashiki; legacy variants resolve through approved redirect decisions. |
| Generate crawlable About/Journal HTML, sitemap, robots, canonicals, social metadata, and structured data | **COMPLETE — CODE** | SEO generation/release validation covers migrated routes, Article/BlogPosting, breadcrumbs, CMS precedence, and approved-host indexing rules. |
| Keep indexing fail-closed until approved `shopsoso.co` production conditions are satisfied | **COMPLETE — CODE** | Unknown/development hosts and unapproved editorial records remain `noindex`; production validator enforces the gate. |
| Reconcile against a fresh live legacy sitemap immediately before cutover | **BLOCKED — PRODUCTION** | Must be run against the final live WordPress sitemap at launch time so late source changes are not missed. |
| Verify production-domain redirect crawl, canonical host, robots, sitemap, and Search Console ownership | **BLOCKED — PRODUCTION** | Requires the withheld deployment, approved domain cutover, and owner-controlled Search Console access. |

### 0.6 Products, checkout, analytics, accessibility, and performance

| Roadmap requirement | Status | Evidence / remaining gate |
|---|---|---|
| Never expose unsafe checkout for legacy products | **COMPLETE — CODE** | Commerce is fail-closed; only authoritative mapped variants receive offers or purchase controls. |
| Supply authoritative JusticeSure mappings for 144 legacy products | **BLOCKED — CLIENT/PROVIDER** | Requires the real provider catalogue/variant IDs and merchant approval; the implementation must not guess them. |
| Confirm currencies, live payment, order, webhook, return, and refund behavior | **BLOCKED — CLIENT/PROVIDER** | Requires live JusticeSure credentials/provider acceptance and an approved production acceptance run. |
| Preserve payment-first bespoke flow with optional stylist help | **COMPLETE — CODE** | Checkout/payment return and atelier follow-up retain the approved purchase model without forcing account creation or stylist contact. |
| Track category impressions/clicks, product views, Cart, checkout, stylist, and Journal actions with consent | **COMPLETE — CODE** | Consent-aware first-party events cover these actions; internal legacy `add_to_bag` names map to AddToCart and are not customer copy. |
| Preserve homepage/Journal origin attribution into product actions | **COMPLETE — CODE** | Editorial/home placement metadata is carried in conversion event payloads without personal data. |
| Meet keyboard, focus, semantic heading, alt-text, reduced-motion, contrast, and touch-target requirements | **COMPLETE — CODE** | Accessible dialogs/accordions, semantic sections, image alt validation, motion guards, source/visual checks, and browser review are implemented. |
| Avoid horizontal overflow and unstable media layout | **COMPLETE — CODE** | Browser review covered mobile overflow; fixed aspect ratios/intrinsic logo and image dimensions prevent category/logo shifts. |
| Keep media within production budgets and loading policy | **COMPLETE — CODE** | Media/performance validators enforce governed hero/category assets, budgets, lazy loading, and deterministic visual inputs. |
| Real-device Nigerian mobile network and mid-range Android acceptance | **BLOCKED — PRODUCTION** | Browser/device emulation can catch responsive regressions, but the roadmap specifically requires a real device and network after deployment. |

### 0.7 Phases and exit conditions

| Phase / exit condition | Status | Evidence / remaining gate |
|---|---|---|
| Phase 1 — source inventory, route decisions, claims/media flags | **COMPLETE — CODE** | Audited inventory exists; approval/rights flags remain explicit rather than being treated as cleared. |
| Phase 2 — homepage redesign and responsive structure | **COMPLETE — CODE** | Required section order, category controls, hero lifecycle, responsive logo/footer, and mobile behavior are implemented. |
| Phase 3 — content migration and conversion paths | **COMPLETE — CODE** | Seven About pages and fourteen Journal records render with metadata, takeaways, links, and actions. |
| Phase 4 — SEO/AEO/GEO and redirects | **COMPLETE — CODE** | Technical generation, seed, 301 endpoint, schemas, and fail-closed indexing are implemented. |
| Phase 5 — QA and performance | **COMPLETE — CODE** | Type checks, API/storefront/migration suites, performance, SEO/release, visual baselines, build, and completed browser review supply the current evidence. |
| Phase 6 — preview approval, production deployment, live crawl, and post-launch monitoring | **BLOCKED — PRODUCTION** | Push/deployment were explicitly withheld. Production promotion, domain crawl, Search Console checks, payments, and monitoring must follow approval. |

### 0.8 Acceptance criteria

| Acceptance criterion | Status |
|---|---|
| Five approved category features, exact public order, alternating desktop layout, consistent mobile stack, useful image and CTA links | **COMPLETE — CODE** |
| Staff can safely edit category copy, active state, bounded media, mobile crop/source, motion mode/timing, and destinations | **COMPLETE — CODE** |
| New Arrivals, occasions, trust, fit/stylist, Journal, and final CTA follow the approved shopping sequence | **COMPLETE — CODE** |
| Stacked responsive logo, compact favicon, Montserrat weights, Cart wording, and disciplined footer | **COMPLETE — CODE** |
| Valuable legacy routes/content are preserved; obsolete utility/test pages are retired by explicit decisions | **COMPLETE — CODE** |
| Real 301 implementation, canonical metadata, sitemap/robots/schema generation, and fail-closed indexing | **COMPLETE — CODE** |
| All code-controlled validation passes | **COMPLETE — CODE** |
| Editorial/legal/media rights, legacy commerce mapping, live payment, production domain/Search Console, and real-device acceptance | **BLOCKED — CLIENT/PROVIDER / PRODUCTION** |

### 0.9 Client decisions

| Decision requested by the original roadmap | Status |
|---|---|
| Hero CTA wording: “Shop New Arrivals” | **COMPLETE — APPROVED** |
| Singular category labels, including customer-facing Dashiki | **COMPLETE — APPROVED** |
| Slow crossfade with static/reduced-motion fallback | **COMPLETE — APPROVED** |
| Original stacked SVG logo direction and responsive sizes | **COMPLETE — APPROVED DIRECTION / BLOCKED — CLIENT FINAL ASSET APPROVAL** |
| Comprehensive desktop footer and mobile accordion | **COMPLETE — APPROVED** |
| Retire obsolete WordPress/test/plugin/account utility pages | **COMPLETE — APPROVED** |
| Preserve archival Journal copy with a separate editorial approval gate | **COMPLETE — APPROVED** |

### 0.10 Honest completion boundary

The working implementation is now **100% complete for requirements controlled by this codebase**. It is **not launch-complete** until the external gates above are resolved. In particular, the roadmap must not describe provider mappings, content/media rights, live payments, production redirects, indexing, Search Console, or real Nigerian device/network acceptance as complete without their real evidence.

---

## 1. Executive summary

The new SOSO Africa site should keep its existing menu and full-screen hero, but the homepage immediately below the hero should become a clear category-shopping journey inspired by [Shop Africana](https://shopafricana.co/).

The approved direction should combine:

- **Shop Africana's product-first rhythm:** large category statements paired with strong fashion imagery and a direct route into each category.
- **Hobbs' brand and footer discipline:** a compact stacked wordmark, orderly navigation, and a comprehensive multi-column footer.
- **SOSO's own identity and content:** SOSO imagery, blue/gold brand assets as approved, Nigerian luxury menswear positioning, existing product categories, About content, journal articles, policies, and service information.
- **A conversion-first hierarchy:** every major homepage section should provide a clear shopping action rather than asking visitors to interpret an editorial concept before they can browse products.

This is an adaptation of useful patterns, not a visual clone. SOSO must remain recognizable as SOSO Africa.

---

## 2. What was reviewed

### 2.1 Current SOSO Africa build

The current build already has:

- A full-screen editorial hero.
- A compact top navigation.
- Product, collection, editorial, occasion, service, trust, and footer sections.
- Existing Boardroom, Wedding, and related occasion-led merchandising.
- A journal system and SEO foundations.
- Staff-editable platform content.

The current gaps against the new feedback are:

- The first substantial content after the hero is not yet the requested sequence of five large, alternating category stories.
- The header still says **Bag** rather than **Cart**.
- The hero's default call to action is still an “Explore…” message.
- The current top mark does not present **SOSO** over **AFRICA** in the requested Hobbs-style stacked lockup.
- Typography is not consistently Montserrat across all display and body text.
- The footer does not yet contain the full legacy About information architecture.
- The legacy article library has not yet been fully migrated, refreshed, redirected, and validated.

### 2.2 Shop Africana

Useful pattern to adopt:

- The homepage moves quickly from the hero into named merchandise categories.
- Each category is treated as a destination rather than a small generic tile.
- Category names, concise supporting copy, imagery, and a direct “Discover/Shop” action work together.
- The page creates a steady vertical shopping rhythm and reduces decision overload.

What SOSO should not copy:

- Africana's logo, wording, imagery, colors, exact spacing, or source code.
- Categories that are not part of SOSO's commercial focus.
- Account or wishlist features unless separately approved and implemented.

### 2.3 Hobbs

Useful pattern to adopt:

- A compact two-line brand lockup with the main brand name above the location/qualifier.
- A structured, high-utility footer with grouped links rather than an oversized About menu in the primary header.
- Clear separation between shopping, customer service, brand information, legal information, and newsletter/social content.

What SOSO should not copy:

- Hobbs' brand assets, exact visual system, wording, or women's-fashion information architecture.
- Country-selector or promotional behavior that is not required by SOSO.

### 2.4 Legacy shopsoso.co

The legacy site is the content source of record for:

- Existing product categories and product information.
- About SOSO pages and brand narrative.
- Journal/blog articles.
- Policies, reviews, partnerships, order-tracking information, and service content.
- Existing URLs that may already have search authority or external links.

Content must be inventoried and migrated intentionally. “Not visible in the new navigation” must never mean “deleted.”

---

## 3. Approved homepage structure

The homepage should use the following order.

### 3.1 Announcement and primary navigation

Keep the current menu concept, subject to responsive and accessibility checks.

Required changes:

- Replace **Bag** with **Cart** everywhere customers see it.
- Preserve search.
- Display the approved stacked **SOSO / AFRICA** lockup in the center.
- Ensure mobile navigation provides the same shopping destinations as desktop.

### 3.2 Hero

Keep the existing immersive hero concept and SOSO campaign media.

Default, no-discount state:

- Primary CTA text requested by the client: **Show New Arrival**
- Recommended conversion wording for final approval: **Shop New Arrivals**
- Destination: the live New Arrivals collection, not a general editorial page.

Discount or campaign state:

- The CTA may use campaign-specific wording only when a real, active promotion has been configured.
- When the promotion ends, the CTA must automatically or editorially return to the approved New Arrivals wording.
- The CTA must never lead to an empty collection or expired offer.

### 3.3 Five category feature sections

Immediately after the hero, show these five menswear categories:

1. **Kaftan**
2. **Agbada**
3. **Shirts**
4. **Dashiki**
5. **Two-Piece Sets**

Use the customer-facing spelling **Dashiki**. Preserve redirects and search relevance for the legacy `/danshiki/` spelling.

#### Desktop pattern

Each category receives a generous split-layout section:

- Category 1: name/copy/CTA on the left, dynamic image on the right.
- Category 2: dynamic image on the left, name/copy/CTA on the right.
- Continue alternating through all five categories.
- Keep section height and image ratios consistent enough to establish rhythm.
- Make the whole image and primary CTA lead to the correct category.

#### Mobile pattern

- Use a predictable stacked order: image, category name, concise value statement, CTA.
- Do not alternate reading order on mobile.
- Avoid oversized empty spaces.
- Keep the CTA visible without requiring excessive scrolling.

#### Content in each section

Each category should contain:

- Category name.
- One concise, benefit-led sentence.
- A direct CTA such as **Shop Kaftans**.
- One primary category image.
- Useful alternative text describing the garment rather than repeating the heading.

#### Definition of “dynamic image”

For approval, “dynamic” should mean that staff can assign and rotate a small approved image set for each category without changing code.

Recommended behavior:

- Use two to four optimized campaign/product images per category.
- Rotate images with a restrained crossfade or editorial slide.
- Pause rotation when the page is not visible.
- Respect reduced-motion preferences.
- Provide stable dimensions to prevent layout shifts.
- Do not autoplay aggressive zooming, flashing, or rapid carousels.
- Provide a static fallback if only one image is assigned.
- Do not randomly change the image during a shopper's interaction.

This delivers visual freshness without reducing readability, performance, or product recognition.

### 3.4 New arrivals

After the five category sections:

- Show a concise New Arrivals product rail or grid.
- Prioritize available and purchasable products.
- Link the heading and CTA to the full New Arrivals collection.
- Avoid repeating the same image already used in the immediately preceding category section.

### 3.5 Occasion and editorial sections

Retain the useful existing sections below the category-shopping journey, including:

- Boardroom.
- Wedding.
- Other approved occasion or campaign stories.

These sections become supporting discovery paths, not the first decision customers must make.

### 3.6 Trust, service, and reassurance

Keep concise reassurance near purchasing content:

- Made in Nigeria / Abuja atelier context where accurate.
- Craftsmanship and fabric quality.
- Delivery expectations.
- Alteration or measurement process.
- Stylist assistance.
- Returns/exchange policy summary.

Do not turn the homepage into a complete About page. Link deeper stories through the footer and relevant editorial modules.

### 3.7 Journal preview

- Retain a small homepage Journal preview below the commercial sections.
- Feature only current, useful articles.
- Each card must show a clear topic, useful title, image, and reading destination.
- The homepage should not display the entire article archive.

### 3.8 Comprehensive footer

Build a Hobbs-inspired multi-column footer using SOSO's own content and styling.

Recommended groups:

#### Shop

- New Arrivals
- Kaftans
- Agbada
- Shirts
- Dashiki
- Two-Piece Sets
- All Products

#### About SOSO Africa

- Our Story
- The Architect of the Modern Man
- The Client
- Craftsmanship
- Legacy & Vision
- The SOSO Foundation
- Partner With Us

#### Customer Care

- Contact / Speak With a Stylist
- Size and Measurement Guide
- Delivery
- Returns and Exchanges
- FAQs
- Track Order
- Payment Information

#### Journal

- Journal home
- Selected article topics or latest stories

#### Legal and preferences

- Privacy
- Terms
- Cookie/Privacy Choices
- Any required commerce and payment notices

#### Brand connection

- Newsletter signup, if approved and operational.
- Verified social profiles.
- Business contact information already approved for public display.

On mobile, footer groups should use accessible accordions. On desktop, they should appear as readable columns.

---

## 4. Brand lockup

### Requested structure

Create a wordmark with:

```text
SOSO
AFRICA
```

Direction:

- **SOSO** is the dominant line.
- **AFRICA** is smaller beneath it with controlled letter spacing.
- The relationship may be inspired by the hierarchy of “HOBBS / LONDON,” but it must use original SOSO artwork and proportions.
- The lockup must work over both light and dark hero media.

### Required deliverables

- Primary stacked SVG.
- Light/reversed SVG.
- Dark SVG.
- Compact mobile version if needed.
- Favicon/app icon derived from an approved SOSO symbol, not the full wordmark.
- Accessible alt text: **SOSO Africa**.

### Approval gate

The client must approve the final lockup before it replaces the existing mark across the header, footer, metadata, email templates, and social-sharing assets.

---

## 5. Typography

Use **Montserrat** across the entire customer-facing site.

This includes:

- Navigation.
- Buttons.
- Headings.
- Product names and prices.
- Body copy.
- Forms.
- Cart and checkout.
- Footer.
- Journal pages.
- Policy and About pages.
- Dialogs, notices, and error states.

Implementation requirements:

- Use a controlled set of Montserrat weights rather than loading every weight.
- Recommended starting set: 400, 500, 600, and 700.
- Use `font-display: swap` or an equivalent non-blocking strategy.
- Prefer a locally served, licensed webfont asset where practical.
- Remove old display-font overrides so no page silently falls back to another brand font.
- Validate Nigerian names, punctuation, currency symbols, and all required characters.

Montserrat should unify the site, but hierarchy must still come from size, weight, spacing, color, and layout.

---

## 6. Legacy content preservation plan

### 6.1 Non-negotiable rule

No valuable published content from `shopsoso.co` should be lost merely because it is not shown in the new primary menu.

### 6.2 Content inventory

Before migration, produce a content register containing:

- Existing URL.
- Content type.
- Page/article title.
- Publication and last-modified dates where available.
- Current indexability.
- Images and embedded media.
- Target URL on the new site.
- Migration status.
- Redirect status.
- SEO title and meta description.
- Structured-data type.
- Approval status.

### 6.3 Known About/brand pages to preserve

The legacy site currently exposes or references pages including:

- Our Story.
- The Architect of the Modern Man.
- The Client.
- Craftsmanship.
- Legacy & Vision.
- The SOSO Foundation.
- Partner With Us.

The final inventory must be generated from the live sitemap and navigation before launch so recently added pages are not missed.

These pages should remain complete destination pages. Moving their links to the footer does not mean collapsing all content into the footer itself.

### 6.4 Other legacy customer content

Review and preserve, merge, redirect, or intentionally retire:

- Reviews/testimonials.
- Track Order and carrier-tracking pages.
- Privacy and legal pages.
- Partner information.
- New Arrivals.
- Size/measurement content.
- Delivery, returns, payment, and support information.
- Existing product category landing pages.

Duplicate, test, checkout-success, obsolete plugin, or administrative pages should not be copied blindly. They should be classified and redirected or retired intentionally.

### 6.5 Redirect rules

- Every valuable legacy URL receives a permanent `301` redirect to the closest matching new URL when domains are switched.
- Do not redirect all missing URLs to the homepage.
- Preserve legacy spelling variants where they have traffic or links.
- Maintain query parameters only where still useful and safe.
- Build and test a redirect map before opening search indexing on the new domain.

---

## 7. Journal migration and SEO/AEO/GEO revamp

### 7.1 Known legacy article set

The legacy sitemap currently lists articles covering:

- The Koles Collection and Abuja menswear.
- Modern kaftan styles for men in Abuja.
- Dashiki for the modern African man.
- How the Abuja man is redefining native wear.
- The grey Italian wool kaftan.
- Abuja as a modern menswear hub.
- The SOSO Spring/Summer African modern kaftan collection.
- Modern kaftans beyond traditional wear.
- Modern men's two-piece sets.
- The rise of minimalist African luxury fashion.
- Styling black traditional outfits for modern occasions.

The live sitemap remains the final source for article count at migration time.

### 7.2 Preservation before rewriting

For every article:

- Save the original URL, title, body, publication date, author, images, captions, and metadata.
- Preserve legitimate publication dates.
- Preserve the article's core meaning, brand claims, and useful first-hand information.
- Do not overwrite the original record until the migrated page is reviewed.
- Do not fabricate awards, customer results, materials, locations, prices, delivery promises, or expertise.

### 7.3 SEO improvements

Each article should receive:

- A unique search-intent-led title.
- One clear H1 and logical H2/H3 structure.
- A concise meta title and description.
- A short, readable URL.
- Internal links to relevant categories, products, About pages, and related articles.
- Descriptive image filenames and alt text.
- Correct canonical URL.
- Open Graph and social metadata.
- `Article` or `BlogPosting` structured data.
- Breadcrumb structured data.
- Author, publisher, published date, and updated date where truthful.
- An XML sitemap entry.

Keyword work should support natural reading. Avoid repetitive “Abuja,” “African fashion,” or product terms merely to increase keyword density.

### 7.4 AEO improvements

Answer Engine Optimization should make key information easy to quote and understand:

- Add a concise answer or takeaway near the beginning.
- Use descriptive question-led subheadings where they match genuine customer questions.
- Add compact FAQ sections only when the article genuinely answers those questions.
- Use short definitions and comparison tables where useful.
- State sizing, styling, fabric, occasion, and care guidance clearly.
- Connect claims to SOSO's real experience and product information.
- Add FAQ structured data only when the visible FAQ qualifies under current search-engine rules.

### 7.5 GEO improvements

Generative Engine Optimization should improve clarity, entity consistency, and citation-worthiness:

- Consistently identify the brand as **SOSO Africa**.
- Clearly describe what SOSO makes, where it operates, and which customers or occasions it serves, using verified facts.
- Include useful first-party details such as design intent, craftsmanship process, garment structure, fabric choice, styling rationale, and atelier expertise.
- Use direct, factual sentences that can stand alone when quoted.
- Keep author and editorial-review information transparent.
- Link related entities and concepts consistently.
- Keep important facts in page text, not only in images.

GEO is not permission to produce generic AI-expanded copy. Original experience, accurate facts, and useful specificity are the advantage.

### 7.6 Article conversion pattern

Each refreshed article should include contextually relevant, restrained commercial actions:

- Shop the relevant category.
- View a relevant product or collection.
- Consult the measurement guide.
- Speak with a stylist.

Do not interrupt every paragraph with a sales prompt.

---

## 8. Content and commerce model

The homepage category sections should be editable without code deployment.

Each category feature needs fields for:

- Category name.
- Category slug/destination.
- Short description.
- CTA label.
- Desktop images.
- Mobile images or crop controls.
- Image alt text.
- Display order.
- Active/inactive state.
- Rotation timing or static mode.

Validation must prevent:

- Missing destinations.
- Empty active categories.
- Unsupported media.
- Images without useful alt text.
- Invalid product/category slugs.
- Duplicate display order.

If a category has no purchasable products, it should not lead shoppers into an empty page. Staff must either assign products, hide the section, or link it to an approved enquiry experience.

---

## 9. Conversion requirements

### 9.1 Primary actions

- Hero: **Show New Arrival** as requested, with **Shop New Arrivals** recommended for approval.
- Category sections: **Shop [Category]**.
- Product cards: direct product details and clear purchase availability.
- Occasion sections: shop the relevant collection or speak with a stylist.

### 9.2 Reduce friction

- Do not require an account before browsing or purchasing.
- Keep category destinations reachable in one action from the homepage.
- Keep the cart accessible in the header.
- Preserve entered cart and checkout information where technically and legally appropriate.
- Show delivery, measurements, and payment reassurance before checkout.

### 9.3 Measurement

Measure at minimum:

- Hero CTA clicks.
- Category-section impressions and clicks.
- Product views from each homepage category.
- Add-to-cart rate.
- Checkout starts.
- Successful paid orders.
- Stylist enquiries.
- Journal-to-category/product clicks.

Analytics must continue to follow the approved regional consent rules.

---

## 10. Accessibility, performance, and responsive quality

### Accessibility

- Maintain visible keyboard focus.
- Keep correct heading order.
- Ensure all CTAs have descriptive names.
- Use meaningful alt text.
- Meet contrast requirements over imagery.
- Do not place essential information only inside animation.
- Respect reduced-motion settings.
- Ensure mobile footer accordions expose correct expanded state.

### Performance

- Do not load every rotating category image at initial page load.
- Prioritize only the hero and first visible category media.
- Lazy-load later category images.
- Serve correctly sized AVIF/WebP variants with safe fallbacks.
- Reserve image dimensions to prevent content jumping.
- Keep Montserrat font files and weights lean.
- Test on realistic Nigerian mobile connections and mid-range devices.

### Responsive validation

Approve at:

- Small mobile.
- Large mobile.
- Tablet.
- Standard laptop.
- Large desktop.

The alternating desktop composition must become a simple, consistent reading order on mobile.

---

## 11. Delivery phases

### Phase 1 — Approval and inventory

- Confirm the exact five category names and ordering.
- Confirm **Show New Arrival** versus recommended **Shop New Arrivals**.
- Confirm what “dynamic” means and approve the restrained rotation behavior.
- Inventory all legacy pages, articles, categories, products, media, policies, and URLs.
- Approve the footer information architecture.
- Obtain approval for the stacked SOSO Africa lockup.

**Exit condition:** Signed-off content map, redirect map draft, logo direction, and homepage wireframe.

### Phase 2 — Foundation

- Implement Montserrat globally.
- Create and install the approved responsive logo assets.
- Rename Bag to Cart across navigation, drawer, checkout, accessibility labels, and content settings.
- Update the hero CTA's default and promotional behavior.
- Add editable category-feature content fields and media validation.

**Exit condition:** Header, typography, hero CTA, and content model pass desktop/mobile review.

### Phase 3 — Homepage conversion rebuild

- Build the five alternating category features.
- Connect every feature to a valid category.
- Add responsive dynamic-image behavior.
- Reorder New Arrivals, occasion/editorial, trust, Journal preview, and footer sections.
- Preserve Boardroom, Wedding, and other approved existing content below the new product-first journey.

**Exit condition:** All five category paths work, no empty destinations exist, and the homepage passes visual, accessibility, performance, and analytics checks.

### Phase 4 — About and service migration

- Migrate all approved legacy About and customer-service content.
- Build the comprehensive footer.
- Preserve destination pages while moving their navigation links to the footer.
- Resolve duplicate or obsolete legacy pages.

**Exit condition:** Content inventory shows no unexplained omissions.

### Phase 5 — Journal migration and optimization

- Import all legacy articles and media.
- Preserve original records and publication data.
- Revamp each article for SEO, AEO, GEO, internal linking, and conversion.
- Add metadata, structured data, canonical URLs, breadcrumbs, and sitemap entries.
- Complete editorial review before publication.

**Exit condition:** Every indexed legacy article has an approved new destination and redirect.

### Phase 6 — Release validation

- Test every menu, footer, category, article, product, cart, checkout, and policy link.
- Validate responsive layouts and animation preferences.
- Validate SEO metadata and structured data.
- Crawl legacy and new URL lists to verify redirects and detect orphan pages.
- Validate analytics and consent behavior.
- Run production build and real-browser tests.
- Deploy to a preview for client approval.
- Promote only the approved commit to production.

**Exit condition:** Client approval, clean crawl, passing release checks, and verified production deployment.

---

## 12. Acceptance criteria

The work is complete only when:

1. The menu and hero remain, with the approved SOSO treatment.
2. The first major homepage content after the hero is the five-category sequence.
3. The categories appear in the approved order and alternate text/image positions on desktop.
4. Mobile uses a consistent, readable stacked order.
5. Every category section uses valid SOSO media and opens the correct live category.
6. Dynamic images are editable, performant, accessible, and stable.
7. The stacked **SOSO / AFRICA** lockup is approved and consistently applied.
8. All customer-facing typography uses Montserrat.
9. Every visible instance of **Bag** has become **Cart**, including accessibility text.
10. The no-discount hero CTA uses the approved New Arrivals wording and destination.
11. Boardroom, Wedding, and other approved existing sections remain below the new shopping sequence.
12. The footer contains the approved full About and customer-service navigation.
13. No valuable legacy About page or article is omitted without an explicit decision.
14. Every migrated legacy URL has a valid destination and redirect decision.
15. All legacy articles are preserved, editorially reviewed, and enhanced without fabricated claims.
16. SEO, AEO, GEO, canonical, sitemap, breadcrumb, and structured-data checks pass.
17. Cart, checkout, payment, analytics, and consent behavior remain functional.
18. Mobile, tablet, desktop, accessibility, performance, and production smoke tests pass.

---

## 13. Client decisions required before implementation

Please approve or revise:

1. **Category order:** Kaftan, Agbada, Shirts, Dashiki, Two-Piece Sets.
2. **Category naming:** singular section names versus plural shop labels.
3. **Hero CTA:** exact requested **Show New Arrival** or recommended **Shop New Arrivals**.
4. **Dynamic image behavior:** restrained automatic crossfade, manual carousel, or staff-selected static image.
5. **Logo:** approval to create the original stacked **SOSO / AFRICA** lockup.
6. **Footer groups:** Shop, About SOSO Africa, Customer Care, Journal, Legal, and Brand Connection.
7. **Legacy content:** confirmation that obsolete test/plugin pages may be retired while all valuable public content is preserved.
8. **Article workflow:** approval to refresh articles individually and retain originals until each replacement is reviewed.

---

## 14. Recommended approval

Approve the roadmap with the following conversion-safe interpretations:

- Use **Shop New Arrivals** rather than “Show New Arrival.”
- Use a slow, accessible crossfade between staff-approved category images.
- Keep complete About pages as real pages, while moving their navigation links into a Hobbs-style footer.
- Preserve all valuable legacy content through an inventory and redirect map rather than blindly copying obsolete WordPress utility pages.
- Put the five product categories ahead of Boardroom, Wedding, Journal, and brand storytelling so shopping begins immediately after the hero.
