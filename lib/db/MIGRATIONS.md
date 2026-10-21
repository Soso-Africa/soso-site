# Database migrations

## Catalogue import release preparation

Vercel production builds run `node lib/db/scripts/ensure-catalogue-import-schema.mjs`.
This applies only `0019_catalogue_import_ledger.sql` under the migration lock,
verifies the two recovery tables' columns, defaults, constraints and lookup
index, and preserves existing rows. A mismatched existing schema fails the
build rather than being silently repaired. Preview/development builds skip
this operation. The full migration queue is not run by this release helper.

Development qualification: `node lib/db/scripts/test-catalogue-import-release-schema.mjs`
creates and drops only a uniquely named synthetic schema, testing fresh/repeat
preparation, retained rows and refused malformed schemas.

Production schema changes must be additive and checked in before API code that
depends on them is deployed. Apply the reviewed SOSO migrations with the target
database's `DATABASE_URL`:

```sh
pnpm --filter @workspace/db run migrate:soso-content
```

## Fresh initialization

On a completely empty PostgreSQL schema, the command first applies
`0000_soso_current_baseline.sql`, then every later additive migration in filename
order. The baseline contains the full current Drizzle schema; the later
migrations retain reviewed production constraints and seed the approved FAQ
content. The complete batch runs in one transaction and rolls back on failure.

The runner refuses a partial SOSO schema unless all tables and enums from the
pre-baseline legacy schema are present. This prevents the fresh baseline from
being merged over unknown partial state or skipped because of one stray base
table. After every migration run, it also verifies the baseline's required
column definitions, ordered enum values, full constraint definitions, and index
definitions against the reviewed schema fingerprint before committing.

## Incremental upgrades and repeat runs

The catalogue import recovery release adds `0019_catalogue_import_ledger.sql`.
Apply the reviewed additive migrations before serving its API routes. It stores
Staff-owned upload identities and bounded review metadata only, never upload
authorizations or file bytes. This is not a media backup.

Isolated verification with unresolved uploads exports exact ledger identities to
`generated-artifacts/import-ledgers/` and **retains the isolated schema, Staff
owners and reference history**. A mandatory authorization-expiry wait is reported
as deferred cleanup, not a failed pilot. The real import pilot requires this
wrapper:

```sh
node lib/db/scripts/run-in-isolated-soso-schema.mjs node artifacts/soso-store/scripts/test-catalogue-import-browser.mjs
```

After the manifest's `notBefore` time, use the same database and media environment:

```sh
node lib/db/scripts/cleanup-retained-import-ledger.mjs generated-artifacts/import-ledgers/<retained-schema>.json --discard-verification-draft-history
```

The discard flag removes only exact, unchanged verification-only draft-history
records and owned import reviews from that guarded disposable schema. Current
drafts, published content, Journal content and other history still block cleanup.
Every deletion uses the normal owned-record, locked fresh reference checker.
Waiting or blocked cleanup preserves the schema and evidence. Only confirmed
cleanup of every recorded upload permits the runner to remove that isolated
schema and clear the pilot's matching preflight records. Keep the manifest until
then; never reconstruct an earlier unrecorded pilot's objects from timestamps or
bucket prefixes.

On an existing SOSO database, the command recognizes the complete legacy base
and skips the fresh-only baseline. It then reruns the additive, idempotent
migrations in filename order, currently `0001_soso_content_cms.sql` through
`0007_accessory_launch_notifications.sql`. Existing rows are preserved and the approved
FAQ seed is recorded once.

Validate fresh initialization, repeat execution, a real legacy upgrade, and
incompatible-schema rollback in temporary isolated schemas with:

```sh
pnpm run test:migrations
```

The required `db-migrations` merge check runs this root command automatically
for database and migration changes. Any failed migration scenario exits non-zero
and blocks the check independently of the API and storefront suites. Each run
creates UUID-named schemas in the PostgreSQL database from `DATABASE_URL` and
drops all fresh, legacy, and incompatible test schemas in a `finally` cleanup,
including when an assertion or migration fails.

For subsequent schema changes, compare the Drizzle schema with the current
production base, review the generated schema diff, and check in a new additive,
idempotent SQL migration. Apply that migration before deploying API code. Do
not use `drizzle-kit push` against production and do not put migrations in API
startup or build hooks.
