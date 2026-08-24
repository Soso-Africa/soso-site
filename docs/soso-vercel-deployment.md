# SOSO Vercel deployment

## Deployment shape

Deploy `Soso-Africa/soso-site` as **one Vercel project from the repository root**.

- The Vite storefront is built to `artifacts/soso-store/dist/public`.
 - `api/[...path].mjs` exposes the compiled Express application as a Vercel Function for `/api/*`.
- The storefront intentionally uses same-origin API paths, so do not set `VITE_API_BASE_URL` for this deployment.
- The Vercel rewrite keeps client-side route refreshes working and explicitly excludes `/api` so API requests always reach the serverless function.

Do not point Vercel at `artifacts/soso-store` as the project root: the API and workspace packages are required by the full-stack deployment.

## Clerk hosting decision

SOSO currently uses **Replit-managed Clerk**. Replit provisions those Development and Production keys automatically, and the project is confirmed to be in the managed mode. Replit-managed Clerk is designed for Replit hosting: its live keys are not exportable for external hosts such as Vercel.

Choose one of these hosting paths before putting SOSO on Vercel:

1. **Keep Replit-managed Clerk and host on Replit.** Replit automatically switches from Development/test keys to Production/live keys when the app is published.
2. **Host on Vercel and use an external Clerk instance.** Create and configure your own Clerk Development and Production environments, then migrate the app's authentication configuration. Store that provider's keys in Vercel as described below. Do not replace or edit the existing Replit-managed keys in the Replit Secrets pane.

Until option 2 is completed, Vercel can only be treated as an unauthenticated storefront experiment; it is not a valid full-stack SOSO deployment because staff authentication cannot be carried over from Replit-managed Clerk.

SOSO staff sign-in uses secure, same-origin HTTP-only session cookies. A Vercel Preview URL works for testing; production should use the approved SOSO domain and HTTPS.

## Database decision

The Replit development database is currently reachable, but this project does not have a Replit production database yet. Replit creates its production database when the project is published through Replit; there is no separate database-creation action. Publishing through Replit would also create a second hosted deployment, which is not required if Vercel is the chosen host.

For a Vercel-hosted production app, use a production PostgreSQL database with a connection string that Vercel Functions can reach over the network. Keep it separate from the development database and from any preview database. Put its `DATABASE_URL` only in Vercel's encrypted Production environment variable store; never commit it or paste it into source files. Before launch, run the schema through the project's approved production migration path and verify connectivity with `/api/healthz`.

## Import steps

1. In Vercel, create a project by importing `Soso-Africa/soso-site`.
2. Keep the **Root Directory** as the repository root.
3. Allow the committed `vercel.json` to supply the install command, build command, and output directory.
4. Add the environment variables below before deploying a preview.
5. Deploy a preview first and confirm `GET /api/healthz`, a storefront deep link, Clerk sign-in, and one staff route behave as expected.
6. Add and verify the owned production domain in both Vercel and external Clerk before enabling Production Clerk keys and the Clerk proxy. Do not enable SEO or commerce release switches as part of the hosting setup.

Vercel must have GitHub application access to the `Soso-Africa` organization. If the repository cannot be selected during import, an organization owner must grant Vercel access in GitHub's third-party application settings.

## Environment variables

Vite values are embedded into the client bundle at build time. Change a `VITE_*` value only through Vercel environment settings and redeploy; never place secrets in a `VITE_*` variable.

### Required for the full-stack preview and production deployment after external Clerk setup

The Clerk values below must come from the external Clerk instance created for the Vercel deployment. They cannot be copied from Replit-managed Clerk.

| Variable | Environments | Purpose |
| --- | --- | --- |
| `SESSION_SECRET` | Preview, Production | Required server session signing secret. |
| `STAFF_BOOTSTRAP_TOKEN` | Preview, Production | One-time secret used only when creating the first SOSO owner password; remove after setup. |
| `DATABASE_URL` | Preview, Production | PostgreSQL connection used by the API. Use a network-reachable database and a pooled/serverless-safe connection string. |

No third-party authentication proxy or browser key is required.

Before Preview validation, apply the Drizzle schema to the exact PostgreSQL target configured in Vercel Preview. Run the migration from a private environment where that target `DATABASE_URL` is available:

```sh
pnpm --filter @workspace/db run push
```

Do not paste the connection string into chat, source control, or a `VITE_*` variable. A working `/api/faq` alongside a failing `/api/redirects` means the database is reachable but the redirect table or its permissions are missing; it is not a general database connectivity failure.

### Optional operational values

| Variable | Purpose |
| --- | --- |
| `PRIVACY_POLICY_VERSION` | Labels recorded privacy-request policy versions. |
| `LOG_LEVEL` | Server log verbosity; use `info` unless troubleshooting. |
| `VITE_CLOUDINARY_UPLOAD_PRESET` | Public Cloudinary upload preset for approved staff image-upload flows. |

### Keep unset until their separate approval gates pass

| Variable group | Required decision before setting it |
| --- | --- |
| `VITE_PUBLIC_SITE_URL`, `VITE_SOSO_INDEXING_ENABLED`, `VITE_SOSO_CATALOG_APPROVED`, `VITE_SOSO_POLICIES_APPROVED`, `VITE_SOSO_JOURNAL_APPROVED`, `VITE_SOSO_SOCIAL_IMAGE_PATH` | Approved production domain, legal text, catalogue/editorial facts, and search-owner sign-off. |
| `VITE_COMMERCE_MODE=justicesure-headless`, `JUSTICESURE_COMMERCE_BASE_URL`, `JUSTICESURE_COMMERCE_API_KEY`, `JUSTICESURE_COMMERCE_WEBHOOK_SECRET`, `JUSTICESURE_PAYMENT_PROVIDER`, `JUSTICESURE_COMMERCE_RUNTIME_READY`, `SOSO_PAYMENT_RETURN_URL` | JusticeSure contract, payment/refund/webhook validation, fulfilment acceptance, and named operational owners. |

With these launch-only values unset, the storefront remains deliberately noindex and checkout remains in safe catalogue-preview mode.

## Post-deploy checks

1. Request `/api/healthz` and expect only `{"status":"ok"}`.
2. Open `/shop` directly in a new browser tab and confirm the storefront loads rather than returning a 404.
3. Open `/staff` unauthenticated and confirm the Clerk sign-in boundary appears without staff data. The Clerk sign-in controls themselves must load; a branded page shell without the email/social controls is a failed sign-in check.
4. Request `/api/redirects?path=/shop` and expect `{"redirect":null}` before staff configure any redirects. A 500 requires the Preview database schema/permissions to be corrected before proceeding.
5. Confirm `/robots.txt` still disallows crawling and no XML sitemap is emitted while release switches remain off. Vercel’s SPA rewrite can return the noindex HTML shell for `/sitemap.xml`; confirm the response is not XML and contains no `<urlset>` sitemap.
6. Record the Vercel preview URL, deployment timestamp, tested routes, and database target in the release record. A successful deployment does not satisfy the separate JusticeSure, legal, SEO, roster, backup, or real-device launch gates.
