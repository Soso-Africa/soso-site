# Database migrations

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

On an existing SOSO database, the command recognizes the complete legacy base
and skips the fresh-only baseline. It then reruns the additive, idempotent
migrations in filename order, currently `0001_soso_content_cms.sql` through
`0004_custom_atelier_handoff.sql`. Existing rows are preserved and the approved
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
