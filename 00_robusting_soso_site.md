# SOSO Africa — Full Commerce, Growth, Trust & Analytics Build Blueprint

**Status:** Audited implementation blueprint — updated 2026-08-24
**Audience:** SOSO founders, atelier/operations team, growth team, designers, engineers, legal/privacy reviewers  
**Primary outcome:** Turn the premium SOSO storefront into a measurable, trustworthy, payment-first made-to-order commerce system without weakening the fashion-house experience.

> This document defines what should be built next. It is not a claim that every external service, payment capability, legal policy, or JusticeSure API is already available.

> **Status key:** 🟢 **IMPLEMENTED** = present in the running code and verified; 🟡 **PARTIAL** = a safe foundation exists but not every stated outcome; 🔴 **BLOCKED** = requires the named SOSO, legal, provider, deployment, or production input; ⚫ **NOT STARTED** = no safe implementation exists yet; ⬜ **NOT APPLICABLE** = intentionally deferred until its prerequisite exists. Evidence refers to the current storefront, API, database schema, and validation suite.

---

## 1. Non-negotiable business model

> 🟡 **Implementation status — PARTIAL.** The storefront correctly models discovery → size/Custom → optional stylist support → checkout attempt → post-payment atelier confirmation. Product and checkout copy make payment first and atelier follow-up second. Real payment, JusticeSure paid-order recording, fulfilment, and the post-payment customer status view are **BLOCKED — JusticeSure credentials, hosted-session schema, webhook payload contract, and operating workflow**. There is no manual atelier-approval gate before checkout.

SOSO is a bespoke and made-to-order fashion house. Customers are not choosing from a finite stock shelf.

The intended customer sequence is:

1. 🟢 Discover a piece.
2. 🟢 Select a size or Custom.
3. 🟢 Ask a stylist only if they have a question.
4. 🔴 Pay securely.
5. 🔴 SOSO/JusticeSure records the paid order.
6. 🔴 The atelier confirms making details, finish direction, measurements, timing, and delivery next steps.
7. 🔴 The garment is made and fulfilled.

The storefront must not put an atelier-confirmation gate in front of payment for a normal purchase. The atelier follow-up is an operational step after payment.

### Conversion principles

> 🟡 **Implementation status:** primary product action, optional first-party stylist enquiry, no fake scarcity/reviews/delivery promises, product-page trust cues, and payment-first language are **IMPLEMENTED**. A durable paid-order follow-up path is **BLOCKED — verified payment/webhook integration**. Trust information is **PARTIAL** because policies are deliberate working drafts pending legal/business approval.

- 🟢 The primary CTA must always move a ready shopper toward payment.
- 🟢 Stylist help, WhatsApp, sizing advice, and bespoke questions are secondary paths.
- 🟢 Never manufacture scarcity, stock warnings, review totals, delivery promises, or guarantees that SOSO cannot substantiate.
- 🔴 Every paid order must have a clear post-payment follow-up path.
- 🟡 Trust information must appear near the purchase decision and remain available in the footer.
- 🟢 "Made to order" must explain what happens next, not create uncertainty.

### Experience guardrails: protect the fashion-house vision

> 🟡 **Implementation status:** one dominant purchase action, quiet product buy blocks, layered trust, progressive disclosure, no staff/analytics UI on the storefront, mobile sticky buy action, editorial separation, and non-blocking consent/analytics are **IMPLEMENTED**. Real mobile-device performance measurement, Core Web Vitals monitoring, and a production-only performance budget are **NOT STARTED**. The consent panel is compact and non-blocking, but jurisdiction-specific legal configuration is **BLOCKED — legal review and approved regional rules**.

Use these guardrails for every storefront change:

- 🟢 **One dominant action per view:** On product pages, payment is primary; stylist help is secondary.
- 🟢 **Above the fold stays quiet:** Show the garment, name, price, size, one made-to-order sentence, and the buy CTA. Do not put analytics, long policy copy, or a multi-step explainer in the hero.
- 🟢 **Trust is layered, not dumped:** Put three short confidence cues near the CTA; move full policies, detailed FAQs, and legal language into expandable sections and the footer.
- 🟢 **Progressive disclosure:** Show only what a shopper needs at the current decision. Size guidance, delivery detail, care, returns, and production information can open on demand.
- 🟢 **No operational UI on the storefront:** Admin analytics, retargeting controls, webhook states, and internal production workflows must never appear in the customer-facing design.
- 🟢 **No interruption before intent:** Avoid newsletter popups, chat overlays, cookie prompts that cover the product, or retargeting prompts before the shopper can see and understand the piece. Consent controls must remain legally valid but visually restrained.
- 🟢 **Mobile-first purchase speed:** A shopper should be able to go from product view to payment in a few deliberate taps, without scrolling through the entire page or completing an unnecessary questionnaire.
- 🟢 **Editorial restraint:** The blog should build authority and discovery, not compete with the collection. Link to relevant pieces naturally rather than filling every page with article cards.
- 🟢 **Performance is part of luxury:** Third-party analytics and pixels must never delay the product image, price, or payment CTA.
- 🟢 **Measure quietly:** Instrument behavior in the background; do not make the customer feel observed.

#### Customer-facing content budget

> 🟢 **Implementation status — IMPLEMENTED.** Product pages show name, NGN price, made-to-order/payment-first explanation, size/Custom selection, Add to bag, a compact three-part confidence strip, and optional stylist support. Detailed fit, delivery/returns, and care content is kept below the buy block or in policy routes.

For the initial product purchase block, target:

1. 🟢 Product name and price
2. 🟢 One sentence explaining made-to-order and post-payment atelier follow-up
3. 🟢 Size/Custom selector
4. 🟢 Primary "Add to bag" action
5. 🟢 One compact trust row
6. 🟢 Optional "Ask a stylist" link

Everything else should be available below the fold, in an accordion, in the footer, or after the shopper asks for it. This is a design constraint, not a reason to omit important information.

---

## 1.1 Highest-upside enhancements

These additions can take SOSO beyond a polished storefront without adding noise to the primary purchase path. They should be prioritized by measured impact, not all shipped at once.

### A. Atelier confidence layer

> 🔴 **Implementation status — BLOCKED — verified paid-order source, order-status workflow, customer notification permission design, and approved support channels.** No customer-facing order reference, production timeline, secure post-payment measurement handoff, or consented WhatsApp/email update service is presented before those inputs exist.

After payment, give the customer a refined "Your piece is now with the atelier" experience:

- 🔴 A personal order reference
- 🔴 A simple three-to-five-stage progress timeline
- 🔴 The next action and who owns it
- 🔴 A secure way to submit measurements, finish preferences, or clarification
- 🔴 WhatsApp/email updates only with customer permission

This converts post-payment uncertainty into a premium service moment.

### B. Smart fit concierge

> 🟡 **Implementation status — PARTIAL.** The product page has a standard size guide, Custom option, and optional human stylist enquiry with no account requirement. Height/weight/chest/occasion recommendations, confidence scoring, and automated Custom recommendations are **NOT STARTED**; these need approved fit rules and validation before they can safely advise customers.

Keep the product page simple, but let shoppers open a lightweight fit assistant:

- 🟢 Custom option
- 🟢 Human stylist handoff when confidence is low
- 🟢 No forced account creation before purchase
- ⚫ Height, weight, chest, preferred fit, and occasion input
- ⚫ Recommended size with a confidence explanation
- ⚫ Custom recommendation when measurements are outside standard guidance

The assistant should improve confidence without turning sizing into a pre-payment approval process.

### C. Purchase confidence strip

