# SOSO Africa — Full Commerce, Growth, Trust & Analytics Build Blueprint

**Status:** Product and engineering blueprint  
**Audience:** SOSO founders, atelier/operations team, growth team, designers, engineers, legal/privacy reviewers  
**Primary outcome:** Turn the premium SOSO storefront into a measurable, trustworthy, payment-first made-to-order commerce system without weakening the fashion-house experience.

> This document defines what should be built next. It is not a claim that every external service, payment capability, legal policy, or JusticeSure API is already available.

---

## 1. Non-negotiable business model

SOSO is a bespoke and made-to-order fashion house. Customers are not choosing from a finite stock shelf.

The intended customer sequence is:

1. Discover a piece.
2. Select a size or Custom.
3. Ask a stylist only if they have a question.
4. Pay securely.
5. SOSO/JusticeSure records the paid order.
6. The atelier confirms making details, finish direction, measurements, timing, and delivery next steps.
7. The garment is made and fulfilled.

The storefront must not put an atelier-confirmation gate in front of payment for a normal purchase. The atelier follow-up is an operational step after payment.

### Conversion principles

- The primary CTA must always move a ready shopper toward payment.
- Stylist help, WhatsApp, sizing advice, and bespoke questions are secondary paths.
- Never manufacture scarcity, stock warnings, review totals, delivery promises, or guarantees that SOSO cannot substantiate.
- Every paid order must have a clear post-payment follow-up path.
- Trust information must appear near the purchase decision and remain available in the footer.
- “Made to order” must explain what happens next, not create uncertainty.

### Experience guardrails: protect the fashion-house vision

The roadmap is intentionally broad because it covers the invisible operating system behind SOSO. It must not turn the customer-facing site into a dashboard, policy catalogue, or crowded marketplace.

Use these guardrails for every storefront change:

- **One dominant action per view:** On product pages, payment is primary; stylist help is secondary.
- **Above the fold stays quiet:** Show the garment, name, price, size, one made-to-order sentence, and the buy CTA. Do not put analytics, long policy copy, or a multi-step explainer in the hero.
- **Trust is layered, not dumped:** Put three short confidence cues near the CTA; move full policies, detailed FAQs, and legal language into expandable sections and the footer.
- **Progressive disclosure:** Show only what a shopper needs at the current decision. Size guidance, delivery detail, care, returns, and production information can open on demand.
- **No operational UI on the storefront:** Admin analytics, retargeting controls, webhook states, and internal production workflows must never appear in the customer-facing design.
- **No interruption before intent:** Avoid newsletter popups, chat overlays, cookie prompts that cover the product, or retargeting prompts before the shopper can see and understand the piece. Consent controls must remain legally valid but visually restrained.
- **Mobile-first purchase speed:** A shopper should be able to go from product view to payment in a few deliberate taps, without scrolling through the entire page or completing an unnecessary questionnaire.
- **Editorial restraint:** The blog should build authority and discovery, not compete with the collection. Link to relevant pieces naturally rather than filling every page with article cards.
- **Performance is part of luxury:** Third-party analytics and pixels must never delay the product image, price, or payment CTA.
- **Measure quietly:** Instrument behavior in the background; do not make the customer feel observed.

#### Customer-facing content budget

For the initial product purchase block, target:

1. Product name and price
2. One sentence explaining made-to-order and post-payment atelier follow-up
3. Size/Custom selector
4. Primary “Add to bag” action
5. One compact trust row
6. Optional “Ask a stylist” link

Everything else should be available below the fold, in an accordion, in the footer, or after the shopper asks for it. This is a design constraint, not a reason to omit important information.

---

## 1.1 Highest-upside enhancements

These additions can take SOSO beyond a polished storefront without adding noise to the primary purchase path. They should be prioritized by measured impact, not all shipped at once.

### A. Atelier confidence layer

After payment, give the customer a refined “Your piece is now with the atelier” experience:

- A personal order reference
- A simple three-to-five-stage progress timeline
- The next action and who owns it
- A secure way to submit measurements, finish preferences, or clarification
- WhatsApp/email updates only with customer permission

This converts post-payment uncertainty into a premium service moment.

### B. Smart fit concierge

Keep the product page simple, but let shoppers open a lightweight fit assistant:

- Height, weight, chest, preferred fit, and occasion
- Recommended size with a confidence explanation
- Custom recommendation when measurements are outside standard guidance
- Human stylist handoff when confidence is low
- No forced account creation before purchase

