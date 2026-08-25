# Database migrations

Production schema changes must be additive and checked in before API code that
depends on them is deployed. For the SOSO content CMS changes, apply the exact
reviewed SQL migration with the production `DATABASE_URL`:

```sh
pnpm --filter @workspace/db run migrate:soso-content
```

The command runs the checked-in SOSO migrations in filename order inside one
transaction, currently `0001_soso_content_cms.sql` through
`0003_marketing_pixel_settings.sql`, and rolls the batch back on failure. Each SQL
migration is idempotent, so the command can be run again safely.

For subsequent schema changes, compare the Drizzle schema with the current
production base, review the generated schema diff, and check in a new additive,
idempotent SQL migration. Apply that migration before deploying API code. Do
not use `drizzle-kit push` against production and do not put migrations in API
startup or build hooks.