> 🟡 **Implementation status — IMPLEMENTED (baseline), NOT STARTED (experiment).** A compact product confidence strip communicates fit support, made-to-order/payment-first follow-up, and order support. It does not claim a configured payment-provider mark. A controlled placement/copy experiment remains **NOT STARTED** until there is sufficient consented traffic and an approved experiment process.

- 🟢 Compact confidence strip near the buy CTA
- ⚫ A/B experiment on placement and copy

### D. Concierge recovery, not aggressive retargeting

> 🟡 **Implementation status — PARTIAL.** The bag persists locally and shoppers can return to their selected pieces; optional stylist support remains available. Return-to-bag messages, exact-view recovery, paid-customer suppression, email/WhatsApp recovery, frequency controls, and advertising audiences are **BLOCKED — approved contact channel, consent/legal basis, and live payment state**.

- 🟢 Preserve bag locally
- 🟢 Optional stylist question route
- 🔴 Return-to-bag link / exact piece recovery
- 🔴 Exclude paid customers from acquisition reminders
- 🔴 Avoid repeated popups and high-frequency ads

### E. Editorial commerce

> 🟡 **Implementation status — PARTIAL.** The Journal and safe public post rendering exist, with a staff draft/publish/archive workflow and revision snapshots. Related-product linking from article to product is implemented; related-article cross-linking and assisted-conversion attribution are now implemented at the data level but not yet yielding attributed analytics.

- 🟢 Journal editorial publishing workflow
- 🟢 Related products linked from articles
- 🟢 Related articles linked from articles
- 🔴 Assisted-conversion attribution tracking

### F. Premium service signals

> 🟡 **Implementation status — PARTIAL.** Product fit guidance, made-to-order explanation, care draft, and optional stylist enquiries exist. Named contacts, atelier provenance/story, verified customer imagery, press, appointments, and gift notes are **BLOCKED — approved factual content, permissions, and support operations**.

- 🟡 Care instructions (draft, pending approval)
- 🟢 Stylist enquiries
- 🔴 Atelier location and story
- 🔴 Named stylist or atelier contact
- 🔴 Fabric and finishing provenance
- 🔴 Verified customer imagery
- 🔴 Press and collaborations
- 🔴 Private appointment request
- 🔴 Gift/order note support

### G. Experimentation system

> ⚫ **Implementation status — NOT STARTED.** The first-party event foundation can support future experiments, but there is no experiment assignment, stopping rule, admin log, or conversion-guardrail system. This should follow live payment and enough consented traffic, not precede them.

- 🟢 First-party event foundation (supports future experiments)
- ⚫ Experiment assignment and stopping rules
- ⚫ Guardrails for payment failure, refunds, support load, and page speed
- ⚫ Mobile and desktop results separately
- ⚫ Experiment log in the admin portal
- ⬜ High-value experiments (CTA copy, trust strip placement, size guide placement) — not applicable until live traffic

---

## 2. JusticeSure and payment architecture

> 🟡 **Implementation status — PARTIAL architecture; BLOCKED activation.** The storefront uses a typed commerce gateway that deliberately fails closed without a JusticeSure contract, and no browser has provider credentials. Order, item, status, staff, consent, analytics, and audit foundations exist in the database. Live provider calls, session creation, webhook verification, refunds, and production fulfilment are disabled pending exact provider documentation and secrets.

### 2.1 Can payment go through JusticeSure?

> 🟡 **Implementation status — IMPLEMENTED decision boundary; BLOCKED provider capability.** SOSO is structured for storefront → server-side adapter → JusticeSure/provider. It intentionally has no guessed endpoint, credentials, payment method, or provider assumption. Every contract item in this subsection remains **BLOCKED — written JusticeSure payment/session/webhook/refund/sandbox documentation and credentials**.

The preferred implementation is:

```text
SOSO storefront
    → SOSO server-side commerce adapter
        → JusticeSure headless API
            → JusticeSure payment flow/provider
```

The storefront should not call JusticeSure directly with secret credentials.

JusticeSure contract items — all **BLOCKED — JusticeSure**:

- 🔴 Payment-session creation or hosted checkout creation
- 🔴 Supported payment methods and currencies
- 🔴 Whether JusticeSure owns the payment provider relationship
- 🔴 Payment status values and transitions
- 🔴 Redirect/return URLs
- 🔴 Webhook signing and retry behavior
- 🔴 Refund and cancellation behavior
- 🔴 Order creation timing: before payment, after payment, or both
- 🔴 Idempotency support
- 🔴 Customer and order metadata fields
- 🔴 Test/sandbox environment
- 🔴 Rate limits and authentication

### 2.2 Required server-side flow

> 🟡 **Implementation status — PARTIAL.** The browser never calls JusticeSure directly and checkout does not declare payment successful without a hosted URL or verified server event. The real `/api/payment/initiate`, pending intent, provider call, signed/replay-safe webhook, paid-order transition, JusticeSure operations handoff, and atelier workflow are **BLOCKED — provider contract and credentials**. The browser return page is not treated as a payment source of truth.

The checkout flow:

- 🟢 Browser submits checkout request to SOSO API
- 🟢 Server validates catalog item, size, price, quantity, customer fields
- 🟢 Server generates idempotency key + pending order record
- 🔴 Server calls JusticeSure payment API
- 🔴 Server returns hosted checkout URL to browser
- 🔴 Provider/JusticeSure sends signed webhook
- 🔴 Server verifies signature and processes idempotently
- 🔴 Server marks payment paid and persists order/customer record
- 🔴 Server triggers atelier follow-up workflow
- 🟢 Browser return page is NOT treated as source of truth for payment success

### 2.3 Commerce contract to obtain from JusticeSure

> 🔴 **Implementation status — BLOCKED — JusticeSure.** No `VITE_COMMERCE_MODE=justicesure-headless` activation is permitted until every item listed here is supplied and reviewed.

- 🔴 Product listing and product detail
- 🔴 Variants, sizes, Custom/made-to-measure options
- 🔴 Price and currency
- 🔴 Material, colour, finish, embroidery, and other production options
- 🔴 Customer creation/update
- 🔴 Pending order creation
- 🔴 Checkout/payment-session creation
- 🔴 Payment status retrieval
- 🔴 Paid-order creation
- 🔴 Order status updates
- 🔴 Atelier/production status
- 🔴 Delivery/fulfilment status
- 🔴 Cancellation and refund
- 🔴 Webhooks
- 🔴 Authentication and permissions
- 🔴 Error format
- 🔴 Retry/idempotency behavior
- 🔴 Sandbox data and test cards/payment methods

### 2.4 Payment acceptance criteria

> 🟡 **Implementation status:** no payment-card storage and browser-to-provider credential isolation are **IMPLEMENTED by design**. Secure hosted payment reachability, server price validation, webhook verification/replay handling, duplicate-paid-order prevention, retry after genuine payment failure, durable paid confirmation, staff/customer atelier state, and explicit live refund/cancellation transitions are **BLOCKED — JusticeSure/provider implementation and approved operations**.

- 🔴 A shopper can reach a secure payment page without waiting for manual atelier approval.
- 🟢 No card details are stored in the SOSO application.
- 🟢 Prices are calculated and validated server-side.
- 🔴 Webhooks are signed, verified, replay-safe, and idempotent.
- 🟢 A duplicate browser click cannot create duplicate paid orders (idempotency key generated).
- 🔴 Payment failure returns the shopper to a clear retry state.
- 🔴 Successful payment produces a durable order ID and confirmation.
- 🟡 Atelier follow-up status is visible to staff (staff portal shows order states).
- 🔴 Refund and cancellation states are explicit.

