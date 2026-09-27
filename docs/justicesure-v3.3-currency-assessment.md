# JusticeSure v3.3 multi-currency assessment

Reviewed 13 September 2026. Status: **blocked pending provider clarification and sandbox acceptance, not approved for localization**.

## Evidence

- Uploaded archive: `attached_assets/0_SOSO_JusticeSure_Headless_Commerce_Handoff_v3.3_2026-09-10_1789275642415.zip`.
- Archive SHA-256: `8c4a6b24f16b7eb68f916226db854a6e34fec2d55c9a98bc4df0079e83e40437`.
- All eight entries in `SHA256SUMS.txt` verified.
- Package version 3.3, prepared 10 September 2026; OpenAPI `info.version` remains 1.0.0. Pin archive identity, not just API version.
- `START_HERE.md` explicitly labels this a source-contract/staging handoff, with deployment, production certification, and external testing not claimed.
- No live payments, refunds, or production requests were attempted for this review.

## What is now confirmed in the contract

- `/currencies` describes display, charge, settlement flags and minor-unit exponents.
- `/payment-methods` accepts country/currency filters and returns charge/settlement currency arrays. Display support alone is explicitly insufficient for payment readiness.
- `/fulfillment-corridors` exposes approved merchant delivery corridors.
- `/price-quotes` introduces immutable payable quotes, exact integer-string minor amounts, display/charge/settlement currency fields, FX snapshot identity, expiry, and landed-cost information.
- Payable quotes require readiness of the exact merchant-owned connector. Unavailable connectors fail before order mutation; expired quotes require requoting and customer review.
- Order and payment-session retries must preserve the exact body and original, separately persisted idempotency keys.
- Verify/reconcile endpoints take path-bound order/attempt identifiers, not shopper-supplied provider, amount, account, or currency authority.

## Remaining money-contract gaps

| Surface | Evidence and unresolved requirement |
| --- | --- |
| Catalogue/variants | `Product.price` includes NGN canonical money, legacy numeric kobo and display money. Display FX may be stale/fallback. Provider must specify how a chargeable displayed price is obtained and reconciled with the immutable quote. |
| Quote/delivery | `QuoteAmounts` has exact integer strings. Created/retrieved quotes still have canonical `currency: NGN` plus separate display/charge/settlement fields. Define which currency/exponent applies to every total, including duty, tax, insurance, brokerage and rounding. |
| Order/status | `Order.currency` remains fixed NGN with numeric kobo totals. Supply authoritative original charge-currency totals and linkage to the frozen quote, not only the canonical ledger. |
| Hosted session/verify | Prose asserts provider amount/currency matching, but returned recovery status does not independently establish original charge money across all surfaces. Provide reconciled examples and staging evidence. |
| Payment webhook | `CommercePaymentUpdatedData` uses `amountKobo` without a required currency. A notification may trigger a status fetch, but that status must expose original charge money. |
| Cancellation/refund | Refund events use `refundedKobo`; no public refund mutation or required original-charge currency/refund identity model. Document merchant-side refund execution, partial/refunded totals, rate handling, fees, retry ordering and currency-preserving recovery. |

An NGN accounting ledger is compatible with multi-currency commerce only when the original customer charge and refund money are separately authoritative and consistently recoverable. Do not relabel kobo fields as other currencies.

## Provider handoff still required

1. Merchant-specific country × currency × payment-method matrix, separating display, charge and settlement support. Confirm NGN, GBP, USD, EUR and each explicitly approved African currency; none is approved for non-NGN checkout by this archive alone.
2. Governed price-list versus FX ownership; rate source, direction, precision, refresh policy, rounding/allocation, expiry and unavailable-rate behavior. An opaque `fxSnapshotId` is not this policy.
3. Country-specific payment fees, taxes, duties, delivery restrictions, settlement and refund rules, including rejected combinations.
4. Revised schemas or normative guarantees and examples closing the money gaps above.
5. Confirmed deployed sandbox base URL, merchant/test catalogue and location identifiers, ready sandbox payment account, approved webhook/return URLs; credentials transferred only through secure configuration.

## Required acceptance evidence

For every approved country/currency/method combination, record currency, exponent, amount and linked identifiers at catalogue, immutable quote, order, hosted payment, verified status, webhook recovery and refund. Reconcile original charge money separately from settlement conversion.

Exercise quote expiry, missing rates, connector unavailability, unsupported combinations, changed-body idempotency rejection, exact retries, timeout recovery, duplicate/out-of-order callbacks, cancellation and partial/full refunds. Every inconsistent path must fail closed. No staging row has passed in this review.

## SOSO boundary

Keep current NGN-only guards and payment activation gates. Do not add country detection, currency selection, estimated FX prices or international currency promises. This review documents implementation inputs; it does not certify the existing adapter against every v3.3 endpoint or complete the multi-currency task.