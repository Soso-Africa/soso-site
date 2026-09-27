# JusticeSure v3.8 live assessment

Initially reviewed 20 September 2026; live merchant checks repeated 26 September 2026 against `https://justicesure.ai/api/v1/commerce`.

## Decision

**Blocked by JusticeSure merchant-account evidence and non-NGN provider qualification.**

The v3.8 source contract is more complete, and SOSO now has account-owned Test keys and callback secrets stored securely. The merchant store and readiness endpoint are now available, but the live merchant matrix disables every requested currency. Test payment discovery offers only simulated NGN card payment, which is not provider-backed acceptance.

## Publication integrity

- Published handoff: v3.8 dated 15 September 2026
- Published ZIP SHA-256: `c9e66e4b8d8bb48f05ecb110fe53d3e3e3afb57084ca219908f18354c63f0a2f`
- Downloaded ZIP matched the published checksum
- All fifteen files named by the package checksum manifest verified
- Published production commerce base URL: `https://justicesure.ai/api/v1/commerce`
- Published OpenAPI version: 1.0.0

The live OpenAPI and handoff OpenAPI are not byte-identical:

- live OpenAPI SHA-256: `548857a87191ecf45b83e27ff1c56b27a27803ab4be200ab4dfd0ab4ec9ebb1f`
- handoff OpenAPI SHA-256: `8b8e26c0b4bae214f132579a0649c0ce29b5360b06171289b06467d6027e4649`

The public documentation originally said runtime/source parity was pending. A later merchant `/readiness` response now reports an observed build and schema. This is not provider qualification or proof that a non-NGN charging row is enabled.

## Historical Test-tenant result — 20 September

The Test key authenticated successfully against global currency discovery. The same key received `STORE_UNAVAILABLE` for:

- `/readiness`
- `/store`
- `/locations`
- `/categories`
- `/products`
- `/payment-methods`
- `/fulfillment-corridors`

The returned reason was: “The online store is disabled or has not been configured.”

The merchant subsequently enabled the Test online store; this failure no longer describes its current state.

## Latest Test-tenant result — 26 September

`/readiness`, `/store` and `/payment-methods` all return HTTP 200 using the scoped Test key. `/readiness` identifies `commerce-readiness-v1`, reports `deploymentState: observed`, `deploymentReasonCode: RUNTIME_BUILD_AND_SCHEMA_OBSERVED`, and `schema.ready: true`. The store is configured for NGN and pickup.

`/payment-methods` reports Paystack `eligible: true`, `methods: ["card"]`, `chargeCurrencies: ["NGN"]`, `settlementCurrencies: ["NGN"]`, `simulated: true`, and `environment: "test"`. This is first-party Test simulation, **not** a real Paystack charge or refund. Country/currency queries for `NG/NGN`, `GB/GBP`, `US/USD`, and `GH/GHS` all return that same NGN-only simulator row; callers must verify charge currency against the requested currency and refuse a mismatch.

The live readiness matrix remains disabled for all nine currencies. NGN has `activationReasonCode: EXACT_MERCHANT_ACCOUNT_EVIDENCE_REQUIRED`; merchant-account readiness is unknown, as are fees, taxes/duties, delivery, settlement, refunds, amount limits and restrictions. GBP, USD, EUR, GHS, KES, ZAR, XOF and XAF have `activationReasonCode: PAYSTACK_INITIAL_LAUNCH_NGN_CARD_ONLY`, no approved shopper countries, and unknown merchant policies. Do not infer merchant activation from a global currency registry or simulated payment availability.

## Production-key and SOSO site recheck — 27 September

The already-configured non-Test JusticeSure key returns `commerce-readiness-v1` with an observed runtime and schema-ready result. **Its NGN/NG Paystack card row is now `enabled` / `ELIGIBLE`**, and payment discovery offers NGN charge and settlement through Paystack. This is a separate merchant environment from the Test key above, whose NGN readiness is still disabled. All eight requested non-NGN rows remain `disabled` / `PAYSTACK_INITIAL_LAUNCH_NGN_CARD_ONLY` for the non-Test key as well. The NGN readiness row still reports fee, tax/duty and fulfilment quote facts as unknown until quoted; its refund policy value is `none`. Do not infer a partial/full refund capability from the enabled NGN charging row.

Before the 27 September release, `/api/readyz` succeeded, but `/api/payment/catalog` and `/api/payment/locations` returned 503 with `noPaymentTaken: true`. An unsigned POST to the registered `/webhook/commerce` returned 405 at the host; the existing `/api/payment/webhook` returned 503 because the production Commerce gate also blocked webhook reception. These are historical observations, not the current published endpoint results. The subscription must not be reactivated until a published signed-event test confirms the receiver.

Additional read-only Live checks show 25 catalogue products, one pickup location, **pickup as the only store fulfilment option**, and no delivery corridors. SOSO's current checkout form sends delivery requests only. Therefore enabling its existing payment configuration alone would not establish a working NGN purchase: the shopper flow needs a pickup choice and an accepted end-to-end order/session test. The store profile also lists no payment methods despite separate Paystack payment-method discovery reporting eligible; confirm the exact order/session behavior rather than treating discovery as a completed payment.

