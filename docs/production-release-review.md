# Pending production release review

## Publication states

A merged Replit task is workspace implementation, not GitHub main or a live
Vercel release. A green preview is not production verification. Promote only
the exact reviewed commit through the existing GitHub/Vercel process, without
disabling required checks, then verify the actual production source and routes.

## Reviewed inventory — 21 October 2026

At review time, GitHub main and the latest Ready Vercel production deployment
both reported `bf25d0ab6e76f9d8a9a433e89dcdef11a38f40e5`.

| Work | Disposition |
| --- | --- |
| Spreadsheet/photo importer, hosted Drive flow and Staff production guide | Included in the importer release, initially PR #62; not live merely because its preview passed. |
| Subsequently merged server-backed review/upload recovery | Include with the importer, including owned cleanup, retained verification ledgers, additive schema preparation and revised guide. |
| Delivery-fee qualification | Include the non-charging Test qualification script and report. This adds evidence, not new Live rates or checkout activation. Test flat pricing was qualified; Live distance policy changes and invalid-destination qualification remain explicitly deferred. |
| Open PR #54, Staff verified-order totals/payment warning | Core reporting helper and Staff API files already match main exactly; remaining Staff/test files have later changes. Preserve current behavior rather than merge the older branch. |
| Open PR #40, domestic delivery | All paths already exist on main; eleven match exactly, including structured delivery fields/address types. Current payment/activation/checkout paths contain later changes. Preserve them and run the current checkout gate; do not replace them with this old branch. |
| Open PR #38, reduced database transfer | Eight files match main exactly, including projection/cache/lifecycle tests. Cache/content/Staff files have later revisions. Preserve current lightweight projection, version-cache and visibility behavior. |
| Open PR #1, storefront visual release check | Its gate and assets already exist on main and have evolved. Preserve the strict required Vercel status, current gate and approved baselines; do not restore old screenshots or configuration. |

No old PR is automatically merged, closed or treated as rejected by this
inventory. Only reviewed changes absent from the selected production source
belong in the release.

## Activation and safety boundaries

- Hosted Google Drive needs the separate Google OAuth application and real
  consent qualification described in `catalogue-bulk-import.md`. An installed
  workspace connector is not production authorization. Until configured, use
  local photo folders; never claim direct Drive is activated.
- The build prepares only the additive recovery schema. It never runs the
  complete migration queue or replaces merchant catalogue data.
- Importing creates unpublished, unavailable, non-selling placeholders.
  Deploying the importer does not publish products or enable checkout.
- No Live delivery policy edits, charge, payment session or production trial
  catalogue is part of this release.
- Exact test media with valid authorizations remains recoverable in retained
  verification ledgers until guarded cleanup is allowed. Do not guess unknown
  earlier paths or bypass reference/expiry checks.

## Acceptance

Record the final release commit, exact Vercel status and production commit
separately. Required evidence includes current client-review and checkout
checks, production bundle verification, recovery/schema tests and a bounded
browser recovery pass. A protected Vercel login redirect does not verify the
application runtime. After user-controlled promotion, verify health, public
hard-entry routes and Staff authentication boundaries without mutating live
data. If promotion has not occurred, explicitly report production unchanged.
