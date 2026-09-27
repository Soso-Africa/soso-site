# JusticeSure multi-currency decision

## Current review — 26 September 2026

The public JusticeSure developer site and checksum-valid v3.8 handoff dated 15 September are the controlling review. See [v3.8 live assessment](justicesure-v3.8-live-assessment.md).

**Decision:** multi-currency activation is not approved. The SOSO Test store and deployed readiness endpoint now respond, and Paystack is eligible for **simulated NGN card** checkout in Test mode. The merchant readiness matrix still disables NGN pending exact merchant-account evidence and explicitly disables all eight requested non-NGN currencies. Discovery for foreign country/currency queries still returns an NGN-only simulator, not a foreign-currency charge. SOSO must stay NGN-only and fail closed.

Task 15 remains open for full implementation. JusticeSure must supply approved country/currency/provider rows, operational money policies, and provider-backed payment/refund evidence before SOSO can safely implement shopper localization.

**27 September production-key update:** the separate non-Test key now reports an enabled NGN/NG Paystack card row, but still disables all eight non-NGN currencies. The published SOSO checkout and registered webhook are not yet ready for an NGN live launch; see the [v3.8 live assessment](justicesure-v3.8-live-assessment.md). An NGN launch does not satisfy this task's multi-currency acceptance criteria.

## Historical reviews

- [v3.3 contract assessment](justicesure-v3.3-currency-assessment.md)
- [v3.6 contract assessment](justicesure-v3.6-currency-assessment.md)

**Decision date:** 25 August 2026
**Decision:** JusticeSure's inventory supports multi-currency, but the supplied Headless Commerce v1 contract has not yet provisioned that capability for SOSO. SOSO remains NGN-only until the headless API exposes and documents authoritative currency selection.

## Evidence reviewed

The provider handoff in `attached_assets/SOSO_JusticeSure_Headless_Commerce_Handoff_v2.1_(1)_1787568064030.zip` is internally checksum-valid.

| Evidence | Version | SHA-256 |
| --- | --- | --- |
| Handoff | 2.1, updated 22 August 2026 | `002e2fa86e068dfcddfb1c2997f8318460ae46db8523df343b813305ddd85b0e` |
| OpenAPI contract | Commerce API 1.0.0 | `575ad9486bf20b24064d81ca3fc14f58b44a04bc85e2d492bf561815dd74ab89` |
| Webhook envelope | `2025-01-01` | Declared by the checksum-verified OpenAPI contract |

The August handoff is versioned and documents secure, server-only credential transfer. It intentionally contains no credentials. At the time of that review, no sandbox key or webhook secret had been configured, so no staging payment was attempted. Test and Live credentials were subsequently configured securely; their later readiness results are recorded in the [v3.8 live assessment](justicesure-v3.8-live-assessment.md).

JusticeSure's broader capability record in `attached_assets/0_00_Full_Justicsure_build_and_differentiation_1787243057576.md` confirms FX-linked pricing, per-currency expenses, and multi-currency rollups. The gap is therefore not inventory capability; it is the absence of multi-currency fields, provisioning rules, and settlement guarantees in the supplied headless Commerce contract.

## Confirmed currency and country matrix

| Shopper country | Currency | Contract status | Charge/settlement status | SOSO activation |
| --- | --- | --- | --- | --- |
| Nigeria | NGN | The only currency represented by the contract. Product prices and orders are fixed to `NGN`; all amounts are integer kobo. | Hosted Paystack or Flutterwave payment is documented, but merchant settlement, fees, and an end-to-end sandbox payment remain unverified without the separately provisioned staging account. | Remain fail-closed until the existing NGN launch acceptance gate passes. |
| United Kingdom | GBP | Supported by JusticeSure inventory capability, but not exposed by the supplied headless contract. | Headless charge and settlement behavior not yet provisioned or confirmed. | Blocked until the revised API contract and staging pass. |
| United States | USD | Supported by JusticeSure inventory capability, but not exposed by the supplied headless contract. | Headless charge and settlement behavior not yet provisioned or confirmed. | Blocked until the revised API contract and staging pass. |
| Euro-area countries | EUR | Multi-currency inventory capability exists, but EUR is not exposed by the supplied headless contract. | Headless charge and settlement behavior not yet provisioned or confirmed. | Blocked until the revised API contract and staging pass. |
| Ghana | GHS | Multi-currency inventory capability exists, but GHS is not exposed by the supplied headless contract. | Headless charge and settlement behavior not yet provisioned or confirmed. | Blocked until the revised API contract and staging pass. |
| Kenya | KES | Multi-currency inventory capability exists, but KES is not exposed by the supplied headless contract. | Headless charge and settlement behavior not yet provisioned or confirmed. | Blocked until the revised API contract and staging pass. |
| South Africa | ZAR | Multi-currency inventory capability exists, but ZAR is not exposed by the supplied headless contract. | Headless charge and settlement behavior not yet provisioned or confirmed. | Blocked until the revised API contract and staging pass. |
| West African CFA franc countries | XOF | Multi-currency inventory capability exists, but XOF is not exposed by the supplied headless contract. | Headless charge and settlement behavior not yet provisioned or confirmed. | Blocked until the revised API contract and staging pass. |
| Central African CFA franc countries | XAF | Multi-currency inventory capability exists, but XAF is not exposed by the supplied headless contract. | Headless charge and settlement behavior not yet provisioned or confirmed. | Blocked until the revised API contract and staging pass. |
| All other countries/currencies | Any non-NGN ISO currency | Inventory capability may exist, but the provider supplied no headless supported-country or settlement-currency matrix. | Not confirmed. | Blocked. SOSO must not imply that every African currency is available. |