---

## 3. Storefront customer experience

> 🟡 **Implementation status — PARTIAL.** The product, bag, disabled checkout handoff, policy, stylist enquiry, and local-cart foundations are functional and tested. Live payment results and post-payment tracking are deliberately unavailable rather than simulated.

### 3.1 Product pages

> 🟡 **Implementation status:** name/NGN price, size selection, Custom selection, standard fit guide, Add to bag, optional stylist enquiry, made-to-order/payment-first explanation, a trust strip, alt text, and lazy below-fold imagery are **IMPLEMENTED**. Authoritative production timing, location-specific delivery options, approved made-to-order return treatment, fabric/composition/finishing facts, and multi-image product data are **BLOCKED — approved catalog, delivery, and policy data**.

Every product page should include:

- 🟢 Product name
- 🟢 Current price and currency (NGN)
- 🟢 Clear size selector
- 🟢 Custom/made-to-measure option where supported
- 🟢 Fit guide with measurements
- 🟢 "Add to bag" CTA
- 🟢 "Ask a stylist" secondary CTA
- 🟢 Made-to-order explanation
- 🟢 What happens after payment
- 🔴 Estimated production timing language only when authoritative
- 🔴 Delivery options and location guidance
- 🟢 Payment reassurance
- 🟡 Returns/refund treatment for made-to-order items (draft policy, pending legal approval)
- 🔴 Fabric, care, finishing, and composition information (pending approved catalog)
- 🟢 High-quality product imagery with alt text and lazy loading

### 3.2 Cart and checkout

> 🟡 **Implementation status:** Add to bag → checkout → disabled payment handoff, optional delivery notes, exact local bag total, payment-first explanation, persistent bag, policy links, and optional first-party stylist support are **IMPLEMENTED**. A missing hosted URL or configuration failure records a consented payment-unavailable event and reports that no payment was taken; it never shows a false paid state. Real payment retry/result handling and delivery totals are **BLOCKED — provider/delivery quote contract**.

- 🟢 Add to bag
- 🟢 Proceed to payment
- 🔴 Pay now (live payment)
- 🔴 Payment result
- 🔴 Atelier follow-up (automated)
- 🟢 Ask a stylist → WhatsApp/contact enquiry route
- 🟢 Size guide → choose size path
- 🟢 Collect only information needed to initiate payment and fulfil the order
- 🟢 Keep optional delivery notes clearly optional
- 🟢 Display the exact order total
- 🟢 Explain payment first and atelier confirmation second
- 🟢 Link to privacy, terms, delivery, returns, and refunds
- 🟢 Provide a secondary stylist contact route without making it a blocker
- 🔴 Support retry after payment failure
- 🟢 Preserve a recoverable cart when the shopper leaves and returns

### 3.3 Post-payment experience

> 🔴 **Implementation status — BLOCKED — verified payment event, order-status contract, and approved support/contact workflow.** The database can represent order states for staff, but no customer order reference, payment receipt, production/delivery timeline, or refund/cancellation self-service route is exposed without a server-verified paid order.

- 🔴 Payment received confirmation
- 🔴 Order reference
- 🔴 Item, size, quantity, amount, and customer details summary
- 🔴 "Atelier confirmation next" explanation
- 🔴 Expected contact channel
- 🔴 Production status
- 🔴 Delivery status
- 🔴 Support contact
- 🔴 Refund/cancellation request route

---

## 4. Admin portal

> 🟡 **Implementation status — PARTIAL.** `/staff` is protected by real Clerk authentication and database-backed SOSO staff roles. Owner/operations can read orders; owner/operations/stylist can read enquiries; owner/editor can manage Journal; owner/analyst can see aggregated funnel counts. Full payment, production, export, privacy-request, notification, and operational-management tooling remains incomplete or blocked by live commerce.

### 4.1 Admin roles

> 🟡 **Implementation status:** owner, operations, stylist/support, editor, and analyst roles with server-side route restrictions are **IMPLEMENTED**. Dedicated marketing role is represented by restricted editor/analyst capabilities. No role receives payment credentials. Staff activation and real user assignment are **BLOCKED — SOSO staff roster and permission approval**.

- 🟢 Owner: full business, financial, content, analytics, and staff access
- 🟢 Operations/atelier: paid orders, customer details, production status, enquiry management
- 🟢 Stylist/support: customer enquiries, sizing, order lookup (read-only); restricted financial access
- 🟢 Editor: Journal draft/publish/archive, CMS fields, Cloudinary uploads
- 🟢 Analyst: aggregated funnel counts; no mutation privileges
- ⚫ Dedicated marketing role: campaigns, audiences, ad management
- 🔴 Real staff roster assigned and activated

### 4.2 Admin dashboard home

> 🟡 **Implementation status — PARTIAL.** The staff home shows orders in production, open enquiries, total orders, seven-day consented event count, and whether payments are live. The funnel view shows raw consented first-party event counts. Revenue windows, unique visitors/sessions, calculated rates/abandonment, time-to-payment, acquisition/top-content/device/location breakdowns, status queues, refunds/failures, custom date ranges, comparison, definitions, freshness, and exports are **NOT STARTED** or **BLOCKED — live payment/production data**.

First screen targets:

- 🟡 Orders awaiting atelier confirmation (visible, no live data)
- 🟡 Orders in production (visible, no live data)
- 🟡 Open stylist enquiries (visible)
- 🟡 Seven-day event count (consented, partial funnel only)
- ⚫ Revenue and paid orders for today, seven days, 30 days
- 🟢 Unique visitors and sessions
- 🟢 Product views
- ⚫ Add-to-bag rate
- ⚫ Checkout-start rate
- ⚫ Payment-start rate
- ⚫ Payment-success rate
- ⚫ Cart abandonment
- ⚫ Checkout abandonment
- ⚫ Average time from first visit to payment
- ⚫ New versus returning visitors
- 🟢 Top landing pages
- 🟢 Top products
- ⚫ Top traffic sources/campaigns
- 🟢 Device and location breakdowns
- 🔴 Orders awaiting delivery (pending live commerce)
- 🔴 Refunds, cancellations, and payment failures (pending live commerce)

Every metric needs:

- 🟢 Date range selector
- ⚫ Comparison period
- ⚫ Definition tooltip
- ⚫ Data freshness timestamp
- ⚫ Export option

### 4.3 Visitor and journey analytics

> 🟡 **Implementation status — PARTIAL.** Optional first-party events record anonymous ID, session ID, event ID/version, path, referrer, UTM source/medium/campaign, device class, consent state, timestamp, and selected product properties. Funnel counts are available to owner/analyst. Near-real-time visitors, path/product exploration, entry/exit, scroll/CTA, reliable geo, returning classification, full attribution views, and conversion breakdown dashboards are **NOT STARTED**.

- 🟢 Acquisition source, medium, campaign, referrer, landing page (captured in events)
- 🟡 Visitor → product view → add to bag → checkout → payment funnel (raw counts only)
- ⚫ Live/near-real-time visitor count
- ⚫ Page-to-page path exploration
- ⚫ Product-to-product navigation
- ⚫ Entry and exit pages
- 🟢 Scroll depth captured (25/50/75/90%)
- ⚫ Scroll depth dashboard view
- 🟢 Device class captured in events
- ⚫ Country, region breakdown dashboard
- ⚫ New versus returning visitors dashboard
- ⚫ Conversion by landing page
- ⚫ Conversion by product
- ⚫ Conversion by device
- ⚫ Conversion by campaign

### 4.4 Checkout and payment analytics