The assistant should improve confidence without turning sizing into a pre-payment approval process.

### C. Purchase confidence strip

Test a compact, consistent strip near the buy CTA:

```text
Secure payment  ·  Made for your order  ·  Atelier follows up next
```

This should replace paragraphs of reassurance and be tested against the current design.

### D. Concierge recovery, not aggressive retargeting

For shoppers who abandon:

- Preserve their bag where appropriate
- Offer a discreet return-to-bag link
- Show the exact piece they viewed
- Give an optional stylist question route
- Exclude paid customers from acquisition reminders
- Avoid repeated popups and high-frequency ads

The best recovery experience should feel like service, not pursuit.

### E. Editorial commerce

Connect Journal articles to products with one or two relevant recommendations:

- “The Abuja wedding guest edit”
- “How a kaftan should drape”
- “What to wear to an Owambe”
- “A modern agbada, explained”

Track assisted conversions, not just last-click sales, so useful editorial content is valued even when it does not contain the final CTA.

### F. Premium service signals

Only when SOSO can substantiate them, add:

- Atelier location and story
- Named stylist or atelier contact
- Fabric and finishing provenance
- Care instructions
- Verified customer imagery
- Press and collaborations
- Private appointment request
- Gift/order note support

Authenticity is more valuable than a long list of generic trust badges.

### G. Experimentation system

Build a small, disciplined experiment loop:

- One primary hypothesis per experiment
- One primary conversion metric
- Guardrails for payment failure, refunds, support load, and page speed
- Mobile and desktop results separately
- Minimum sample and stopping rules
- Experiment log in the admin portal

Start with high-value questions:

- “Proceed to payment” versus “Checkout”
- Trust strip placement
- Size guide placement
- One-sentence post-payment explanation
- Stylist CTA wording
- Product image order

Do not run experiments that make the site feel noisy just to increase clicks.

---

## 2. JusticeSure and payment architecture

### 2.1 Can payment go through JusticeSure?

**Yes, if JusticeSure’s headless API includes a payment or checkout capability.** The preferred implementation is:

```text
SOSO storefront
    → SOSO server-side commerce adapter
        → JusticeSure headless API
            → JusticeSure payment flow/provider
```

The storefront should not call JusticeSure directly with secret credentials.

However, SOSO must not assume that the JusticeSure API handles payments merely because it handles products, orders, or fulfilment. The JusticeSure contract must explicitly confirm:

- Payment-session creation or hosted checkout creation
- Supported payment methods and currencies
- Whether JusticeSure owns the payment provider relationship
- Payment status values and transitions
- Redirect/return URLs
- Webhook signing and retry behavior
- Refund and cancellation behavior
- Order creation timing: before payment, after payment, or both
- Idempotency support
- Customer and order metadata fields
- Test/sandbox environment
- Rate limits and authentication

If JusticeSure does not own payments, the adapter should use a separate payment provider while still sending the paid order to JusticeSure after verified payment.

### 2.2 Required server-side flow

The browser submits a checkout request to SOSO’s API:

```text
POST /api/checkout/session
  → validate catalog item, size, price, quantity, and customer fields
  → create an idempotency key
  → create pending order/payment intent
  → call JusticeSure payment API or configured payment provider
  → return hosted checkout URL
```

After payment:

```text
provider/JusticeSure webhook
  → verify signature
  → process idempotently
  → mark payment as paid
  → persist the order and customer record
  → send order to JusticeSure operations if not already created
  → trigger atelier follow-up workflow
```

The browser return page must never be the source of truth for payment success. Only a verified server-side webhook or provider API lookup can mark an order paid.

### 2.3 Commerce contract to obtain from JusticeSure

Before enabling `VITE_COMMERCE_MODE=justicesure-headless`, obtain written documentation and test credentials for:

- Product listing and product detail
- Variants, sizes, Custom/made-to-measure options
- Price and currency
- Material, colour, finish, embroidery, and other production options
- Customer creation/update
- Pending order creation
- Checkout/payment-session creation
- Payment status retrieval
- Paid-order creation
- Order status updates
- Atelier/production status
- Delivery/fulfilment status
- Cancellation and refund
- Webhooks
- Authentication and permissions
- Error format
- Retry/idempotency behavior
- Sandbox data and test cards/payment methods

No endpoint, request body, authentication header, price, or order behavior should be guessed.

