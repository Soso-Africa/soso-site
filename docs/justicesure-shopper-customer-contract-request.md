# Shopper accounts: JusticeSure contract prerequisite

## Implementation and Test evidence — 14 October 2026

**Implemented in the task branch; not published or Live-qualified.**

Shopper signup/signin/recovery are available under `/account/sign-up` and
`/account/sign-in`, separately from the unchanged Staff session routes.
Verified signup returns to the account completion screen and links the
authenticated shopper before showing a ready profile. Shoppers can edit name,
phone and one saved address, clear optional fields, read paginated own purchases
and open owned online-order details. Guest checkout remains available and
signup grants no newsletter or marketing consent.

SOSO persists an issuer/subject, Commerce origin, Test/Live environment and
remote-customer binding. Every private request revalidates the merchant-scoped
remote identity. Changed emails, ambiguous CRM matches, remote-ID changes and
missing service permissions fail closed. The browser cannot choose the
authentication subject, verified email, merchant or remote customer ID.

Signed-in checkout uses the server-resolved external customer identity in its
durable order intent and request hash. Signing out or changing identity requires
a new quote instead of reusing a different shopper's intent. Guest requests
continue to omit the remote identity.

### Verification

- Workspace typecheck passed.
- Nineteen focused adapter, persistent-identity, concurrency and payment
  contract checks passed in an isolated database schema.
- Fresh, repeat, legacy-upgrade and partial-schema migration checks passed.
  The new fingerprint was derived in a rollback-only fresh schema after
  proving all previous migrations still matched the previous fingerprint.
- A browser test used one new, provider-verified synthetic Clerk shopper and
  the actual JusticeSure Test API, not a simulated customer API:
  - Signup/account completion automatically issued a successful customer link.
  - The remote customer ID, external ID and verified email matched the single
    SOSO-local Test binding; repeated linking retained that same record.
  - Name, phone and saved address updates persisted across reload; clearing
    the saved address also persisted.
  - Browser-authored identity fields were rejected; another external ID could
    not be requested; an authenticated write without Origin was rejected.
  - Shopper authentication did not grant Staff access, and sign-out restored
    unauthorized responses without displaying the previous profile.
  - Branded signed-out widgets and the phone layout rendered.
- A narrow post-reconciliation browser check confirmed the preserved
  `/account/atelier` dashboard and `/api/account` endpoints resolve the same
  persistent customer as `/api/shopper`. Repeated linking through either API
  retained one binding and the same real Test customer ID. Capability-disabled
  measurements returned an explicit unavailable response, while production
  reads returned an empty customer-safe timeline.
- No order, charge, newsletter subscription or Live customer write occurred.
  The synthetic Clerk user and local binding were removed after verification.
  Two synthetic JusticeSure Test customers remain because the published
  contract has no customer-deletion endpoint; no cleanup endpoint was guessed.

### Release boundary

This fork is not a production deployment. Before Live activation, the owner
must grant customer read/write permissions to the exact SOSO Live merchant
key, confirm JusticeSure's customer schema, and configure the production
shopper authentication/proxy on the serving host. Install the additive SOSO
binding migration on the approved application database using
`lib/db/scripts/ensure-shopper-schema.mjs` or the governed migration flow.
Neither step grants Staff rights or enables payment writes.

The main project gained capability-gated measurements and production timelines
in parallel. Reconciliation preserves those existing features through the
account's “Measurements and atelier updates” destination and upgrades their
private API guard to the same verified persistent customer binding. Their
provider capabilities still govern availability; the Test browser evidence
above covers signup/profile linking rather than every atelier feature.

---

## Current assessment — 12 October 2026

**The supported contract is now published. Implementation remains blocked on
merchant customer permissions; shopper signup is not delivered.**

This earlier access blocker was resolved for Test before the implementation
and verification above. It is preserved here as historical evidence.

The current developer page at https://justicesure.ai/docs/headless-commerce
now documents shopper accounts. The live OpenAPI at
https://justicesure.ai/api/openapi/commerce-v1.json contains the corresponding
customer routes. Its SHA-256 on this check is
`7ca8755061d483533be04eddf1b0c23e99dec4d3a84d11b3b37cfb5584515acb`.
The page explicitly identifies the live OpenAPI, not the older immutable
handoff ZIP, as the reference for the shopper extension.

Supported operations include:

- `POST /customers/link` with a backend-derived stable authentication subject
  and provider-verified email ownership; the same subject/email can be retried
  safely, including concurrently.
- `GET` and `PATCH /customers/{externalId}` for profile and one free-text saved
  address (not an address book). Profile changes cannot update email.
- Paginated own-order summaries and owned online-order details.
- `customerExternalId` in order creation, with checkout email equal to the
  linked verified email; guest checkout omits this field.
- Capability-gated measurements and customer-safe production history.

Customer responses are direct private/no-store JSON, not commerce's usual
`data` envelope. Identity conflicts and ambiguous CRM matches require business
review; no automatic merging or historical guest-order claiming is allowed.

### Merchant access qualification

A read-only GET to `/customers/soso-contract-readiness-probe`, separately
using the configured Test and Live keys, returned the same result:

```json
{
  "status": 403,
  "code": "INSUFFICIENT_SCOPE",
  "requiredScope": "commerce:customers:read"
}
```