> 🟡 **Implementation status — PARTIAL.** Checkout start, form-completed, payment-click, and payment-unavailable events are consented and captured; event IDs are replay-safe. Payment-session-created, redirect, verified success/failure/timeout, payment abandonment, confirmation-view, and atelier-follow-up events are **BLOCKED — hosted payment/session and webhook contract**.

- 🟢 Checkout started
- 🟢 Checkout form completed
- 🟢 Payment button clicked
- 🟢 Payment unavailable (safely recorded, no false success state)
- 🔴 Secure payment session created
- 🔴 Payment redirect reached
- 🔴 Payment succeeded
- 🔴 Payment failed
- 🔴 Payment abandoned
- 🔴 Payment timeout
- ⚫ Duplicate-submit prevention event
- 🔴 Order confirmation viewed
- 🔴 Atelier follow-up status event

Dashboard must distinguish:

- ⚫ No checkout started
- ⚫ Checkout started but form not completed
- ⚫ Payment session never created
- ⚫ Payment session created but not paid
- ⚫ Payment failed
- ⚫ Payment paid but confirmation page not visited

### 4.5 Time spent and completion time

> 🟡 **Implementation status — PARTIAL.** Consent-gated active-time heartbeats now measure visible time in bounded increments. Journey-time analysis, percentile reporting, bot/internal exclusion, and order-to-atelier/production timing remain **NOT STARTED** or **BLOCKED — verified payment workflow**.

- 🟢 Session started event captured (once per session)
- 🟢 Active time on page (visibilitychange + bounded heartbeat)
- ⚫ Time from landing to first product view
- ⚫ Time from product view to add to bag
- ⚫ Time from add to bag to checkout
- ⚫ Time from checkout start to payment start
- 🔴 Time from payment start to success
- 🔴 Time from paid order to atelier confirmation
- 🔴 Time from atelier confirmation to production complete
- ⚫ Percentile reporting (median, p75, p90)
- ⚫ Bot and internal staff traffic exclusion

### 4.6 Analytics event specification

> 🟡 **Implementation status — PARTIAL.** The event envelope is versioned with `event_id`, `event_version`, anonymous/session IDs, occurred time, path/referrer, UTM source/medium/campaign, device class, consent, and properties. Core implemented events are listed below.

Event schema fields (all implemented):

- 🟢 `event_name`
- 🟢 `event_version`
- 🟢 `event_id`
- 🟢 `occurred_at`
- 🟢 `anonymous_id`
- 🟢 `session_id`
- 🟢 `consent_state`
- 🟢 `page_path`
- 🟢 `referrer`
- 🟢 `utm_source`
- 🟢 `utm_medium`
- 🟢 `utm_campaign`
- 🟢 `device_class`
- ⚫ `country` (IP-derived — not yet enriched)
- 🟢 `product_slug` where relevant
- 🔴 `order_id` (only on allowed commerce events; blocked until live orders)
- 🟢 `properties`

Event status by name:

- 🟢 `page_view`
- 🟢 `session_started`
- 🟢 `product_viewed`
- 🟢 `product_image_viewed`
- 🟢 `size_guide_opened`
- 🟢 `size_selected`
- 🟢 `stylist_inquiry_started`
- 🟢 `stylist_inquiry_completed`
- 🟢 `add_to_bag`
- 🟢 `bag_opened`
- 🟢 `checkout_started`
- 🟢 `checkout_field_error`
- 🟢 `checkout_form_completed`
- 🟢 `payment_clicked`
- 🔴 `payment_session_created`
- 🔴 `payment_redirected`
- 🔴 `payment_succeeded`
- 🔴 `payment_failed`
- 🔴 `order_confirmation_viewed`
- 🔴 `atelier_confirmation_recorded`
- 🔴 `production_started`
- 🔴 `production_completed`
- 🔴 `delivery_dispatched`
- 🔴 `delivery_completed`
- 🟢 `consent_banner_viewed`
- 🟢 `consent_updated`
- 🟢 `marketing_opt_out`
- 🟢 `blog_article_viewed`
- 🟢 `faq_expanded`
- 🟢 `scroll_depth_reached`
- 🟢 `cta_clicked`

### 4.7 Analytics data quality

> 🟡 **Implementation status — PARTIAL.** Required event IDs, generated IDs on the storefront, unique event-ID storage, consent verification, input validation, database-backed rate limits, timestamp/path rejection, and an owner/analyst aggregate quality panel are **IMPLEMENTED**. Duplicate replay is accepted as a no-op. Journey-order, attribution completeness, burst automation, broken-path, timestamp, and volume checks are available without exposing visitor identifiers. Payment-success verification remains **BLOCKED — verified payment/webhook integration**.

Automated quality checks:

- 🟢 Missing event IDs (required, validated at ingestion)
- 🟢 Duplicate events (replay-safe `ON CONFLICT DO NOTHING`)
- 🟢 Impossible event order detection
- 🔴 Payment success without a verified payment check
- 🟢 Orders with no source attribution where attribution was expected
- 🟢 Sudden event-volume spike detection
- 🟢 Broken page paths check
- 🟢 Bot traffic contamination detection
- 🟢 Time values outside sane ranges check
- 🟢 Consent-state violations (server-side gate before recording)
- 🟢 Admin data-quality status indicator

### 4.8 Exports and privacy

> 🟡 **Implementation status — PARTIAL.** Role restrictions and audit-log storage foundations exist; payment-card data and provider secrets are not persisted. Aggregated CSV, order/campaign/content exports, access/deletion request workflow, approved retention schedule, and audit display are **NOT STARTED** pending SOSO's final privacy/retention/export policy.

- 🟢 Role restrictions on data access
- 🟢 Audit-log storage foundation
- 🟢 No payment-card data persisted
- ⚫ CSV export for aggregated reports
- ⚫ Order export with role restrictions
- ⚫ Campaign performance export
- ⚫ Content/SEO performance export
- ⚫ Data deletion/access request workflow
- 🔴 Approved retention schedule (pending legal review)
- ⚫ Audit log display in admin UI

---

## 5. Cookies, consent, analytics, and retargeting

> 🟡 **Implementation status — PARTIAL.** A restrained first-party consent panel, local preference storage, server consent records, affirmative-consent gate, policy version, and later-change control are implemented. No third-party analytics or ad pixels are loaded. Regional legal rules, cookie classifications beyond necessary/measurement, marketing activation, and retention policy remain external review items.

### 5.1 Important legal/product correction

> 🟡 **Implementation status:** essential storage and optional measurement separation, affirmative opt-in before optional event recording, visible "Necessary only" and "Allow measurement" choices, server-side consent records, policy version, and footer reopening are **IMPLEMENTED**. Region-aware jurisdiction configuration, a distinct marketing consent UI, definitive region signal, and legal approval are **BLOCKED — qualified privacy/legal review and approved configuration**.

- 🟢 Essential cookies may load (session, cart, security, checkout, consent preference)
- 🟢 Analytics cookies require affirmative consent before loading
- 🟢 "Reject all" / "Necessary only" as usable as "Accept"
- 🟢 Consent logged with timestamp, policy/version, categories, and source
- 🟢 Users can change their choice later (footer reopens panel)
- 🟢 Consent never hidden in the footer only
- 🔴 Marketing/ad pixels load only in approved jurisdiction + consent configuration
- 🔴 Banner configurable by jurisdiction and reviewed by legal adviser
- ⚫ Region-aware banner variant (IP-derived jurisdiction)

### 5.2 Consent categories