### 2.4 Payment acceptance criteria

- A shopper can reach a secure payment page without waiting for manual atelier approval.
- No card details are stored in the SOSO application.
- Prices are calculated and validated server-side.
- Webhooks are signed, verified, replay-safe, and idempotent.
- A duplicate browser click cannot create duplicate paid orders.
- Payment failure returns the shopper to a clear retry state.
- Successful payment produces a durable order ID and confirmation.
- Atelier follow-up status is visible to staff and eventually to the customer.
- Refund and cancellation states are explicit.

---

## 3. Storefront customer experience

### 3.1 Product pages

Every product page should include, in or directly below the primary buy block:

- Product name
- Current price and currency
- Clear size selector
- Custom/made-to-measure option where supported
- Fit guide with measurements
- “Add to bag” CTA
- “Ask a stylist” secondary CTA
- Made-to-order explanation
- What happens after payment
- Estimated production timing language only when authoritative
- Delivery options and location guidance
- Payment reassurance
- Returns/refund treatment for made-to-order items
- Fabric, care, finishing, and composition information where available
- High-quality product imagery, alt text, and image loading optimization

### 3.2 Cart and checkout

The normal purchase path should be:

```text
Add to bag → Proceed to payment → Pay now → Payment result → Atelier follow-up
```

Optional alternatives:

```text
Ask a stylist → WhatsApp/contact enquiry → return to checkout when ready
Size guide → choose size → return to checkout
```

The cart must not say “confirm making details” as its primary CTA. It should say “Proceed to payment.”

Checkout must:

- Collect only information needed to initiate payment and fulfil the order
- Keep optional delivery notes clearly optional
- Display the exact order total
- Explain payment first and atelier confirmation second
- Link to privacy, terms, delivery, returns, and refunds
- Provide a secondary stylist contact route without making it a blocker
- Support retry after payment failure
- Preserve a recoverable cart when the shopper leaves and returns

### 3.3 Post-payment experience

Create a real post-payment order status experience:

- Payment received
- Order reference
- Item, size, quantity, amount, and customer details summary
- “Atelier confirmation next” explanation
- Expected contact channel
- Production status
- Delivery status
- Support contact
- Refund/cancellation request route

Do not show “order complete” if payment is only pending.

---

## 4. Admin portal

Build a protected SOSO admin portal, preferably under a separate `/admin` route or admin artifact backed by the shared API server.

### 4.1 Admin roles

At minimum:

- **Owner:** full business, financial, content, analytics, and staff access
- **Operations/atelier:** paid orders, customer details needed for fulfilment, production status, measurements, notes
- **Marketing:** analytics, campaigns, content, SEO, blog, audiences; no payment credentials
- **Support/stylist:** customer enquiries, sizing, order lookup; restricted financial access
- **Analyst/read-only:** dashboards and exports without mutation privileges

Use real authentication and role-based authorization. Do not protect the portal with an obscure URL alone.

### 4.2 Admin dashboard home

The first screen should show:

- Revenue and paid orders for today, seven days, 30 days, and selected date range
- Unique visitors and sessions
- Product views
- Add-to-bag rate
- Checkout-start rate
- Payment-start rate
- Payment-success rate
- Cart abandonment
- Checkout abandonment
- Average time from first visit to payment
- New versus returning visitors
- Top landing pages
- Top products
- Top traffic sources/campaigns
- Device and location breakdowns
- Open stylist enquiries
- Orders awaiting atelier confirmation
- Orders in production
- Orders awaiting delivery
- Refunds, cancellations, and payment failures

Every metric needs:

- Date range
- Comparison period
- Definition tooltip
- Data freshness timestamp
- Export option where appropriate

### 4.3 Visitor and journey analytics

Track anonymous and authenticated journeys while respecting consent and data minimization.

Required views:

- Live/near-real-time visitor count
- Acquisition source, medium, campaign, referrer, landing page
- Visitor → product view → add to bag → checkout → payment funnel
- Page-to-page path exploration
- Product-to-product navigation
- Entry and exit pages
- Scroll depth and CTA interaction
- Device, browser, viewport, country, and region
- New versus returning visitors
- Direct, search, social, referral, WhatsApp, and campaign traffic
- Conversion by landing page
- Conversion by product
- Conversion by device
- Conversion by campaign
- Conversion by consent state where legally permissible

