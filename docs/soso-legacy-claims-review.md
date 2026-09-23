# SOSO legacy business-claims review

Review date: **1 September 2026**  
Scope: all 7 migrated About pages and 14 migrated journal articles.

## Approval rule

A migrated route may be indexed only when its machine-readable editorial record is `approved`. Source preservation alone is not evidence for a statistic, market forecast, customer outcome, partnership, programme result, or future commercial commitment.

The original WordPress URL supports provenance and comparison with the archived wording. It does not independently substantiate a claim. Where no separate approved evidence was available, the claim was removed, changed to clearly attributed historical narrative, or qualified as an ambition, possible service, or confirmation-dependent proposal.

## About pages

| Page | Claim classes reviewed | Decision | Editorial status |
|---|---|---|---|
| Our Story | Founding timeline; registration; training and beneficiary outcomes | Attribute the 2018 date to the archived brand account; remove unverified totals and business-launch outcomes | Approved |
| The Architect of the Modern Man | Brand reach and positioning | Treat as brand philosophy, not measured market leadership | Approved |
| The Client | B2B services; NGO/training partnerships | Describe capabilities as subject to a confirmed brief and written terms; describe partnerships as enquiries | Approved |
| Craftsmanship | “Best” materials; global mills; durability | Remove absolutes and unverified sourcing geography; state bounded selection criteria and defer specifics to product details | Approved |
| Legacy & Vision | Continental presence; four-season release timeline; annual showcase | Treat geography as ambition; make releases and events confirmation-dependent rather than guaranteed | Approved |
| The SOSO Foundation | Beneficiary totals; training, employment, startup, starter-kit and education outcomes | Remove unverified totals and individual outcomes; attribute historical programme descriptions and qualify current availability | Approved |
| Partner With Us | Four market statistics; 2034 projection; $500B target; first-mover/scalability claims; investment, franchise and distribution offer | Remove all figures and investment-performance positioning; replace with a non-binding collaboration enquiry and explicit disclaimer | Approved |

## Journal articles

The following articles were reviewed as first-party collection narrative, opinion, trend commentary, and styling guidance. None is approved as evidence of market size, investment performance, an existing partnership, a guaranteed product result, or a guaranteed commercial outcome.

- Into the Process: Koles Collection
- The Abuja Man: Koles Collection
- Modern Kaftan Styles for Men in Abuja
- The Rise of the Abuja Gentleman
- Dashiki for the Modern African Man
- How the Abuja Man Is Redefining Native Wear
- The Grey Italian Wool Kaftan
- Abuja: Modern Menswear Hub
- The D.O. Capsule
- Spring/Summer African Modern Kaftan Collection
- Modern Kaftans Beyond Traditional Wear
- Modern Men’s Two-Piece Sets
- The Rise of Minimalist African Luxury Fashion
- How to Style Black Traditional Outfits

All 14 are editorially approved with the qualification above. The exact slug-level records, review date, evidence pointers, and decisions are exported from the legacy content module and tested as the indexing source of truth.

## Indexing control

- About and legacy journal detail routes require both slug-level approval and an exact match to the approved content revision.
- The crawler-facing SEO generator applies the same revision check, emits approved About pages, and refuses to let an edited CMS article inherit a migrated slug's approval.
- Missing or pending records produce `noindex, follow` and omit canonical and page structured data.
- Global storefront indexing remains a separate release gate. Editorial approval cannot override a closed global gate.