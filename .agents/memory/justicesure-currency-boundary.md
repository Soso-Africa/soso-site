---
name: JusticeSure currency boundary
description: Durable activation rule for non-NGN prices and country-based checkout localization.
---

JusticeSure inventory supports multi-currency, including FX-linked pricing. Currency discovery and quote FX metadata do not by themselves authorize non-NGN checkout: require original charge/refund money to be consistently recoverable across all surfaces and every approved country/currency pair to pass staging.

**Why:** Later handoffs added discovery and quote-level display/charge/settlement currencies while retaining NGN order/status and kobo refund fields. A canonical NGN ledger is not proof of original customer charge currency, and display capability is not merchant payment readiness. A Test simulator can advertise an eligible NGN method for a foreign country/currency query while the merchant readiness matrix disables every currency; the method's actual charge currency and merchant activation are separate checks. Handoffs can change while retaining the same OpenAPI version; retain checksum identity when reviewing them.

**How to apply:** Build a currency-aware foundation but activate NGN first; this is not a choice between an NGN-only product and immediate multi-currency activation. Reject non-NGN catalogue, quote, order, and status payloads until the revised contract is implemented and the exact merchant country/currency row is enabled with provider-backed proof; reject unsupported webhook versions; keep browser pricing NGN-only for now. Do not describe the underlying inventory as incapable—describe headless provisioning as pending.