Do not identify a person from an anonymous analytics ID. Once a shopper provides contact details, keep analytics identity and customer/order identity separate unless the person has provided appropriate consent and the privacy notice covers the linkage.

### 4.4 Checkout and payment analytics

Measure:

- Checkout started
- Checkout form viewed
- Required field validation failures
- Checkout form completed
- Payment button clicked
- Secure payment session created
- Payment redirect reached
- Payment succeeded
- Payment failed
- Payment abandoned
- Payment timeout
- Duplicate-submit prevention
- Order confirmation viewed
- Atelier follow-up status

The dashboard must distinguish:

- No checkout started
- Checkout started but form not completed
- Payment session never created
- Payment session created but not paid
- Payment failed
- Payment paid but confirmation page not visited

This prevents the team from calling all lost customers “checkout abandonment.”

### 4.5 Time spent and completion time

Track:

- Active time on page, not just browser tab lifetime
- Time from landing to first product view
- Time from product view to add to bag
- Time from add to bag to checkout
- Time from checkout start to payment start
- Time from payment start to success
- Time from paid order to atelier confirmation
- Time from atelier confirmation to production complete

Implementation rules:

- Use `visibilitychange`, focus/blur, and bounded heartbeat events.
- Stop counting when the tab is hidden or idle beyond a documented threshold.
- Do not claim exact attention from an open tab.
- Report median, p75, and p90, not only averages.
- Exclude obvious bots and internal staff traffic.

### 4.6 Analytics event specification

Use a versioned event schema with:

- `event_name`
- `event_version`
- `event_id`
- `occurred_at`
- `anonymous_id`
- `session_id`
- `consent_state`
- `page_path`
- `referrer`
- `utm_source`
- `utm_medium`
- `utm_campaign`
- `device_class`
- `country`
- `product_slug` where relevant
- `order_id` only on allowed commerce events
- `properties`

Core event names:

```text
page_view
session_started
product_viewed
product_image_viewed
size_guide_opened
size_selected
stylist_inquiry_started
stylist_inquiry_completed
add_to_bag
bag_opened
checkout_started
checkout_field_error
checkout_form_completed
payment_clicked
payment_session_created
payment_redirected
payment_succeeded
payment_failed
order_confirmation_viewed
atelier_confirmation_recorded
production_started
production_completed
delivery_dispatched
delivery_completed
consent_banner_viewed
consent_updated
marketing_opt_out
blog_article_viewed
faq_expanded
scroll_depth_reached
cta_clicked
```

### 4.7 Analytics data quality

Build automated checks for:

- Missing event IDs
- Duplicate events
- Impossible event order
- Payment success without a verified payment
- Orders with no source attribution where attribution was expected
- Sudden event-volume spikes
- Broken page paths
- Bot traffic contamination
- Time values outside sane ranges
- Consent-state violations

Admin users should see a small “data quality” status indicator rather than silently trusting broken numbers.

### 4.8 Exports and privacy

Provide:

- CSV export for aggregated reports
- Order export with role restrictions
- Campaign performance export
- Content/SEO performance export
- Data deletion/access request workflow
- Retention policy
- Audit log for admin access and exports

Never export payment card data, secret credentials, raw ad identifiers, or unnecessary personal information.

---

## 5. Cookies, consent, analytics, and retargeting

### 5.1 Important legal/product correction

Do not implement a blanket rule that silently accepts cookies and loads ad pixels for every non-GDPR country. Privacy obligations are not limited to GDPR countries; Nigeria, the United Kingdom, several US states, and other jurisdictions can impose consent, disclosure, opt-out, or marketing requirements.

The correct system is a **region-aware consent manager**:

- Essential cookies may load because the site cannot function without them.
- Analytics cookies should load only according to the user’s valid consent or a documented legal basis.
- Marketing/ad pixels should load only when the applicable jurisdiction and consent configuration allow it.
- When the legal basis is uncertain, default to no marketing tracking.
- The banner must be configurable by jurisdiction and reviewed by SOSO’s legal adviser.
- “Reject all” and “Manage preferences” must be as usable as “Accept.”
- Never hide the privacy choice in the footer only.
- Consent must be logged with timestamp, policy/version, region signal, categories, and source.
- Users must be able to change their choice later.

Geolocation is imperfect. Do not treat an IP-derived country as definitive proof of legal status.

### 5.2 Consent categories

At minimum:

- **Strictly necessary:** session, cart, security, checkout state, consent preference
- **Preferences:** saved settings and display preferences
- **Analytics:** traffic and product journey measurement
- **Marketing:** retargeting pixels, advertising measurement, campaign audiences

### 5.3 Retargeting functions

After the appropriate consent and legal review, support:

- Product-view audience
- Add-to-bag but no checkout audience
- Checkout-started but no payment audience
- Payment-failed recovery audience
- Returning visitor audience
- Blog/content reader audience
- Campaign landing-page audience
- Customer exclusion audience after verified payment
- Atelier-confirmed customer audience for appropriate post-purchase campaigns

Guardrails:

- Exclude paid customers from acquisition retargeting by default.
- Apply frequency caps.
- Use short, documented audience retention windows.
- Do not upload customer lists without the required notices, lawful basis, and provider agreements.
- Do not send sensitive attributes to ad platforms.
- Keep campaign pixels behind the consent manager where required.
- Record which consent state allowed each marketing event.
- Provide a clear opt-out and honour platform deletion requests.

### 5.4 Technical approach

Use a consent-aware tag manager or a small first-party event layer:

```text
consent decision
    → analytics manager
        → first-party analytics endpoint
        → approved third-party analytics/pixel only when allowed
```

Prefer first-party, server-side event collection for core funnel metrics. Third-party pixels should be optional enrichment, not the source of truth for orders.

---

## 6. SEO implementation

### 6.1 Technical SEO

Build and maintain:

- One canonical URL per indexable page
- Correct `title` and meta description
- Open Graph and social cards
- XML sitemap with products, collections, blog posts, and policy pages
- `robots.txt` with a real sitemap URL
- Clean product, collection, blog, and policy slugs
- 404 handling
- Redirect management
- `hreflang` only if multiple language/locale versions exist
- Fast mobile-first rendering
- Core Web Vitals monitoring
- Image dimensions, compression, modern formats, and descriptive alt text
- No duplicate query-parameter indexation
- Structured internal linking
- Search-console verification and monitoring

### 6.2 Structured data

Implement validated JSON-LD for:

- Organization
- LocalBusiness or ClothingStore where accurate
- WebSite and SearchAction if a site search exists
- Product
- Offer
- BreadcrumbList
- Article
- FAQPage only for genuinely visible FAQ content
- Review/AggregateRating only when real and policy-compliant
- Event only when SOSO actually hosts an event

Do not use fake reviews, fake ratings, fake prices, or unsupported availability.

### 6.3 Commercial search pages

Create useful, indexable collection pages for:

- Abuja menswear
- Nigerian kaftans
- Nigerian agbadas
- Bespoke agbadas
- Premium men’s kaftans
- African wedding attire for men
- Made-to-measure African menswear
- Abuja occasion wear
- Modern dashikis
- Formal Nigerian shirts

Each page must have original copy, real product links, fit guidance, delivery context, and a clear purchase path. Do not create thin keyword pages.

---

## 7. AEO and GEO

### 7.1 Answer Engine Optimization

Create content that directly answers real questions:

- How does SOSO made-to-order work?
- What happens after I pay?
- How do I choose a kaftan size?
- Can I order a Custom size?
- How long does production take?
- Does SOSO deliver outside Abuja/Nigeria?
- What is the refund policy for made-to-order garments?
- Can I change my order after payment?
- How should SOSO garments be cared for?
- What should I wear to a Nigerian wedding?

Use:

- Short answer blocks near the top
- Clear headings
- FAQ sections
- Step-by-step explanations
- Definitions of local terms
- Authoritative dates and policy update dates
- Internal links to products and policies
- Structured data that matches visible content

### 7.2 Generative Engine Optimization

Make SOSO easy to understand and cite:

- Consistent brand/about information
- Clear Abuja/Nigeria location information
- Founder/atelier story where the brand approves publishing it
- Material, craftsmanship, sizing, care, delivery, and policy facts
- Author bios and editorial review standards
- Original photography with captions and alt text
- Expert quotes and sourcing where available
- Press, partnerships, and credible external references
- Stable URLs and permanent article slugs
- No contradictory claims across pages, social profiles, and business listings

Never optimize by publishing unsupported claims or generated filler.

---

## 8. Blog and editorial system

Build a lightweight blog in the storefront and admin portal. Add “Journal” or “Blog” to the footer.

### 8.1 Required blog functionality