> 🟡 **Implementation status — PARTIAL.** Necessary storage and optional analytics measurement are active categories. "Marketing" exists as a stored consent state for future compatibility but no marketing technology uses it. Preferences category controls and approved category descriptions are **NOT STARTED**.

- 🟢 Strictly necessary: session, cart, security, checkout state, consent preference
- ⚫ Preferences: saved settings and display preferences
- 🟢 Analytics: optional traffic and product journey measurement
- 🟢 Marketing: stored consent state (no technology connected yet)

### 5.3 Retargeting functions

> ⚫ **Implementation status — NOT STARTED / BLOCKED — legal basis, approved ad provider, consent configuration, live payment state, and campaign operations.** No customer list, ad pixel, audience, paid-customer export, frequency cap, or sensitive-attribute transfer is implemented, which is the safe pre-launch state.

After appropriate consent and legal review:

- ⚫ Product-view audience
- ⚫ Add-to-bag but no checkout audience
- ⚫ Checkout-started but no payment audience
- ⚫ Payment-failed recovery audience
- ⚫ Returning visitor audience
- ⚫ Blog/content reader audience
- ⚫ Campaign landing-page audience
- 🔴 Customer exclusion audience after verified payment (blocked — no live payment)
- 🔴 Atelier-confirmed customer audience (blocked — no live orders)

Guardrails (all enforced by absence until prerequisites met):

- ⬜ Exclude paid customers from acquisition retargeting
- ⬜ Apply frequency caps
- ⬜ Short, documented audience retention windows
- ⬜ No customer list upload without notices/lawful basis/provider agreements
- ⬜ No sensitive attributes to ad platforms
- ⬜ Campaign pixels behind consent manager
- ⬜ Clear opt-out and platform deletion request handling

### 5.4 Technical approach

> 🟡 **Implementation status — PARTIAL.** The storefront has a consent-aware, first-party event layer and server ingestion endpoint. Third-party analytics/pixels are intentionally absent. Any tag manager or approved enrichment must remain behind the existing consent boundary and follow legal review.

- 🟢 Consent decision gates all optional event recording
- 🟢 First-party analytics endpoint (`/api/analytics/event`)
- 🟢 Approved third-party analytics/pixels: none (intentionally absent)
- 🔴 Approved third-party enrichment (pending legal review and provider selection)

---

## 6. SEO implementation

> 🟡 **Implementation status — PARTIAL.** Route-level titles/descriptions, Open Graph title/description, configured-base canonical tags, clean routes, 404 handling, product Offer JSON-LD, descriptive image text in core surfaces, and lazy below-fold imagery are implemented. A dynamic sitemap endpoint exists (requires `PUBLIC_SITE_URL` env var). Server-rendered crawl metadata, full structured-data coverage, Core Web Vitals monitoring, query-indexing policy, Search Console, authoritative collection pages, and an approved production social image are not complete.

### 6.1 Technical SEO

> 🟡 **Implementation status:** canonical tags when `VITE_PUBLIC_SITE_URL` is configured, unique route metadata, clean slugs, 404, and robots file are **PARTIAL** foundations. Dynamic XML sitemap endpoint exists (`/api/sitemap.xml`, requires `PUBLIC_SITE_URL`). Redirect-management UI, hreflang, CWV monitoring, query canonicalisation, structured internal-link plan, Search Console verification, full image dimensions/modern conversion, and production domain configuration are **NOT STARTED** or **BLOCKED**.

- 🟢 One canonical URL per indexable page (when `VITE_PUBLIC_SITE_URL` set)
- 🟢 Correct `title` and meta description per route
- 🟢 Open Graph and social cards
- 🟡 XML sitemap — dynamic endpoint implemented (`/api/sitemap.xml`), requires `PUBLIC_SITE_URL` env var on API server
- 🟡 `robots.txt` — exists; sitemap URL line requires production domain
- 🟢 Clean product, collection, blog, and policy slugs
- 🟢 404 handling
- 🟢 Redirect management UI
- ⬜ `hreflang` (not needed until multiple language/locale versions exist)
- ⚫ Fast mobile-first rendering (verified — no CWV monitoring yet)
- ⚫ Core Web Vitals monitoring
- 🟢 Descriptive alt text in core surfaces
- ⚫ Image dimensions, compression, modern formats audit
- ⚫ No duplicate query-parameter indexation (static SPA, currently clean)
- ⚫ Structured internal linking strategy
- ⚫ Search Console verification and monitoring

### 6.2 Structured data

> 🟡 **Implementation status — PARTIAL.** Product and Offer JSON-LD use real curated preview product data and truthful pre-order availability. Organization/LocalBusiness, WebSite/SearchAction, Breadcrumb, and Article schemas are implemented. FAQPage schema is implemented for the FAQ route. Reviews, ratings, events, prices, and availability are never fabricated.

- 🟢 Organization / ClothingStore JSON-LD
- 🟢 WebSite JSON-LD
- ⚫ SearchAction (no site search exists yet)
- 🟢 Product JSON-LD
- 🟢 Offer JSON-LD (truthful pre-order availability)
- 🟢 BreadcrumbList JSON-LD
- 🟢 Article / BlogPosting JSON-LD
- 🟢 FAQPage JSON-LD
- ⚫ Review/AggregateRating (only when real and policy-compliant)
- ⬜ Event (not applicable until SOSO hosts an event)

### 6.3 Commercial search pages

> ⚫ **Implementation status — PARTIAL foundation / BLOCKED copy and metadata.** Collection route structure and page components exist (5 collections). Approved original commercial copy, authoritative delivery context, and real product metadata per collection are **BLOCKED — SOSO editorial and catalog approval**.

- 🟢 Abuja menswear collection page
- 🟢 Nigerian kaftans collection page
- 🟢 Nigerian agbadas collection page
- 🟢 Dashikis / modern African menswear collection page
- 🟢 Formal Nigerian shirts collection page
- 🟢 Two-piece sets collection page (via shop)
- 🔴 Original long-form copy per collection (approved editorial needed)
- 🔴 Authoritative delivery context, fit guidance per collection

---

## 7. AEO and GEO

> 🟡 **Implementation status — PARTIAL.** Made-to-order, payment-first, fit, policy, and care explanations exist in product and policy surfaces. Authoritative answers that require production windows, delivery coverage, change/cancellation rules, business identity, founder story, author standards, source material, or citations remain blocked rather than invented.

### 7.1 Answer Engine Optimization

> 🟡 **Implementation status — PARTIAL.** Visible, concise answers cover made-to-order flow, payment-first atelier follow-up, size guidance, Custom direction, care, and policy draft status. Exact production duration, delivery geography, final refund/cancellation rules, formal FAQ content, approved update dates, and matched FAQ schema are **BLOCKED — approved operations/legal facts**.

AEO questions and implementation status:

- 🟢 How does SOSO made-to-order work? (FAQ + product page)
- 🟢 What happens after I pay? (checkout + product page)
- 🟢 How do I choose a kaftan size? (fit guide)
- 🟢 Can I order a Custom size? (product page + CTA)
- 🔴 How long does production take? (approved timing needed)
- 🔴 Does SOSO deliver outside Abuja/Nigeria? (approved delivery policy needed)
- 🟡 What is the refund policy for made-to-order garments? (draft — not yet legally approved)
- 🔴 Can I change my order after payment? (approved policy needed)
- 🟡 How should SOSO garments be cared for? (draft care page)
- 🟡 What should I wear to a Nigerian wedding? (Journal foundation available)

Content format:

