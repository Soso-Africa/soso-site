---
name: JusticeSure v1 activation gate
description: Safety rule for enabling the JusticeSure Commerce integration after its staged v1 runtime is available.
---

Keep JusticeSure Commerce fail-closed until the matching published v1 runtime, scoped server-only Commerce credentials, webhook secret/endpoint, merchant catalogue and stock, provider selection, and approved HTTPS return URL have been staged and exercised together.

**Why:** The supplied contract arrived before the public runtime update. Enabling against an older deployment, without replay-safe webhook delivery, or without the provider return path verified would create payment and fulfilment risk.

**How to apply:** Treat a runtime-ready configuration flag as an activation decision, not a development convenience. Before turning it on, run a staged order/session idempotency retry, delivery quote, provider return/status recovery, signed webhook replay/retry, and verified-paid-order acceptance test. Never mark an order paid from a browser redirect.

Resolve referenced OpenAPI components before declaring a provider response undocumented; use the replacement handoff rather than older starter examples.

**Why:** The corrected handoff supplies success schemas through references while the accompanying starter client still demonstrates older flows. Treating those examples as the complete contract leads to incorrect quote bindings.

**How to apply:** Keep internal immutable quote snapshots separate from customer-safe projections, and test binding using actual resolved provider field names. Recovery operations need provider-issued payment-attempt identifiers; never invent them from payment references.

Treat the account-owned synthetic Test flow as available only when the published contract includes its Test payment-session response and returned attempt ID, not merely when the Commerce contract URL responds.

**Why:** The v3.6 handoff describes a source candidate while the published contract can still expose the earlier provider-oriented surface under the same API version.

**How to apply:** Compare the published contract with the replacement handoff before onboarding. If Test session schemas, simulation routes, or the session `data.attemptId` are absent, report rollout pending and do not request Test credentials.

Keep current, available catalogue records, standard sizes, and size guidance discoverable even when they do not yet have authoritative JusticeSure mappings. Disable offers and purchase controls rather than hiding useful catalogue facts or inventing a mapping.

**Why:** Editorial/catalogue availability and checkout eligibility are separate truths. Conflating them either empties useful shopping pages or risks exposing an unsafe payment path.

**How to apply:** Collections, size selectors, and size guides may use governed catalogue fields. Product offers, Cart actions, checkout, and campaign claims of purchasability must use the stricter mapped-product and eligible-variant predicate.

JusticeSure account-owned Test mode is not a live-provider emulation. Its synthetic catalogue may omit images and variants, its sample fulfilment can be pickup-only, and its hosted session returns `provider: simulated`.

**Why:** Acceptance against the published Test workspace showed these valid contract shapes. It also showed that Test attempts reject live-provider verify/reconcile calls and that created/replayed Test resources can omit the otherwise-required idempotency replay header.

**How to apply:** Keep Test credentials development-only. Advance Test payments through the authenticated simulator, then read the authoritative order; reserve verify/reconcile for live providers. Never invent missing provider IDs, and accept omitted replay metadata only for an unambiguous `201` creation or an explicit simulated Test session carrying durable returned identifiers.