The provider's message states that the key lacks the required customer-read
scope. This proves the access blocker, not schema readiness or successful
customer linking. No customer write was attempted and no customer was created.

The developer page requires an owner to explicitly grant
`commerce:customers:read` and `commerce:customers:write`. Existing keys do not
gain these scopes automatically. Start with the isolated Test merchant key,
preserving its existing checkout scopes. If a replacement key is issued,
enter it through the secure secrets flow, never chat. JusticeSure also requires
its operator to install the additive customer schema; the merchant API cannot
perform that migration. Schema readiness cannot yet be determined because the
read request is rejected before customer access.

Clerk management status remains `managed`. Staff authentication, shopper
authentication, and newsletter consent must remain separate. No authentication,
checkout, or database behavior has been changed during qualification.

### Next step

After the owner grants customer access, repeat the scoped read. Resolve any
`CUSTOMER_SCHEMA_REQUIRED` result with JusticeSure's operator. Then implement
verified shopper identity, persistent tenant/environment-bound remote IDs,
visible signup/signin/profile screens, saved address and own-order history,
and server-only checkout binding. Completion still requires evidence that
signup itself creates or links the correct SOSO merchant customer.

---

## Historical assessment — 9 October 2026

The findings and provider request below describe the earlier contract only.
The missing-contract blocker has been superseded by the current assessment.

## Evidence

- Public documentation: https://justicesure.ai/docs/headless-commerce
- Current public OpenAPI: https://justicesure.ai/api/openapi/commerce-v1.json
  - SHA-256: `2cec51ee87eaf0b15d67fcd43f8c49c6dfff1664915c912c9fea297d54ac0319`
- Documentation-linked handoff: https://justicesure.ai/downloads/SOSO_JusticeSure_Headless_Commerce_Handoff_v3.10_2026-09-25.zip
  - SHA-256: `220f3a04ea66b59c3202291869558f2dcacbd9ce60cbc7795331fb5093f99de4`, matching the published value.
  - All 15 files in its checksum manifest verified.
  - Packaged OpenAPI SHA-256: `ce9bc6347390904429aae04fb6ba9ad2734908c9b0350408c13cee06d4deb3af`.

Both OpenAPI documents contain 25 paths and no customer-profile create,
retrieve, update, or saved-address routes. Their order-creation customer object
allows only `name`, `email`, and optional `phone`, with additional properties
forbidden. There is no supported remote customer identifier in that input.
The published access-scope list does not include customer-profile access.
These findings concern the supplied headless contract, not whether JusticeSure
has internal customer features.

The public and packaged OpenAPI files are not byte-identical. A supported
customer contract must identify its deployed revision rather than relying on
the shared `1.0.0` version label. Documentation describes the current package
as a source candidate, not proof of runtime or merchant qualification.

Clerk management status is `managed`. No Clerk configuration was changed.
Existing `/sign-in` is the Staff portal, `/sign-up` redirects there, and Staff
uses its own session flow. These must not be repurposed as shopper access.

No customer endpoints were guessed or probed, customer records written,
checkout enabled, database changed, or authentication flow migrated.
Checkout contact fields are not evidence that signup creates or links a
JusticeSure customer profile.

## Request to JusticeSure

Please provide a versioned, deployed, merchant-scoped customer API contract
for shoppers creating SOSO accounts before checkout, including:

1. **Tenant and environment authority:** how a server proves the exact SOSO
   business/entity and isolated Test or Live environment; least-privilege
   customer scopes and the merchant identity returned by the service.
2. **Create or link:** documented request/response schemas, a stable remote
   customer identifier, an opaque external identity reference, and safe
   handling of an existing customer. Specify proof needed to link records;
   an unverified email match is not sufficient.
3. **Retry safety:** durable idempotency, timeout recovery, conflict semantics,
   uniqueness boundaries, and concurrent-signup behavior. Signup must create
   or link the remote record without requiring a purchase.
4. **Retrieve and update:** supported profile fields, concurrency rules,
   verified-email changes, address limits/validation, deletion and retention
   behavior, and customer consent handling. No shopper password will be sent
   to JusticeSure.
5. **Order linking:** the supported server-authored customer binding on order
   creation and authoritative customer binding on order reads/events.
   Specify a bounded, paginated own-order retrieval method. Guest checkout
   must remain possible; existing guest orders must not be claimed solely
   from an email match.
6. **Qualification evidence:** an approved non-production SOSO tenant,
   deployed revision, and a way to verify that signup creates/links exactly
   one customer in that tenant's merchant customers list. Include evidence
   for replay, profile updates, order linking, and cross-tenant rejection.

Provide API documentation or a handoff file without credentials. Any new
credentials must be entered through the workspace's secure secrets flow.

## Resume and acceptance gates

Once the contract is qualified, implement separate visible shopper signup,
signin, profile, saved-address, and own-order screens with verified identity.
Persist the local identity/provider/environment/merchant-to-remote-customer
binding under appropriate uniqueness constraints. Resolve that binding only
on the server; never accept a browser-supplied remote customer ID.

Account creation and newsletter consent must be independent. Shopper
authentication must never grant Staff permissions, and guest checkout must
remain available.

Completion requires provider-backed evidence that **signup itself** creates
or links the correct SOSO merchant customer, plus verified ownership isolation
for profile, addresses, and order history. Local-only account screens or
synthetic API fixtures cannot satisfy the remote-profile requirement.