- Draft, scheduled, published, and archived states
- Author
- Category
- Tags
- Slug
- Excerpt
- Hero image and alt text
- SEO title and description
- Canonical URL
- Related products
- Related articles
- Reading time
- Updated date
- Preview mode
- Social image
- Sitemap inclusion
- Article JSON-LD
- Admin revision history

### 8.2 Editorial pillars

- The SOSO atelier and Abuja craft
- How to wear kaftans and agbadas
- Nigerian wedding and occasion dressing
- Fit, measurements, and made-to-measure guidance
- Fabric, care, and finishing
- Modern African menswear
- Style guides by occasion
- Customer preparation and ordering guide

Editorial content must lead naturally to products without becoming thin sales copy.

---

## 9. Trust, policies, and footer

The footer should provide a visible, organized trust layer:

### Customer service

- Contact SOSO
- WhatsApp/stylist support
- Size guide
- Delivery information
- Order tracking
- FAQs

### Policies

- Refund policy
- Returns and exchanges policy
- Cancellation policy
- Made-to-order policy
- Delivery and shipping policy
- Payment policy
- Privacy policy
- Cookie policy
- Terms and conditions
- Bespoke/custom measurement policy
- Product care policy

### Brand

- About SOSO
- The atelier
- Journal/Blog
- Press or features when verified
- Instagram/social links

### Policy requirements

Policies must be based on SOSO’s actual operations and reviewed by qualified counsel. They must state:

- When payment is taken
- What “made to order” means
- When the atelier contacts the customer
- Expected production and delivery ranges, only when verified
- What can and cannot be changed after payment
- Treatment of Custom or personalized garments
- Defect/damage process
- Return eligibility and exclusions
- Refund timing and payment-method limitations
- Customer support channels
- Privacy rights and contact method
- Cookie categories and preference management

Do not publish invented delivery windows, refund promises, guarantees, or legal rights.

Trust modules should also appear near purchase:

- Secure payment provider mark once actually configured
- Clear payment and refund summary
- Real customer reviews when available
- Verified customer imagery with permission
- Atelier/contact identity
- Business location and support details
- Clear post-payment process

---

## 10. Admin content and policy management

The admin portal should allow authorized staff to manage:

- Products and variants
- Prices and currency
- Sizes and measurement charts
- Materials and finish options
- Product imagery and alt text
- Production messaging
- Delivery regions
- Policy pages
- FAQ content
- Blog content
- Homepage/editorial blocks
- SEO metadata
- Redirects
- Structured-data fields
- Footer navigation
- Contact destinations
- Consent categories and banner copy

All content changes should have:

- Draft/publish state
- Author
- Updated timestamp
- Revision history
- Preview
- Audit log

---

## 11. Data and backend foundation

Use the API server as the trusted boundary for commerce, analytics, and admin operations.

Recommended domain areas:

```text
auth/
admin/
catalog/
checkout/
payments/
orders/
production/
fulfilment/
analytics/
consent/
content/
policies/
```

Persist, at minimum:

- Customers
- Anonymous analytics identities
- Sessions
- Consent decisions
- Events
- Products and variants
- Carts or checkout intents
- Orders
- Payment attempts
- Webhook deliveries
- Atelier statuses
- Stylist enquiries
- Blog articles
- Policy versions
- Admin users and roles
- Audit entries

Security requirements:

- Server-side authorization on every admin/API mutation
- Secrets only in workspace/deployment secret storage
- Validation at every API boundary
- Rate limiting on public event and checkout endpoints
- CSRF protection where cookie authentication is used
- Webhook signature verification
- PII minimization
- Encryption in transit and at rest through supported infrastructure
- Audit logging for sensitive operations
- Export/delete workflow for privacy requests
- No payment-card storage

---

## 12. Performance and reliability

Target:

- Fast first render on mobile
- Optimized images and fonts
- Minimal third-party scripts
- Lazy-loaded below-the-fold media
- No blocking ad pixels
- Resilient analytics that cannot break checkout
- Error monitoring for storefront, API, payment, and webhooks
- Uptime and webhook retry alerts
- Backups and restore procedure
- Staging/sandbox environment before production

Analytics, consent, or retargeting failures must never prevent a shopper from viewing products or paying.

---

## 13. Reporting cadence

The admin portal should support saved reports:

### Daily

- Visitors
- Paid orders
- Payment failures
- Checkout conversion
- Top products
- Open customer/stylist enquiries
- Orders awaiting atelier action

### Weekly