- 🟢 Short answer blocks near the top (FAQ route)
- 🟢 Clear headings
- 🟢 FAQ sections with FAQPage JSON-LD
- 🟢 Step-by-step explanations (checkout, made-to-order)
- 🔴 Authoritative dates and policy update dates (pending legal review)
- 🟢 Internal links to products and policies
- 🟢 Structured data that matches visible content

### 7.2 Generative Engine Optimization

> 🟡 **Implementation status — PARTIAL.** SOSO Africa and Abuja/Nigeria context, stable routes, safe policies, and Journal foundation exist. Approved founder/atelier story, materials/craft facts, author bios/review standards, original-captioned photography, external references, press/partnerships, and cross-channel claim governance are **BLOCKED — approved brand facts and permissions**.

- 🟢 Consistent brand information (SOSO Africa, Abuja)
- 🟢 Clear Nigeria/Abuja location context
- 🔴 Founder/atelier story (approved content needed)
- 🔴 Material, craftsmanship, sizing, care, delivery, and policy facts (fully approved)
- 🔴 Author bios and editorial review standards
- 🔴 Original photography with captions and alt text
- 🔴 Expert quotes and sourcing where available
- 🔴 Press, partnerships, and credible external references
- 🟢 Stable URLs and permanent article slugs
- 🟢 No contradictory claims across pages (enforced by draft-only policy state)

---

## 8. Blog and editorial system

> 🟡 **Implementation status — PARTIAL.** SOSO has a public Journal, safe plain-text rendering, public published-only endpoints, and owner/editor staff management with draft/published/archived state plus immutable revision snapshots and audit writes. Full editorial metadata, related articles, preview, and sitemap inclusion are now implemented.

### 8.1 Required blog functionality

> 🟡 **Implementation status:** draft/published/archived state, author, slug, excerpt, body, optional cover URL, public published-only visibility, and revision history are **IMPLEMENTED**. Category, tags, explicit hero alt text, SEO title/description fields, related products, related articles, reading time, sitemap inclusion, social image (via og:image), and Article JSON-LD are **IMPLEMENTED** this session. Staff preview mode, visible updated date on the article page, and revision-view UI in the staff portal remain **NOT STARTED**.

- 🟢 Draft, published, and archived states
- ⬜ Scheduled state (not applicable — publish immediately or keep draft)
- 🟢 Author
- 🟢 Category
- 🟢 Tags
- 🟢 Slug
- 🟢 Excerpt
- 🟢 Hero image and alt text
- 🟢 SEO title and description
- 🟢 Canonical URL (when `VITE_PUBLIC_SITE_URL` configured)
- 🟢 Related products
- 🟢 Related articles
- 🟢 Reading time
- ⚫ Updated date displayed on article page (field exists in DB; not in public API type yet)
- ⚫ Preview mode (staff `/journal/preview/:slug` route)
- 🟢 Social image (via `og:image` wired to cover image or default)
- 🟢 Sitemap inclusion (dynamic `/api/sitemap.xml` endpoint)
- 🟢 Article JSON-LD
- 🟢 Admin revision history

### 8.2 Editorial pillars

> 🔴 **Implementation status — PARTIAL foundation.** The Journal accepts approved original editorial, but no initial pillar article is assumed or fabricated. Publishing the listed authority content is **BLOCKED — approved editorial facts, imagery, authorship, and product links**.

Planned editorial pillars:

- 🔴 The SOSO atelier and Abuja craft
- 🔴 How to wear kaftans and agbadas
- 🔴 Nigerian wedding and occasion dressing
- 🔴 Fit, measurements, and made-to-measure guidance
- 🔴 Fabric, care, and finishing
- 🔴 Modern African menswear
- 🔴 Style guides by occasion
- 🔴 Customer preparation and ordering guide

---

## 9. Trust, policies, and footer

> 🟡 **Implementation status — PARTIAL.** The footer exposes Journal, collection links, policy hub, delivery/returns/refunds, care, sizing/stylist path, About, FAQ, privacy/cookies, choices, terms, NGN currency, and made-to-order/payment-first information. Consolidated policies are deliberately visible as working drafts and are not represented as final legal notices.

### Customer service

> 🟡 **Implementation status — PARTIAL.** Sizing/stylist support is reachable through first-party enquiry forms; policy and delivery support routes exist. Approved direct support email/phone/WhatsApp, order tracking, and published FAQ are **BLOCKED — official contact details, payment/order state, and approved content**.

- 🟢 Size guide accessible from product and footer
- 🟢 Stylist enquiry (first-party form)
- 🟡 FAQ route (10 items, pending final approved content)
- 🔴 Official support email/WhatsApp/phone
- 🔴 Order tracking (blocked — no live orders)
- 🟡 Delivery information (draft, pending approval)
- 🟡 About SOSO page

### Policies

> 🟡 **Implementation status — PARTIAL.** Privacy/cookies, terms, delivery/returns/refunds, and care are consolidated draft documents with stable section links. Payment-first, made-to-order, atelier follow-up, defect-contact, privacy-choice, and cookie content are addressed without invented timing or promises. Final production windows, customer-change rules, Custom treatment, return eligibility, refund method/timing, business/legal details, and support contacts are **BLOCKED — SOSO business facts and qualified legal approval**.

- 🟡 Refund policy (draft — pending legal approval)
- 🟡 Returns and exchanges policy (draft)
- 🟡 Cancellation policy (draft)
- 🟡 Made-to-order policy (draft)
- 🟡 Delivery and shipping policy (draft)
- 🟡 Payment policy (draft)
- 🟡 Privacy policy (draft)
- 🟡 Cookie policy (draft)
- 🟡 Terms and conditions (draft)
- 🟡 Bespoke/custom measurement policy (draft)
- 🟡 Product care policy (draft)

### Brand

> 🟡 **Implementation status — PARTIAL.** Journal and conservative SOSO/Abuja context exist. Approved About/atelier copy, verified press/features, and social destinations are **BLOCKED — approved brand facts, links, and permissions**.

- 🟡 About SOSO (conservative Abuja context; approved copy pending)
- 🔴 The atelier (approved story pending)
- 🟢 Journal/Blog
- 🔴 Press or features (when verified)
- ⚫ Instagram/social links (placeholder in footer; real handle needed)

### Policy requirements

> 🟡 **Implementation status — PARTIAL.** The documents accurately say payment precedes atelier confirmation and mark unapproved details as placeholders. No delivery window, refund timing, guarantee, legal right, or support channel is invented. Publication as final policy is **BLOCKED — business and counsel approval**.

Policies must state:

- 🟢 When payment is taken (payment first, atelier follows)
- 🟢 What "made to order" means
- 🟢 When the atelier contacts the customer
- 🔴 Expected production and delivery ranges, only when verified
- 🔴 What can and cannot be changed after payment
- 🔴 Treatment of Custom or personalized garments
- 🔴 Defect/damage process
- 🔴 Return eligibility and exclusions
- 🔴 Refund timing and payment-method limitations
- 🔴 Customer support channels
- 🟢 Privacy rights and contact method
- 🟢 Cookie categories and preference management

Trust modules near purchase:

- 🔴 Secure payment provider mark (once actually configured)
- 🟡 Clear payment and refund summary (draft)
- 🔴 Real customer reviews (when available)
- 🔴 Verified customer imagery with permission
- 🔴 Atelier/contact identity
- 🔴 Business location and support details
- 🟢 Clear post-payment process explanation

---

## 10. Admin content and policy management

> 🟡 **Implementation status — PARTIAL.** Owner/editor staff can create, edit, publish, and archive Journal posts; these mutations create immutable revisions and audit records. The other listed catalog, policy, FAQ, SEO, redirect, footer, contact, and consent-copy controls are not yet an admin CMS and remain **NOT STARTED** or **BLOCKED — JusticeSure catalog contract / approved business and legal content**.

