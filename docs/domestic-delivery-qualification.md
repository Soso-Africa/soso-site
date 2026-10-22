# Nigerian delivery qualification

## Current status: Test flat-price quotes qualified; distance-policy checks deferred

On 20 October the configured Test store finally reported delivery intended and
ready. Its policy is **flat**, not the distance policy last observed in Live.
Real non-charging Test quote checks now confirm that signed delivery fees reach
immutable shipping and total amounts. This does not qualify Live distance rates.
The owner explicitly chose **"Keep Test flat pricing for now"** on 20 October;
distance-policy and actual policy-edit qualification are therefore deferred,
not prerequisites the agent may satisfy by changing merchant settings.
The historical disabled-policy observations below remain valid for their dates.

Observed on 14 October 2026 using the configured JusticeSure Commerce endpoint.
This is a partial qualification record, not payment or delivery launch approval.
Merchant settings were not changed. No rates or origin coordinates were invented.

## Actual remote operations

In the initial check, only authenticated `GET /store` was performed, once with each configured key.
At that initial stage no remote delivery quotes, price quotes, orders, payment
sessions, charges, or policy writes were created in either environment.

| Environment | Observed at (UTC) | HTTP | Domestic delivery | Fulfilment options | Policy summary |
| --- | --- | --- | --- | --- | --- |
| Test | 2026-10-14T20:12:34.896Z | 200 | Intended false; ready false; `DELIVERY_NOT_ENABLED` | Pickup only | Country NG; `nigeria_wide`; pricing `free`; `maxRadiusKm: null`; minimum order 0; free threshold null |
| Live | 2026-10-14T20:12:35.535Z | 200 | Intended true; ready true; no failure reason | Pickup and delivery | Country NG; `nigeria_wide`; pricing `distance`; `maxRadiusKm: null`; minimum order 0; free threshold 50000000 kobo |

Live discovery confirms the reported nationwide/no-radius policy, not that a
distant address can be quoted or that a fee reaches a payable total. The store
summary does not expose the actual per-kilometre rate, base fee, or origin.
Test's disabled, free-pricing summary cannot qualify Live's distance policy.
Do not bypass Test enablement or use Live writes as a substitute.

## Recheck after merchant enablement confirmation — 15 October 2026

The owner confirmed Test delivery had been enabled. Fresh authenticated reads
using the configured, explicitly Test-prefixed credential still returned:

- **Test `GET /store`, HTTP 200, 2026-10-15T15:36:50.599Z:** domestic delivery
  `intended: false`, `ready: false`, `reason: DELIVERY_NOT_ENABLED`; pickup only;
  NG, `nigeria_wide`, pricing `free`, `maxRadiusKm: null`.
- **Test `GET /payment-methods?country=NG&currency=NGN`, HTTP 200,
  2026-10-15T15:36:51.292Z:** Paystack card eligible with NGN charge/settlement,
  explicitly simulated/Test. Payment-method readiness does not override disabled
  domestic delivery.
- **Test `GET /products?limit=100&offset=0`, HTTP 200,
  2026-10-15T15:37:06.542Z:** three product rows returned. No product was selected
  for a quote; catalogue/stock qualification remains outstanding.
- **Live `GET /store`, HTTP 200, 2026-10-15T15:37:07.281Z:** domestic delivery
  still intended/ready, distance pricing, nationwide, no radius cap, pickup and
  delivery enabled; free-delivery threshold still 50000000 kobo.

An initial Test catalogue diagnostic used the incorrect `/catalog/products`
path; its response was not retained because the diagnostic expected a `data`
field and failed. It provides no qualification evidence. The correct `/products`
read above succeeded.

The configured Test API still does not expose the newly enabled delivery policy.
The merchant needs to reconcile the enabled settings with the Test store bound
to this project's configured Test credential. No secret values were displayed.
No quote POSTs were attempted while Test delivery was disabled, no settings
were changed, and no remote orders, sessions, or charges were created.
The task remains blocked; the owner's confirmation is not substituted for
contradictory runtime evidence.