The contract does not publish a country-eligibility matrix. Nigeria/NGN is therefore the only implementation-shaped path, not a claim that every Nigerian payment method, card issuer, or settlement route has passed staging.

## Contract trace

| Stage | Currency and amount evidence | Result |
| --- | --- | --- |
| Catalogue and variants | Product `price.currency` is constant `NGN`; `amountKobo` is an integer. Variant selection is repriced by JusticeSure. | NGN-shaped only. |
| Delivery quote | Example response carries `currency: NGN`, integer `cartSubtotalKobo` and `feeKobo`, and a short-lived signed quote token. | NGN-shaped only. |
| Order | Order `currency` is constant `NGN`; subtotal, discount, tax, delivery, total, paid, outstanding, and refunded fields are integer kobo. | NGN-shaped only. |
| Hosted payment session | The response carries provider, reference, and hosted URL, but no currency or amount. JusticeSure states that it owns the provider amount. | Cannot independently prove session money consistency from the API response alone. |
| Status and recovery | `GET /orders/:orderId` is authoritative after redirect, retry, webhook delay, or SOSO downtime. | Currency is recoverable from the NGN order. |
| Webhook | Money-bearing events use kobo fields and the `2025-01-01` envelope, but event data is only a notification; SOSO re-fetches the order. | No independent multi-currency contract. |
| Cancellation | There is no Commerce cancellation mutation. Merchant action occurs in JusticeSure and SOSO re-fetches the order after notification. | Original NGN order remains authoritative. |
| Refund | There is no Commerce refund mutation. Order status exposes refunded kobo and SOSO re-fetches the order after notification. | Original NGN order remains authoritative. |

## Operational rules confirmed

- JusticeSure, not SOSO, owns catalogue prices, variant repricing, stock, delivery fees, order totals, payment verification, cancellation, refunds, and fulfilment.
- SOSO must never submit or calculate a customer price.
- Order and payment-session creation use separate persisted idempotency keys. Exact retries reuse the original keys and payment session.
- A provider redirect is never proof of payment. Authoritative status comes from `GET /orders/:orderId` and signed webhooks.
- Delivery quotes expire and bind the normalized address, cart/store, and server-calculated amount.
- Paystack and Flutterwave are the only provider names in the supplied contract. Provider credentials remain inside JusticeSure.
- The handoff does not define local price lists, exchange-rate sources, rate refreshes, FX rounding, FX expiry, or missing-rate behavior because it defines no converted currency.
- The handoff does not provide country-specific tax, duty, delivery restriction, provider fee, merchant settlement, or refund-settlement rules.

## Staging acceptance outcome

Multi-currency staging cannot begin because the current headless contract has no non-NGN money model, provisioning input, or supported-country/currency matrix. GBP, USD, EUR, GHS, KES, ZAR, XOF, XAF, and every other non-NGN path therefore remain fail-closed in SOSO until JusticeSure provisions them through a revised contract.

NGN staging still requires the separately transferred staging API key, webhook secret, test business/catalogue/location IDs, configured sandbox merchant gateway, approved public webhook URL, and payment-return URL. Those inputs belong to the existing JusticeSure v1 launch gate and are not evidence of multi-currency support.

## Activation boundary

Current activation rules:

1. Keep storefront analytics, catalogue projection, checkout display, API responses, persisted orders, and payment return formatting NGN-only.
2. Reject a catalogue, quote, order, or status payload whose currency is not exactly `NGN`.
3. Reject webhook envelopes whose API version is not `2025-01-01`; use the event only to trigger an authoritative order refresh.
4. Keep `JUSTICESURE_COMMERCE_RUNTIME_READY` false until the separate NGN staging gate passes.
5. Do not add country detection, a currency selector, browser FX conversion, or non-NGN marketing claims.

Before this decision can change, JusticeSure must publish a new versioned contract and supported-country matrix that:

- uses an ISO 4217 currency on catalogue, variant, quote, order, payment session, status, webhook, cancellation, and refund payloads;
- uses a currency-neutral integer minor-unit field and defines each currency's exponent;
- identifies governed price-list versus converted-price ownership;
- defines the authoritative rate source, refresh time, rounding, expiry, and unavailable-rate failure;
- documents provider availability, fees, taxes, duties, delivery restrictions, settlement, and refund settlement by country/currency;
- guarantees idempotent retries and callbacks preserve the original currency and totals; and
- passes full staging reconciliation for NGN, GBP, USD, EUR, and every approved African currency before SOSO displays any of them.