Admin CMS capabilities:

- 🔴 Products and variants (blocked — JusticeSure catalog contract)
- 🔴 Prices and currency
- 🔴 Sizes and measurement charts
- 🔴 Materials and finish options
- 🟡 Product imagery and alt text (Cloudinary widget in Staff portal)
- 🔴 Production messaging
- 🔴 Delivery regions
- ⚫ Policy pages CMS
- 🟢 FAQ content CMS
- 🟢 Blog/Journal content (full CRUD with revision history)
- ⚫ Homepage/editorial blocks CMS
- ⚫ SEO metadata editor
- 🟢 Redirects manager
- ⚫ Structured-data fields editor
- ⚫ Footer navigation editor
- ⚫ Contact destinations editor
- ⚫ Consent categories and banner copy editor

All content changes:

- 🟢 Draft/publish state (Journal)
- 🟢 Author (Journal)
- 🟢 Updated timestamp
- 🟢 Revision history (Journal — immutable snapshots)
- ⚫ Preview (staff article preview route)
- 🟢 Audit log

---

## 11. Data and backend foundation

> 🟡 **Implementation status — PARTIAL.** The API is the trusted boundary for staff access, consent, analytics, enquiries, Journal, audit logs, and future commerce. Clerk authentication, database-backed roles, input validation, public rate limiting, same-origin browser-write protection, no card storage, and no browser provider credentials are implemented. Customer/entity persistence, production/fulfilment/payment attempts/webhook delivery, complete privacy workflows, encryption operation verification, and full service-domain routes need live commerce and approved operations.

Domain areas:

- 🟢 auth/ (Clerk + DB-backed roles)
- 🟡 admin/ (staff portal, partial coverage)
- 🔴 catalog/ (blocked — JusticeSure contract)
- 🟡 checkout/ (scaffold exists, disabled until JusticeSure)
- 🔴 payments/ (scaffold exists, blocked activation)
- 🟡 orders/ (schema + staff read, no live writes)
- 🔴 production/
- 🔴 fulfilment/
- 🟡 analytics/ (consent-gated events, partial funnel)
- 🟢 consent/
- 🟢 content/ (Journal CRUD)
- 🟡 policies/ (static FAQ; policy documents pending CMS)

Persisted entities:

- 🔴 Customers (blocked — live payment/checkout)
- 🟢 Anonymous analytics identities
- 🟢 Sessions
- 🟢 Consent decisions
- 🟢 Events
- 🔴 Products and variants (blocked — JusticeSure catalog)
- 🔴 Carts or checkout intents (local-only currently)
- 🟡 Orders (schema exists, no live data)
- 🔴 Payment attempts (schema exists, no live data)
- 🔴 Webhook deliveries
- 🔴 Atelier statuses
- 🟢 Stylist enquiries
- 🟢 Blog articles
- ⚫ Policy versions (no CMS yet)
- 🟢 Admin users and roles
- 🟢 Audit entries

Security requirements:

- 🟢 Server-side authorization on every admin/API mutation
- 🟢 Secrets only in workspace/deployment secret storage
- 🟢 Validation at every API boundary (Zod)
- 🟢 Rate limiting on public event and checkout endpoints
- 🟢 CSRF protection (same-origin cookie-auth protection)
- 🔴 Webhook signature verification (scaffold exists, TODO to fill)
- 🟢 PII minimization in analytics
- 🟢 Encryption in transit (TLS via infrastructure)
- 🟢 Audit logging for sensitive operations
- ⚫ Export/delete workflow for privacy requests
- 🟢 No payment-card storage

---

## 12. Performance and reliability

> 🟡 **Implementation status — PARTIAL.** Error boundaries, lazy below-fold imagery in core product areas, no third-party marketing scripts, and non-blocking analytics failures are implemented. Measured mobile performance, font/image optimisation audit, monitoring/alerts, backups/restore plan, staging/sandbox release procedure, and payment/webhook reliability are **NOT STARTED** or **BLOCKED — production deployment and provider environment**.

- 🟢 Error boundaries on storefront
- 🟢 Lazy-loaded below-the-fold imagery
- 🟢 Minimal third-party scripts (none)
- 🟢 No blocking ad pixels
- 🟢 Resilient analytics (failure does not block checkout or browsing)
- ⚫ Core Web Vitals measurement (real mobile devices)
- ⚫ Error monitoring for storefront and API
- 🔴 Error monitoring for payment and webhooks (blocked — no live payment)
- ⚫ Uptime and webhook retry alerts
- ⚫ Backups and restore procedure
- ⚫ Staging/sandbox environment before production

---

## 13. Reporting cadence

> 🟡 **Implementation status — PARTIAL.** Owner/analyst staff can view seven-day consented event counts; owner/operations can see basic order/enquiry signals. Saved daily/weekly/monthly reports, payment/production/delivery metrics, funnel rates, completion timing, campaign analytics, and cohort/CAC reporting are **NOT STARTED** or **BLOCKED — live commerce, campaigns, and operational data**. CAC is **NOT APPLICABLE** until approved ad-spend data is connected.

### Daily

- 🟡 Visitors (raw event counts, no unique-visitor dashboard)
- 🔴 Paid orders
- 🔴 Payment failures
- ⚫ Checkout conversion rate
- ⚫ Top products
- 🟡 Open customer/stylist enquiries (visible in staff portal)
- 🟡 Orders awaiting atelier action (visible in staff portal)

### Weekly

- ⚫ Acquisition source performance
- ⚫ Product conversion by device
- ⚫ Funnel drop-off
- ⚫ Median completion time
- ⚫ Campaign retargeting performance
- ⚫ Blog traffic and assisted conversions
- 🔴 Refunds and cancellations

### Monthly

- ⚫ Cohort repeat purchase
- ⬜ Customer acquisition cost (not applicable until ad spend connected)
- 🔴 Revenue by product/category/source
- ⚫ First-touch versus last-touch attribution
- 🔴 Production lead time
- 🔴 Delivery performance
- ⚫ Policy/support issues affecting conversion

---

## 14. Build phases

> 🟡 **Implementation status:** Phase 0 is **BLOCKED — the exact external inputs listed in section 16**. Phase 1 is **PARTIAL foundation / BLOCKED activation**: persistence and safe gateway boundary exist, but hosted payment/webhooks are disabled. Phase 2 is **PARTIAL**: trust, draft policies, product explanations, and persisted enquiries exist; final policies/reviews/order tracking need inputs. Phase 3 is **PARTIAL**: consent and replay-safe first-party events exist; dashboards/time measurements/legal configurations are incomplete. Phase 4 is **PARTIAL**: real auth, RBAC, staff signals, Journal workflow exist; full operations/exports/privacy tools/notifications do not. Phase 5 is **PARTIAL**: Journal/route SEO foundations, Article JSON-LD, dynamic sitemap, collection pages, and AEO content exist; full structured-data breadth, authoritative editorial, Search Console, and CWV monitoring do not. Phase 6 is **NOT STARTED / BLOCKED — legal consent, approved ad providers, live payment state, and campaign operations**.

### Phase 0 — Decisions and contracts

> 🔴 **Status — BLOCKED — JusticeSure documentation/credentials, business operations decisions, approved policies, analytics legal basis, and approved staff roster.**

- 🔴 Obtain JusticeSure API and payment documentation.
- 🔴 Decide whether JusticeSure owns payment or a separate provider is needed.
- 🔴 Confirm SOSO prices, currencies, delivery areas, and production workflow.
- 🔴 Approve refund, return, cancellation, privacy, and cookie policies.
- 🟡 Select analytics and consent approach (first-party approach selected; legal review pending).
- 🔴 Confirm admin users and roles.

