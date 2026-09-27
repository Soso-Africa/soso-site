# JusticeSure v3.6 multi-currency assessment

Reviewed 14 September 2026.

## Decision

**Confirmed fail-closed no-go for non-NGN checkout.**

The v3.6 package is sufficient to make the activation decision unambiguous, but not to activate multi-currency. SOSO must continue to display and accept only authoritative NGN amounts. Country detection, currency selection, estimated FX display and non-NGN checkout remain blocked.

This is an interim negative activation result. It does not complete the requested multi-currency implementation or certify JusticeSure for multi-currency payments. Task 15 remains open pending the [JusticeSure provider completion request](justicesure-v3.6-provider-request.md).

## Evidence identity and integrity

- Archive: `attached_assets/SOSO_JusticeSure_Headless_Commerce_Handoff_v3.6_2026-09-13_1789359997433.zip`
- Archive SHA-256: `74176cdd2280d170015d5a8a316d60b7a7cbd60eec4610ef2e6ac19391f688bd`
- Package: v3.6, prepared 13 September 2026
- OpenAPI `info.version`: 1.0.0
- All thirteen entries named by `SHA256SUMS.txt` verified

The archive contains no credentials. Test keys and callback secrets are to be issued once inside the merchant's authenticated JusticeSure account and stored directly in SOSO's backend secret manager.

## Contract progress since v3.3

The candidate contract now models important original-money facts:

- `OriginalCharge` identifies exact charge money and component amounts using ISO currency, integer-string minor amounts and a minor-unit exponent.
- Quotes expose canonical NGN accounting separately from display, charge and settlement currencies.
- Orders require `originalCharge` in addition to the legacy NGN/kobo accounting projection.
- Payment and cancellation events include `originalCharge`.
- Refund events include `actualReturnedMoney`, with refund and original-payment linkage fields. Legacy/unlinked records may explicitly report returned money as unknown.
- `chargeCurrency` is explicit opt-in and defaults to NGN when omitted. `displayCurrency` is estimate-only.
- Order/session idempotency, signed callback recovery, quote expiry, payment readiness and verify/reconcile boundaries are documented.

These are acceptable source-contract inputs for a future integration. They do not prove that a merchant payment account can charge or refund any listed non-NGN currency.

## Provider capability matrix

| Currency | Display/runtime claim | Test evidence | Delivery/provider evidence | Production |
| --- | --- | --- | --- | --- |
| NGN | Runtime supported | Limited synthetic default-pickup flow observed; simulated discovery HTTP-tested | Non-pickup untested; external provider unavailable or untested | Pending schema release and merchant readiness |
| GBP | Runtime display supported | Simulated first-party coverage pending | Unavailable or untested | Pending |
| USD | Runtime display supported | Simulated first-party coverage pending | Unavailable or untested | Pending |
| EUR | Runtime display supported | Simulated first-party coverage pending | Unavailable or untested | Pending |
| GHS | Runtime display supported | Explicit unsupported or simulated result still required | Unavailable or untested | Pending |
| KES | Runtime display supported | Explicit unsupported or simulated result still required | Unavailable or untested | Pending |
| ZAR | Runtime display supported | Explicit unsupported or simulated result still required | Unavailable or untested | Pending |
| XOF | Runtime display supported | Explicit unsupported or simulated result still required | Unavailable or untested | Pending |
| XAF | Runtime display supported | Explicit unsupported or simulated result still required | Unavailable or untested | Pending |

For every row, external provider qualification is marked optional and unexecuted. Display support is therefore not charge, settlement or refund support.

## Acceptance findings

The provider labels the result `limited_first_party_test_acceptance_observed`. The observed evidence covers an account-owned synthetic tenant:

- Test tenant, key and callback lifecycle
- Revoked-key rejection
- Synthetic default-pickup quote, order and hosted session
- Simulated payment success
- Synthetic partial and full refund behavior
- Stable same-refund replay and rejection above the remaining balance

The package explicitly says this does not establish:

- external provider readiness or approval;
- provider transaction or refund evidence;
- settlement;
- merchant production readiness;
- deployment; or
- source-to-deployed production parity.

External provider qualification is `optional_and_unexecuted`. Production migration is `pending_approved_release_and_merchant_decision`, and production schema/release v319 remains pending.

The supplied external acceptance harness is also internally versioned as v3.5: its types, assertions, example configuration and evidence validation require package version `3.5`. Its README expects an incomplete exit until an authorized operator supplies provider-sandbox callbacks. No executed provider acceptance result is included.

## Activation boundary

1. Retain SOSO's exact-NGN catalogue, quote, order, status and webhook guards.
2. Do not interpret `displayCurrency` as a payable currency.
3. Do not add shopper country detection or a currency selector.
4. Do not configure a non-NGN `chargeCurrency`.
5. Keep production payment activation governed separately by the existing JusticeSure v1 launch gate.
6. Require a deployed, revision-identifiable JusticeSure release before integrating the v3.6 candidate schema.
7. Before any non-NGN activation, require provider-backed staging for each country, currency and payment method through quote, order, hosted payment, signed callback/status recovery, cancellation and partial/full refund.
8. Reconcile displayed, original-charge and actually-returned money using exact minor amounts and exponents; any mismatch fails closed.

## Current task outcome

JusticeSure has supplied enough information to confirm that its current multi-currency headless offering is **not ready for SOSO activation**. No currency beyond NGN is approved or promised. Task 15 remains open. The implementation phase begins after a deployed contract, secure sandbox configuration and provider-backed acceptance evidence exist.