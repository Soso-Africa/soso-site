# JusticeSure action request for SOSO multi-currency checkout

Send this request to JusticeSure. Task 15 cannot be implemented or accepted until the required provider-owned inputs are returned.

## Requested outcome

Please supply a replacement, checksum-valid Headless Commerce handoff that lets SOSO implement and prove authoritative multi-currency checkout in a merchant-owned sandbox.

The current v3.6 handoff is not sufficient for activation. It labels itself:

- `self_service_test_mode_contract_candidate_not_deployed_or_provider_accepted`;
- `limited_first_party_test_acceptance_observed`;
- external provider qualification `optional_and_unexecuted`; and
- production migration `pending_approved_release_and_merchant_decision`.

SOSO will remain NGN-only until the requirements below pass.

## 1. Deploy the contract being handed off

Please provide:

- a deployed sandbox base URL;
- a revision/build identifier returned by the runtime;
- an OpenAPI document whose version and revision identify the deployed behavior;
- confirmation that production schema/release v319, or its replacement, is deployed in the sandbox;
- release notes that map each relevant schema and endpoint to the deployed revision; and
- a checksum manifest for the complete handoff.

The supplied v3.6 source contract is not deployment evidence. The existing external acceptance harness and example configuration are also hard-pinned to package version `3.5`; please issue a version-matched replacement.

## 2. Provision SOSO's secure sandbox access

Through the authenticated JusticeSure account—not chat, email, documentation or source code—please make available:

- the SOSO-owned Test tenant;
- a least-privilege API key;
- the callback signing secret;
- key revocation and rotation controls;
- callback URL management;
- merchant payment-account readiness for every supported provider/currency row; and
- any provider-sandbox account setup JusticeSure requires.

Credentials must be shown once and entered directly into SOSO's backend secret manager. Do not place credentials in the handoff ZIP or messages.

## 3. Publish the exact chargeability matrix

Return one explicit row for every proposed country, currency, provider and payment method. At minimum address:

- NGN;
- GBP;
- USD;
- EUR;
- GHS;
- KES;
- ZAR;
- XOF; and
- XAF.

Each row must say `supported` or `unsupported`; `runtime display supported`, `pending`, `unavailable or untested`, and `explicit result required` are not activation answers.

Each supported row must include:

- shopper country or approved country set;
- ISO charge currency;
- minor-unit exponent;
- payment provider and payment method;
- merchant account readiness;
- settlement currency and settlement timing;
- provider and JusticeSure fees;
- refund support, including partial refunds;
- domestic/international delivery eligibility;
- taxes and duties ownership;
- minimum/maximum amount limits; and
- any product, delivery or regulatory restrictions.

Do not describe a display currency as chargeable unless the hosted provider actually charges that currency.

## 4. Define authoritative pricing and FX rules

For every supported row, document whether the shopper amount comes from:

- a governed local-currency price list; or
- conversion from a canonical price.

For converted prices, provide:

- authoritative rate source;
- rate refresh schedule;
- quote snapshot identity;
- rounding rule for each component and total;
- quote expiry;
- behavior when a rate is stale or unavailable;
- whether delivery, tax, duties and fees use the same snapshot;
- settlement conversion behavior; and
- refund conversion behavior, including whether the shopper receives original-charge currency and how any difference is handled.

No browser-side spot conversion or estimate may become the payable amount.

## 5. Make money consistent across every surface

The deployed API must preserve the same authoritative original charge through:

- catalogue product;
- catalogue variant;
- delivery quote;
- immutable price quote;
- order creation and idempotent replay;
- order retrieval/status;
- hosted payment-session creation and replay;
- payment-attempt verify/reconcile;
- payment webhook;
- cancellation;
- partial refund;
- full refund; and
- refund webhook/status.

Every payable or returned amount must use:

- ISO 4217 currency;
- integer minor-unit amount, preferably represented as a string where JavaScript integer precision could be exceeded;
- explicit minor-unit exponent;
- stable resource identifiers linking quote, order, payment attempt and refund; and
- exact component totals for merchandise, discounts, delivery, tax, duties and fees.

Legacy `amountKobo` or `refundedKobo` fields cannot be the only money identity for a non-NGN transaction. `displayCurrency` remains estimate-only.

If a legacy or unlinked refund cannot report actual returned currency and amount, that flow must be unavailable for multi-currency activation rather than reported as accepted.

## 6. Prove retry, callback and recovery behavior

The sandbox must prove that:

- the same order key and unchanged body recover one order with unchanged currency and totals;
- a changed body with the same key is rejected;
- the same payment-session key recovers one provider session and reference;
- timeout recovery cannot recreate or change the payable amount;
- the return URL never marks an order paid;
- only a verified provider lifecycle reflected by JusticeSure changes authoritative payment state;
- invalid, stale, duplicate and concurrent callbacks are handled safely;
- verify/reconcile preserve the original currency and totals;
- cancellation preserves original money identity;
- partial refunds cannot exceed the remaining refundable original-charge balance;
- same-refund replay returns the same refund; and
- webhook replay cannot duplicate local side effects.

## 7. Execute provider-backed staging acceptance

Please provide an executable, version-matched harness and signed or otherwise auditable result for each matrix row.

For every supported currency, the evidence must reconcile:

1. displayed catalogue amount;
2. immutable quote components and total;
3. created order total;
4. hosted payment-session currency and amount;
5. provider-sandbox transaction currency and amount;
6. signed callback and authoritative order status;
7. partial refund currency and amount;
8. full/remaining refund currency and amount; and
9. final provider and JusticeSure refund status.

For every unsupported row, prove that discovery/quote/session creation fails closed before stock mutation or a shopper-facing payment promise.

Synthetic Test events are useful integration tests but do not replace provider-backed transaction and refund evidence.

## 8. Required replacement package

Please return:

- `START_HERE.md`;
- deployed OpenAPI contract;
- package manifest and checksums;
- supported-country/currency/provider/payment-method matrix;
- pricing and FX policy;
- fees, tax, duties, delivery, settlement and refund policy;
- version-matched acceptance harness and configuration template;
- completed acceptance results for all requested currency rows;
- gap register with no activation-critical item marked pending or unexecuted; and
- secure account instructions for issuing SOSO's sandbox credentials.

## SOSO acceptance boundary

After receiving the replacement package, SOSO will:

1. verify package integrity and deployed contract identity;
2. configure credentials only through secure backend secrets;
3. extend its server adapter, public API, persisted money model and storefront;
4. keep unsupported currencies fail-closed;
5. run the full staging matrix independently; and
6. approve shopper localization only for rows whose amounts reconcile end to end.

Production payment activation remains a separate decision after staging passes.