# Verified advertising purchases

## Reporting boundary

Advertising purchase reporting is opt-in marketing measurement, not checkout
operation. No ad SDK or conversion request runs on checkout, payment return,
Staff, account, order, measurement or private preview routes. A shopper must
return to a public storefront page with marketing consent and an enabled
purchase destination. The first-party HttpOnly checkout ownership cookie
authorizes a server re-read of the corresponding JusticeSure order.

A completed payment status, matching remote order identity, positive canonical
NGN total, sufficient paid amount and zero refunded amount are required.
Clicking Pay, redirects, local paid status and query parameters do not qualify.
The current contract uses NGN/kobo; unsupported currencies fail closed.

The response and vendor payload allow only a new random event ID, authoritative
value and currency. The event ID is unrelated to order IDs, payment references
and ownership tokens. No contact data, line items or customer identity is sent.

## Deduplication and consent

A database unique claim makes concurrent requests and reloads at-most-once.
Each provider also receives that random deduplication ID. A claim means a
dispatch attempt, never confirmed vendor receipt. Lost responses, navigation,
blocked vendors or consent withdrawal after claiming can cause under-reporting;
the system intentionally does not replay a possibly sent conversion.

Consent is rechecked immediately before requesting and before dispatch, including
an asynchronous generation fence that invalidates responses after withdrawal or
private navigation. A minimal consented browser purchaser marker suppresses
future product/cart/checkout-intent advertising events. It is removed on
withdrawal. An owned historical claim can restore suppression after re-consent
without sending Purchase again. Subsequent advertising page views are also
suppressed; first-party consented analytics remain independent.
This is browser-local suppression, not cross-device exclusion or campaign setup.

## Staff settings and release

Existing owner/administrator authorization, revision checks, history and audits
also govern the Google Ads public conversion label and X public purchase event
ID. X event IDs must belong to the configured pixel. Leaving either field blank
disables that provider's purchase events. Meta and TikTok use standard purchase
events. Replacing a loaded destination or conversion label blocks that provider
until a full reload rather than sending to both destinations.

Apply `0012_verified_purchase_claims.sql` using the existing migration runner
before enabling purchase reporting in a deployed environment. No existing
orders are backfilled and no database is replaced. Missing migration or failed
verification leaves reporting off and does not affect checkout.

Owners must supply the correct public advertiser destinations, verify vendor
receipt/diagnostics, and configure campaign purchaser-exclusion audiences.
Code/runtime verification alone does not prove attribution, matched audiences,
ad delivery or vendor receipt.

## Isolated validation

The purchase HTTP contract test refuses any schema except the temporary test
schema created by the existing isolated wrapper. It uses a no-network payment
simulator, synthetic rows, and vendor spies, and covers pending, cancelled,
paid, concurrent claims, refresh, ownership, public-route restrictions and
withdrawn consent. No real charges or production fake orders are needed.
