# SOSO Vercel deployment

## Deployment shape

Deploy `Soso-Africa/soso-site` as **one Vercel project from the repository root**.

- The Vite storefront is built to `artifacts/soso-store/dist/public`.
- `api/[...path].ts` exposes the existing Express application as a Vercel Function for `/api/*`.
- The storefront intentionally uses same-origin API paths, so do not set `VITE_API_BASE_URL` for this deployment.
- The Vercel rewrite keeps client-side route refreshes working and explicitly excludes `/api` so API requests always reach the serverless function.

Do not point Vercel at `artifacts/soso-store` as the project root: the API and workspace packages are required by the full-stack deployment.

## Database decision

The Replit development database is currently reachable, but this project does not have a Replit production database yet. Replit creates its production database when the project is published through Replit; there is no separate database-creation action. Publishing through Replit would also create a second hosted deployment, which is not required if Vercel is the chosen host.

For a Vercel-hosted production app, use a production PostgreSQL database with a connection string that Vercel Functions can reach over the network. Keep it separate from the development database and from any preview database. Put its `DATABASE_URL` only in Vercel's encrypted Production environment variable store; never commit it or paste it into source files. Before launch, run the schema through the project's approved production migration path and verify connectivity with `/api/healthz`.

## Import steps

1. In Vercel, create a project by importing `Soso-Africa/soso-site`.
2. Keep the **Root Directory** as the repository root.
3. Allow the committed `vercel.json` to supply the install command, build command, and output directory.
4. Add the environment variables below before deploying a preview.
5. Deploy a preview first and confirm `GET /api/healthz`, a storefront deep link, Clerk sign-in, and one staff route behave as expected.
6. Add the verified production domain only after the preview is healthy. Do not enable SEO or commerce release switches as part of the hosting setup.

Vercel must have GitHub application access to the `Soso-Africa` organization. If the repository cannot be selected during import, an organization owner must grant Vercel access in GitHub's third-party application settings.

## Environment variables

Vite values are embedded into the client bundle at build time. Change a `VITE_*` value only through Vercel environment settings and redeploy; never place secrets in a `VITE_*` variable.

### Required for the full-stack preview and production deployment

| Variable | Environments | Purpose |
| --- | --- | --- |
| `VITE_CLERK_PUBLISHABLE_KEY` | Preview, Production | Browser-side Clerk initialization. |
| `CLERK_PUBLISHABLE_KEY` | Preview, Production | Server-side Clerk host fallback. |
| `CLERK_SECRET_KEY` | Preview, Production | Server-side authentication and optional Clerk proxy. |
| `DATABASE_URL` | Preview, Production | PostgreSQL connection used by the API. Use a network-reachable database and a pooled/serverless-safe connection string. |

`VITE_CLERK_PROXY_URL=/api/__clerk` is recommended when Clerk's same-origin proxy is required for the deployed domain. It is a public route, not a secret.

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
3. Open `/staff` unauthenticated and confirm the Clerk sign-in boundary appears without staff data.
4. Confirm `/robots.txt` still disallows crawling and no sitemap is emitted while release switches remain off.
5. Record the Vercel preview URL, deployment timestamp, tested routes, and database target in the release record. A successful deployment does not satisfy the separate JusticeSure, legal, SEO, roster, backup, or real-device launch gates.