## SOSO integration preparation — 27 September

SOSO now prepares a pickup-only shopper flow using the real published location ID and blocks submission when that location is unavailable. Its API separates read-only Commerce access and signed webhook verification from the explicit checkout-write activation switch, and checks variant-level NGN prices, order amounts, and hosted-session original-charge amounts before redirecting. Development checks with checkout writes disabled returned HTTP 200 for the 25-product catalogue and one pickup location, HTTP 401 for an unsigned webhook, and HTTP 503 for an attempted checkout write. The Vercel production project has the existing sensitive API key and signing secret; the non-secret base URL, Paystack provider, return URL, and **disabled** readiness switch have been added for its next deployment. These are development and configuration checks, **not** a published signed webhook or a real payment.

JusticeSure and SOSO catalogue owners must agree on at least one real, small, in-stock NGN product and its variant, media, and authoritative price before a shopper can complete a representative purchase. Test tenant NGN remains disabled, so staging charge/webhook acceptance is still unavailable. Do not fabricate a matching product, variant, price, or image.

## Published read-only release — 27 September

The current GitHub mainline contains a newer, currency-aware quote/discovery/payment-recovery path than this Replit workspace checkout. The older local checkout edits were **not** published, to avoid replacing those protections. A narrow pull request against the current GitHub mainline passed the required Vercel check and was merged and deployed. The production-only sensitive API key and signing secret were already configured; the non-secret Commerce URL, Paystack preference, return URL and `JUSTICESURE_COMMERCE_RUNTIME_READY=false` were set separately. No Vercel key re-entry is required.

On `https://shopsoso.co`, authenticated read-only catalogue, pickup locations, and NGN discovery now return HTTP 200; an unsigned POST to the registered `/webhook/commerce` returns HTTP 401, not 405. These checks prove the deployed API can read Commerce and has a signing secret configured; they do **not** prove a valid signed delivery or completed payment. The paginated catalogue contains 84 products, only one with any in-stock variants, and none with media. All 18 currently published SOSO storefront products still lack Commerce product/variant mappings. Checkout writes and the browser headless-commerce mode remain off. The site cannot yet offer a trustworthy purchase link.

## Currency evidence

Global `/currencies` metadata currently reports:

| Currency | Exponent | Display | Global charge metadata | Global settlement metadata |
| --- | ---: | --- | --- | --- |
| NGN | 2 | yes | yes | yes |
| GBP | 2 | yes | yes | yes |
| USD | 2 | yes | yes | yes |
| EUR | 2 | yes | yes | yes |
| GHS | 2 | yes | no | no |
| KES | 2 | yes | no | no |
| ZAR | 2 | yes | no | no |
| XOF | 0 | yes | no | no |
| XAF | 0 | yes | no | no |

Global metadata is not merchant activation. The current live merchant activation matrix disables every row:

- NGN: disabled because exact merchant-account evidence is required.
- GBP, USD, EUR, GHS, KES, ZAR, XOF and XAF: disabled because the Paystack initial launch is NGN-card-only.

No non-NGN currency is currently approved for SOSO charging. Display support must not be interpreted as payment support.

## Provider evidence

The v3.8 acceptance record reports:

- overall status `blocked_before_charge429`;
- first-party Test acceptance `not_executed_in_this_release`;
- Paystack qualification stopped on HTTP 429 before the first charge;
- no provider charge, refund, signed callback, settlement or merchant qualification result; and
- no Live acceptance or production readiness.

The required qualification still includes two independent NGN sandbox charges, a partial refund, a full refund, signed callback reconciliation and exact account/deployment binding.

## Required JusticeSure actions

The merchant Test store and runtime identity are now available. JusticeSure must still:

1. Complete **exact merchant-account** Paystack Sandbox qualification and resolve the provider HTTP 429 if it recurs; provide auditable charge, signed callback, partial/full refund and status reconciliation evidence.
2. Approve and publish merchant-specific fees, taxes/duties, delivery, settlement, refunds, amount limits and restrictions; show an `enabled` NGN readiness row only after these facts and provider evidence are established.
3. Publish real supported country/currency/provider/method combinations for GBP, USD, EUR and each requested African currency (or explicitly confirm they remain unsupported), with governed price-list or FX rules and provider-backed charge/refund evidence.
4. Ensure currency-specific discovery does not imply a GBP/USD/GHS payment when the actual hosted Test charge would be NGN.
5. Supply a version-identifiable handoff matching the deployed runtime plus the evidence needed to reconcile catalogue, variant, quote, order, hosted session, webhook, cancellation, status and refunds in exact original-charge minor units.

## SOSO boundary

Until the provider actions above are complete:

- do not alter the current NGN-only storefront contract;
- do not show currency selection or country-derived prices;
- do not interpret global `chargeSupported` metadata as merchant readiness;
- do not activate a hosted payment route; and
- continue failing closed when JusticeSure is unavailable or returns a different currency.