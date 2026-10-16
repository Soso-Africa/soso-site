# JusticeSure shopper-account contract — current assessment

Checked 14 October 2026. Qualification created synthetic JusticeSure Test customers. No Live customer records, orders, payments, provider settings or deployments were changed.

## Authoritative publications

- Current guide: https://justicesure.ai/docs/headless-commerce
- Current OpenAPI: https://justicesure.ai/api/openapi/commerce-v1.json
- Commerce base: https://justicesure.ai/api/v1/commerce
- Downloaded OpenAPI SHA-256: `7ca8755061d483533be04eddf1b0c23e99dec4d3a84d11b3b37cfb5584515acb`

The guide now explicitly documents shopper accounts. Its immutable handoff ZIP predates that extension; use the current guide and OpenAPI rather than treating the older handoff as proof the customer API is absent.

## Supported customer contract

SOSO owns authentication, email verification and recovery. Its backend links a verified immutable authentication subject using `POST /customers/link`. Passwords never go to JusticeSure, browser input cannot establish email verification, and shoppers receive no Staff access.

The schema includes:

- Customer linking, profile retrieval and profile update.
- A single saved free-text address, not an address book.
- Paginated online/physical order summaries and owned online-order details.
- Fashion-gated measurement creation, revision-protected editing and deletion.
- Customer-safe production stages and movement history.
- Optional `customerExternalId` on order creation; guest checkout omits it.

Customer responses are direct JSON objects, not the `data` envelope used by older commerce operations. Signup does not grant newsletter/advertising consent or claim historical guest orders by email.

## Runtime permission evidence

The assessment script is `artifacts/api-server/scripts/assess-shopper-account-readiness.ts`. It uses configured credentials inside a server-side process and prints only sanitized status/capability information.

| Check | Test credential | Live credential |
| --- | --- | --- |
| `/readiness` | HTTP 200; general schema ready/checked | HTTP 200; general schema ready/checked |
| `/store` | HTTP 200 | HTTP 200 |
| GET an intentionally nonexistent customer subject | HTTP 404, `CUSTOMER_NOT_FOUND` with replacement key | HTTP 404, `CUSTOMER_NOT_FOUND` |
| POST `/customers/link` with an empty invalid body | HTTP 400, `INVALID_REQUEST` with replacement key | HTTP 400, `INVALID_REQUEST` |
| Domestic delivery flags, rechecked after owner activation | `intended: false`, `ready: false` | `intended: true`, `ready: true` |

The Live customer result demonstrates an authorized lookup. The invalid-body POST qualifies the write-route permission/validation boundary only. General schema readiness does not certify all account operations.

The owner supplied a replacement Test key. Synthetic merchant-contract qualification successfully linked a Test customer, confirmed idempotent relinking, retrieved and changed its profile, retrieved empty owned orders, rejected an unknown owned-order lookup, and retrieved production data through SOSO's validated adapter. These are real Test API checks, not frontend fixtures or proof of Clerk signup. The audit customer remains in Test because the published contract provides no customer DELETE route.

Measurement access remains disabled in Test: a fresh synthetic profile does not enable measurement capability and the Test measurement endpoint returns HTTP 403 `FASHION_FEATURE_DISABLED`. After the owner's enablement update, the Live unlinked-subject measurement probe returned HTTP 404 `CUSTOMER_NOT_FOUND`, not the Test feature-disabled response. This is not proof of Live measurement CRUD; no Live customer was created. SOSO must not bypass capability gates or label them customer-key scope failures. The qualification script now uses the documented PUT method for measurement updates.

## Implemented code and remaining qualification

Customer account routes and the separate My account destination are implemented with Clerk authentication, server-derived subject ownership, server-verified email linking, sanitized conflicts, private responses and identity-bound checkout retries. Account surfaces include profile editing, online/physical order summaries, production progress and governed measurement CRUD. Staff login remains separate and the duplicate footer entry is filtered out. Guest checkout remains optional-account checkout; signing up does not opt into marketing.

Domestic delivery obtains `/delivery-quotes`, binds its signed `deliveryQuoteToken` to the canonical Nigerian address/cart, checks the provider fee against the immutable price quote, and persists that tokenized fulfilment for ordering. After the owner's merchant-console activation, Live reports delivery intended and ready; Test remains disabled. Readiness is not evidence of a completed delivery quote or paid delivery order.

The owner approved all 36 Nigerian states and FCT and expects distance-based pricing at checkout. The current handoff's Nigerian delivery guide supports a positive NGN/km rate, optional NGN base fee, and Nigerian shop latitude/longitude; nationwide coverage requires no radius limit. These are merchant-console settings, not Commerce v1 API-key management operations. No amount or origin was supplied, so no merchant delivery settings were changed.

Custom-size checkout now offers either known measurements (cm/in, unknown fields may be omitted) or a request to arrange measurement-taking after payment. Instructions apply to all Custom-size lines, are bounded to the existing order-note contract and accompany the immutable checkout/order request. When verified payment activates the local custom measurement queue, those instructions populate its customer note without confirming fit or advancing its status. This is an order-specific atelier instruction, not saved-profile CRUD, an appointment booking or a bypass of JusticeSure's fashion capability. Existing post-payment structured submissions remain available.

Public browser verification confirmed one Staff login and one My account destination on phone and desktop, distinct staff/customer sign-in, unauthenticated account HTTP 401 with no-store, an accessible guest empty checkout, and working account-page Cookie choices without analytics events.

The authenticated lifecycle then passed in a standalone workspace Node Playwright process using Clerk's official development testing helpers: signup, development email OTP verification, authenticated session, real JusticeSure Test profile lookup/link/read/update, owned orders/production reads, logout with private data removed and unauthenticated HTTP 401/no-store, and denial of Staff access. No order/payment action or forced measurement access occurred. Updated profile values appeared in the UI after PATCH; a separate post-PATCH GET response was not independently captured. The uniquely created Clerk development user was deleted at teardown; the earlier incomplete attempt had no matching Clerk user. The Test merchant audit fixture remains.

External Vercel production Clerk keys, host/proxy routing and actual authenticated customer operations require release qualification separately from Replit development configuration.

The owner requested a combined release. Customer-enabled Test permissions, the synthetic profile contract and the authenticated development lifecycle are qualified. Live merchant delivery readiness is now confirmed. Test measurement enablement, real signed-delivery quote qualification and external-host production auth qualification remain outstanding. The owner's screenshot shows Customer Measurements and Fashion/BOM Mode enabled in Get Paid Settings; the Test API's disabled response must not be described as proof those Live settings are off. Nothing has been published.