- Acquisition source performance
- Product conversion by device
- Funnel drop-off
- Median completion time
- Campaign retargeting performance
- Blog traffic and assisted conversions
- Refunds and cancellations

### Monthly

- Cohort repeat purchase
- Customer acquisition cost, when ad spend is connected
- Revenue by product/category/source
- First-touch versus last-touch attribution
- Production lead time
- Delivery performance
- Policy/support issues affecting conversion

---

## 14. Build phases

### Phase 0 — Decisions and contracts

- Obtain JusticeSure API and payment documentation.
- Decide whether JusticeSure owns payment or a separate provider is needed.
- Confirm SOSO prices, currencies, delivery areas, and production workflow.
- Approve refund, return, cancellation, privacy, and cookie policies.
- Select analytics and consent approach.
- Confirm admin users and roles.

### Phase 1 — Commerce foundation

- Implement server-side JusticeSure/payment adapter.
- Add hosted secure payment session.
- Add verified webhooks and idempotency.
- Persist orders, payments, customers, and production status.
- Add payment success/failure/pending pages.
- Add post-payment atelier follow-up workflow.

### Phase 2 — Trust and conversion

- Publish policy pages.
- Add footer trust navigation.
- Add visible product-page payment, delivery, returns, and made-to-order explanations.
- Add real reviews/customer imagery only when available.
- Add order confirmation and tracking.
- Add stylist enquiry persistence and response workflow.

### Phase 3 — Consent and analytics

- Implement consent manager.
- Implement first-party event collection.
- Add event schema and data-quality checks.
- Build core funnel and journey dashboards.
- Add active-time and completion-time measurements.
- Connect approved analytics tools only after consent/legal configuration.

### Phase 4 — Admin portal

- Add authentication and role-based access.
- Build orders, payments, production, enquiries, analytics, content, policies, and audit screens.
- Add exports and privacy request tools.
- Add operational notifications.

### Phase 5 — SEO, AEO, GEO, and editorial

- Complete technical SEO.
- Add structured data and sitemap generation.
- Build blog CMS and publish initial authoritative articles.
- Add FAQ and answer blocks.
- Add internal links and local/Abuja authority signals.
- Add search-console and performance monitoring.

### Phase 6 — Retargeting and optimization

- Define consent-safe audiences.
- Add campaign UTM governance.
- Add approved ad pixels behind consent controls.
- Exclude paid customers and apply frequency caps.
- Build campaign dashboards and landing-page experiments.
- Optimize from measured drop-off, not assumptions.

---

## 15. Launch gates

Do not call the site fully functional until all of the following are true:

- Real payment can be completed in sandbox and production.
- Payment webhooks are verified and idempotent.
- Paid orders reach SOSO/JusticeSure operations.
- Atelier follow-up is assigned and trackable.
- Refund, return, cancellation, delivery, privacy, cookie, and terms pages are published and accurate.
- Admin access is authenticated and role-restricted.
- Analytics funnel events are validated against real test journeys.
- Checkout and payment events distinguish failure, abandonment, and success.
- Consent behavior is documented and legally reviewed.
- Marketing pixels do not fire outside the approved consent/legal configuration.
- Sitemap, robots, canonical, metadata, structured data, and redirects pass validation.
- Blog and policy pages are indexable only when complete.
- Mobile checkout passes on real supported devices.
- Accessibility review covers keyboard use, focus, labels, contrast, and consent controls.
- Security review covers authentication, webhooks, PII, rate limiting, and secrets.
- Backup, incident, payment-failure, and support procedures are documented.

---

## 16. Open inputs SOSO must provide

To move from blueprint to implementation, SOSO needs to provide:

1. JusticeSure headless API documentation and sandbox access.
2. Confirmation of whether JusticeSure handles payment or only operations.
3. Chosen payment methods and settlement currency.
4. Official product, price, size, material, and finish data.
5. Actual delivery regions and production-time rules.
6. Approved refund, return, cancellation, and made-to-order policies.
7. Official support email, phone, WhatsApp number, and business address.
8. Approved brand/atelier story and editorial facts.
9. Real reviews, customer images, press mentions, and usage permissions.
10. Admin staff list and permissions.
11. Legal/privacy review for cookies, analytics, remarketing, and data retention.
12. Production domain and final social-sharing image.

Until these inputs are available, the storefront can be polished and instrumented, but it should not pretend to be a live payment or fulfilment system.