## Recheck after linked-Test-store confirmation — 17 October 2026

The owner confirmed the settings were saved for the linked Test store. A single
fresh authenticated **Test `GET /store`** at **2026-10-17T08:12:58.217Z** returned
HTTP 200 with the same disabled policy:

```json
{
  "domesticDelivery": {
    "country": "NG",
    "intended": false,
    "ready": false,
    "reason": "DELIVERY_NOT_ENABLED",
    "coverage": "nigeria_wide",
    "pricing": "free",
    "maxRadiusKm": null
  },
  "options": ["pickup"]
}
```

This check used the configured Commerce URL and explicitly Test-prefixed key;
it did not fall back to Live credentials. No further operations were attempted.
Live was not rechecked in this attempt; its last observation remains the
15 October read above.

Repeated save confirmations have not changed the API result, so another request
to toggle the same setting is not sufficient. JusticeSure needs to reconcile
the merchant console's enabled Test policy with the store/environment bound to
the configured Test credential. No root cause has been established: this record
does not assert a wrong merchant, stale cache, or provider defect. Resume when
the configured Test `/store` actually exposes approved distance delivery as
intended/ready. Fee-to-total, real token edits/expiration, policy changes and
distant-address qualification remain unexecuted. The task is not complete.

## Enabled Test qualification — 20 October 2026

Fresh Test `GET /store` at **2026-10-20T22:02:44.586Z** returned HTTP 200,
`intended: true`, `ready: true`, country NG, `coverage: nigeria_wide`,
`pricing: flat`, `maxRadiusKm: null`, pickup and delivery, and no free threshold.
Test catalogue and NGN payment-method reads succeeded. The catalogue contains
real upstream synthetic Test products with stock and variants; no products,
prices or rates were invented or changed for this qualification.

An initial manual Test delivery/price quote probe succeeded, followed by the
reusable quote-only qualification script:

```sh
pnpm --dir scripts exec tsx \
  ../artifacts/api-server/scripts/qualify-domestic-delivery.ts --wait-expiry
```

The script refuses production or non-Test credentials, blocks every transport
operation except the specific discovery and quote endpoints, and retains signed
tokens only in memory. Redacted operation/status/amount evidence is written to
`generated-artifacts/delivery-qualification.json` (ignored generated output).

Confirmed through the actual JusticeSure adapter and remote Test API:

- Mug, quantity 1: signed `feeKobo: 150000` (NGN 1,500), immutable
  `shippingMinor: "150000"`, subtotal `"180000"` (NGN 1,800), total `"330000"`
  (NGN 3,300). Quote `a2439e70-253a-425c-ab36-b444627dce41` was created and
  retrieved with identical monetary authority and expires at
  `2026-10-20T22:14:54.184Z`. All other amount components are zero.
- A fresh quote after quantity/address edits had subtotal `"360000"`, shipping
  `"150000"` and total `"510000"`; no shipping amount was lost from the total.
- Reusing a signed token after address, quantity, product, or variant edits, and
  tampering with the token, returned HTTP 422 `delivery_quote_invalid`.
- An empty delivery address returned HTTP 400 `INVALID_REQUEST`.
- An explicit foreign destination country on a price quote returned HTTP 422
  `PACKAGE_FACTS_REQUIRED`; this proves rejection, not a country-specific error.
- Fresh signed delivery quotes plus created/retrieved immutable price quotes
  succeeded for FCT, Kano, Borno, Sokoto, Cross River and Rivers, in addition to
  Lagos. Each flat Test fee was 150000 kobo and each one-item total 330000 kobo.
  This qualifies these representative quote destinations under flat pricing,
  not all addresses, geocoded route distances, or all Nigerian states.
- Every retrieved quote's total was compared with the exact integer sum of its
  monetary components, including shipping, and its lines/address were checked.

Two negative expectations did **not** hold in the remote Test flat policy:

- `/price-quotes` accepted a domestic request without a delivery token.
  SOSO's signed-delivery path always obtains and supplies the token, so this
  result is not proof that SOSO omitted it.
- `/delivery-quotes` accepted a London address under flat pricing instead of
  rejecting it. The local structured-country validator rejects non-Nigerian
  countries, but this is not proof of upstream geocoding or destination
  rejection. Test distance-policy rejection remains to be qualified.

The script records both as failed negative checks, not silent passes. No remote
orders, payment sessions, charges, policy writes, or SOSO database writes were
performed. A final **read-only Live `GET /store`** at
**2026-10-20T22:14:34.035Z** returned HTTP 200 with delivery intended/ready,
distance pricing, `nigeria_wide`, `maxRadiusKm: null`, pickup and delivery, and
free threshold 50000000 kobo. That was the only Live operation on 20 October;
there were no Live quotes or checkout writes. Real elapsed-time expiry
qualification completed at **2026-10-20T22:15:03.557Z** after waiting for the
provider's actual 600-second delivery TTL and immutable price expiry:

- Reusing the naturally expired signed delivery token returned **HTTP 422
  `delivery_quote_invalid`**.
- Retrieving the naturally expired immutable price quote returned **HTTP 410
  `QUOTE_EXPIRED_REQUOTE_REQUIRED`** from JusticeSure, not just a simulated clock
  or local rejection.
- A fresh delivery/price quote after expiration again yielded shipping 150000
  kobo and total 330000 kobo, and was successfully retrieved. Its quote ID is
  `6d25c6e4-1e44-4bf2-bfc2-67586986883d`, with expiry
  `2026-10-20T22:25:02.515Z`.

The completed main qualification run made **43 Test requests**, with **18
passing checks and 2 failed upstream negative expectations** described above.
Its nonzero exit reflects those two findings; expiry and fee arithmetic passed.
The operation ledger for this main run is:

| Test operation | HTTP | Count |
| --- | --- | ---: |
| GET `/store` | 200 | 2 |
| GET `/products` | 200 | 1 |
| GET `/payment-methods` | 200 | 1 |
| POST `/delivery-quotes` | 200 | 11 |
| POST `/delivery-quotes` | 400 | 1 |
| POST `/price-quotes` | 201 | 10 |
| POST `/price-quotes` | 422 | 7 |
| GET `/price-quotes/:id` | 200 | 9 |
| GET `/price-quotes/:id` | 410 | 1 |

This ledger excludes the separately described initial manual probe/discovery
and interrupted policy monitor. Every category of operation remained discovery
or quote-only; no order/session/charge was performed in any run.

Merchant policy edits remain outstanding because the agent must not alter
merchant settings. They need a merchant-approved change of Test pricing from
flat to distance while an old signed quote is still unexpired. A separate
quote-only policy monitor was prepared and issued/retrieved one additional
flat-price baseline quote, then read the Test policy while awaiting that change.
It was explicitly stopped after the owner chose to keep flat pricing. No policy
change or policy-edit invalidation is claimed from that interrupted monitor.
Its partial redacted report is
`generated-artifacts/delivery-policy-qualification.json`.

The API typecheck was also attempted; it is blocked by three existing
`unknown` JSON-response accesses in `src/routes/payment.contract.test.ts`
(lines 161, 167 and 170), not by the qualification script. No production
application code has been changed for this work.

The first completion check subsequently ran the newer checkout release gate
after other project merges. Migration validation and completion code review
passed, but `pnpm run validate:checkout` stopped on missing dependencies from
those merges (including the S3 SDK, connectors SDK and spreadsheet/mail
packages). `pnpm install --frozen-lockfile` installed the already-locked
dependencies without changing versions. The API and storefront services were
restarted successfully. An anonymous `/checkout` screenshot then showed the
normal empty-cart page with no browser errors; this is a startup sanity check,
not a browser qualification of a populated cart or payment flow.

The new standalone qualification script also passed a strict targeted
TypeScript check:

```sh
pnpm --dir scripts exec tsc --noEmit --target es2022 --module esnext \
  --moduleResolution bundler --types node --skipLibCheck --esModuleInterop \
  --strict ../artifacts/api-server/scripts/qualify-domestic-delivery.ts
```

The qualification script deliberately exits nonzero if a provider negative
expectation fails; an accepted missing token or foreign address must remain a
visible finding, not be rewritten as a passing rejection test.

## Local checks actually performed

Ran the existing fixture-based tests:

```sh
pnpm --dir scripts exec tsx --test \
  ../artifacts/api-server/src/lib/domestic-delivery-token.test.ts \
  ../artifacts/api-server/src/lib/domestic-fulfillment.test.ts \
  ../artifacts/api-server/src/lib/justicesureCommerce.test.ts
```

Result: **19 passed, 0 failed**. These tests use synthetic responses; their
mock order/session calls did not reach JusticeSure. Delivery-related assertions
cover integer fee parsing, token response handling, canonical Nigerian address
validation, foreign-country rejection, disabled delivery rejection, and changed
address/recipient rejection. Adapter tests also cover exact stored request bodies
and retrieved quote-line parsing. They do not qualify the remote token signature,
expiration, merchant policy, or payable shipping total.

Static inspection, not an executed API/browser journey, confirmed:

- `artifacts/api-server/src/routes/payment.ts` requests `/delivery-quotes` using
  server-resolved items and the canonical address, then sends the returned token
  to `/price-quotes`.
- It rejects `shippingMinor !== String(feeKobo)` before persisting a payable
  quote. It retrieves that immutable quote and compares its amounts, currencies,
  expiry, lines, and destination to creation authority.
- Checkout confirmation binds request details to the persisted attempt,
  checks current store fulfilment availability, retrieves the immutable quote
  again, and rejects changed quote authority before ordering.
- `artifacts/api-server/src/lib/justicesureCommerce.ts` validates nonnegative
  safe-integer delivery fees and rejects invalid/expired immutable price quotes.
  It delegates signed delivery-token validation to JusticeSure; it does not
  calculate distance rates locally.
- `artifacts/soso-store/src/pages/Checkout.tsx` displays the immutable
  `totalMinor` and `shippingMinor` and rejects an expired quote before submission.
  This was code inspection only, not browser qualification.

## Required non-charging Test qualification

The merchant must explicitly enable domestic delivery in **Test** with approved
Nigerian origin and distance-pricing settings, and no radius cap. An approved
in-stock Test product/variant and eligible NGN quote provider/method are also
required. Commerce key access does not authorize changing merchant policy.

Once those prerequisites are confirmed, record actual requests, statuses, safe
error codes, quote expiries, and immutable amount components for:

1. A canonical Nigerian address/cart: obtain the signed delivery quote, create
   and retrieve an immutable NGN price quote, and compare `feeKobo` exactly with
   `shippingMinor`. Verify the provider's component total includes that shipping
   amount; compare the storefront's displayed total with `totalMinor`.
2. Address, product/variant, and quantity edits: reuse the original delivery
   token with changed inputs and confirm rejection; obtain fresh tokens/quotes
   for changed inputs. Verify SOSO cannot confirm stale checkout details.
3. Token tampering and actual token/price-quote expiration: confirm rejection
   and the new-quote path, without initiating payment.
4. Merchant-approved **Test-only** policy edits: confirm old delivery-token
   rejection under the changed policy and new fee authority with a fresh token.
   Do not make or restore policy changes without explicit merchant approval.
5. Rejected/foreign/unresolvable destinations: confirm safe errors and no
   payable quote, order, or session.
6. Representative distant Nigerian addresses, including FCT and geographically
   separated states: confirm no radius-based rejection. Nationwide discovery
   alone is not coverage qualification for all 36 states and FCT.

These were unexecuted in the initial record; the dated 20 October section above
identifies the subset now actually executed and the remaining limitations.
Keep all Live operations read-only and stop before order/session creation in
Test as well: this task qualifies quoted payable totals, not a completed payment.