### Phase 1 — Commerce foundation

> 🟡 **Status — PARTIAL foundation / BLOCKED activation.** Data models, staff visibility, and a fail-closed gateway boundary are in place; live adapter, hosted session, verified webhook, paid status, and atelier follow-up require provider contract and operations.

- 🟡 Server-side JusticeSure/payment adapter (scaffold — TODO to fill)
- 🔴 Hosted secure payment session
- 🟡 Verified webhooks and idempotency (scaffold — TODO to fill)
- 🟡 Persist orders, payments, customers, and production status (schema exists; no live data)
- 🔴 Payment success/failure/pending pages
- 🔴 Post-payment atelier follow-up workflow

### Phase 2 — Trust and conversion

> 🟡 **Status — PARTIAL.** Draft policy hub/footer, product payment-first/trust information, and persisted stylist enquiries are implemented. Final publication, real reviews/customer imagery, payment confirmation/tracking, and approved support workflow remain blocked or not started.

- 🟡 Publish policy pages (draft; pending legal approval)
- 🟢 Footer trust navigation (Journal, collections, About, FAQ, policies)
- 🟢 Visible product-page payment, delivery, returns, and made-to-order explanations
- 🔴 Real reviews/customer imagery (only when available)
- 🔴 Order confirmation and tracking
- 🟢 Stylist enquiry persistence and response workflow

### Phase 3 — Consent and analytics

> 🟡 **Status — PARTIAL.** Consent manager, server consent records, consent-gated first-party events, version/session/event IDs, deduplication, and staff funnel counts are implemented. Quality dashboard, active-time, full journeys, and legally approved third-party tools are incomplete.

- 🟢 Consent manager
- 🟢 First-party event collection
- 🟡 Event schema and data-quality checks (schema complete; quality checks partial)
- ⚫ Core funnel and journey dashboards (raw counts only)
- ⚫ Active-time and completion-time measurements
- 🔴 Approved analytics tools (pending consent/legal configuration)

### Phase 4 — Admin portal

> 🟡 **Status — PARTIAL.** Clerk + database role gate, least-privilege read surfaces, Journal workflow, audit/revision foundations, and basic signals are implemented. Complete orders/payments/production workflows, exports, privacy tools, and notifications need commerce/operations design.

- 🟢 Authentication and role-based access
- 🟡 Orders, payments, production, enquiries screens (basic; no live data)
- 🟢 Analytics event counts (partial funnel)
- 🟢 Journal content management
- 🟡 Policy pages (routes exist; no CMS)
- 🟢 Audit screens (foundation)
- ⚫ Exports and privacy request tools
- ⚫ Operational notifications

### Phase 5 — SEO, AEO, GEO, and editorial

> 🟡 **Status — PARTIAL.** Route metadata, canonical configuration, multiple JSON-LD schemas, public Journal, policies, dynamic sitemap, collection pages, FAQ with FAQPage schema, and AEO copy exist. Approved initial editorial, Search Console, full content monitoring, and CWV are incomplete or blocked by production/content inputs.

- 🟢 Technical SEO (route metadata, canonical, clean slugs, 404)
- 🟢 Structured data (Organization, WebSite, Product, Offer, Breadcrumb, Article, FAQ)
- 🟡 Sitemap (dynamic endpoint implemented; requires `PUBLIC_SITE_URL` and `VITE_ENABLE_INDEXING`)
- 🔴 Initial authoritative editorial articles
- 🟡 FAQ and answer blocks (10 items; pending approved facts)
- 🟢 Internal links and local/Abuja authority signals
- ⚫ Search Console verification and monitoring
- ⚫ Core Web Vitals monitoring

### Phase 6 — Retargeting and optimization

> ⚫ **Status — NOT STARTED / BLOCKED — legal consent configuration, approved ad integrations, payment status, campaign operations, and sufficient consented traffic.**

- ⚫ Define consent-safe audiences
- ⚫ Add campaign UTM governance
- ⚫ Add approved ad pixels behind consent controls
- 🔴 Exclude paid customers and apply frequency caps
- ⚫ Build campaign dashboards and landing-page experiments
- ⚫ Optimize from measured drop-off, not assumptions

---

## 15. Launch gates

> 🔴 **Implementation status — NOT READY FOR PRODUCTION COMMERCE.** Auth/RBAC foundation, consent-gated event ingestion, rate limiting, same-origin write protection, draft-policy visibility, and safe disabled payment behavior are verified. Real payment/webhook/order/atelier gates, final policies, real payment-funnel validation, regional consent/legal approval, marketing-pixel configuration, sitemap/indexability validation, device accessibility review, security review, backups, incident process, support process, and production deployment verification remain **BLOCKED** or **NOT STARTED**.

Do not call the site fully functional until all of the following are true:

- 🔴 Real payment can be completed in sandbox and production.
- 🔴 Payment webhooks are verified and idempotent.
- 🔴 Paid orders reach SOSO/JusticeSure operations.
- 🔴 Atelier follow-up is assigned and trackable.
- 🔴 Refund, return, cancellation, delivery, privacy, cookie, and terms pages are published and accurate.
- 🟢 Admin access is authenticated and role-restricted.
- ⚫ Analytics funnel events are validated against real test journeys.
- ⚫ Checkout and payment events distinguish failure, abandonment, and success.
- 🔴 Consent behavior is documented and legally reviewed.
- 🔴 Marketing pixels do not fire outside the approved consent/legal configuration.
- 🟡 Sitemap, robots, canonical, metadata, structured data, and redirects pass validation (sitemap exists; robots sitemap URL and production canonical pending domain).
- 🔴 Blog and policy pages are indexable only when complete (gated by `VITE_ENABLE_INDEXING`).
- ⚫ Mobile checkout passes on real supported devices.
- ⚫ Accessibility review covers keyboard use, focus, labels, contrast, and consent controls.
- ⚫ Security review covers authentication, webhooks, PII, rate limiting, and secrets.
- ⚫ Backup, incident, payment-failure, and support procedures are documented.

---

## 16. Open inputs SOSO must provide

> 🔴 **Implementation status — BLOCKED external inputs.** Items 1–3 (JusticeSure and payment) are required before live commerce; items 4–7 (official catalog, delivery/policies, support details) are required before factual product and policy publication; items 8–9 (brand/review/press permissions) are required before authority claims; item 10 is required to seed real staff roles; item 11 is required before consent/retention/marketing release; item 12 is required before production SEO/social publishing.

To move from blueprint to implementation, SOSO needs to provide:

1. 🔴 JusticeSure headless API documentation and sandbox access.
2. 🔴 Confirmation of whether JusticeSure handles payment or only operations.
3. 🔴 Chosen payment methods and settlement currency.
4. 🔴 Official product, price, size, material, and finish data.
5. 🔴 Actual delivery regions and production-time rules.
6. 🔴 Approved refund, return, cancellation, and made-to-order policies.
7. 🔴 Official support email, phone, WhatsApp number, and business address.
8. 🔴 Approved brand/atelier story and editorial facts.
9. 🔴 Real reviews, customer images, press mentions, and usage permissions.
10. 🔴 Admin staff list and permissions.
11. 🔴 Legal/privacy review for cookies, analytics, remarketing, and data retention.
12. 🔴 Production domain and final social-sharing image.

Until these inputs are available, the storefront can be polished and instrumented, but it should not pretend to be a live payment or fulfilment system.
