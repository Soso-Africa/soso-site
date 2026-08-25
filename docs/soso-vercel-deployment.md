# SOSO Vercel deployment

## Deployment shape

Deploy `Soso-Africa/soso-site` as **one Vercel project from the repository root**.

- The Vite storefront is built to `artifacts/soso-store/dist/public`.
- `api/handler.js` exposes the compiled Express application as a Vercel Function for `/api` and `/api/*`.
- The storefront intentionally uses same-origin API paths, so do not set `VITE_API_BASE_URL` for this deployment.
- The Vercel rewrite keeps client-side route refreshes working and explicitly excludes `/api` so API requests always reach the serverless function.

Do not point Vercel at `artifacts/soso-store` as the project root: the API and workspace packages are required by the full-stack deployment.

## Authentication decision

SOSO staff authentication is self-contained and does not use Clerk at runtime. Staff credentials are hashed with scrypt, sessions are stored in PostgreSQL, and the browser receives a secure same-origin HTTP-only cookie.

Create the first owner with the one-time `STAFF_BOOTSTRAP_TOKEN`, verify owner login and role administration, then remove or rotate the bootstrap token. Production must use HTTPS so the secure cookie is never sent over an unencrypted connection. Clerk keys and `SESSION_SECRET` are not runtime requirements for this authentication system.

## Database decision

Production uses a network-reachable PostgreSQL database outside Replit (currently Neon). Keep it separate from development and Preview. Put its pooled/serverless-safe `DATABASE_URL` only in Vercel's encrypted Production environment variable store; never commit it or paste it into source files. The build reads published content to generate governed SEO assets, so the Production database must permit both Vercel build-time and Function connectivity. Apply the approved migrations before launch and verify connectivity with `/api/readyz`.

## Import steps

1. In Vercel, create a project by importing `Soso-Africa/soso-site`.
2. Keep the **Root Directory** as the repository root.
3. Allow the committed `vercel.json` to supply the install command, build command, and output directory.
4. Add the environment variables below before deploying a preview.
5. Deploy a preview first and confirm `GET /api/healthz`, `GET /api/readyz`, a storefront deep link, staff sign-in, and one authenticated staff route behave as expected.
6. Add and verify the owned production domain in Vercel. Do not enable SEO or commerce release switches as part of the hosting setup.

Vercel must have GitHub application access to the `Soso-Africa` organization. If the repository cannot be selected during import, an organization owner must grant Vercel access in GitHub's third-party application settings.

## Environment variables

Vite values are embedded into the client bundle at build time. Change a `VITE_*` value only through Vercel environment settings and redeploy; never place secrets in a `VITE_*` variable.

### Required for the full-stack preview and production deployment

| Variable | Environments | Purpose |
| --- | --- | --- |
| `STAFF_BOOTSTRAP_TOKEN` | Preview, Production | One-time secret used only when creating the first SOSO owner password; remove after setup. |
| `DATABASE_URL` | Preview, Production | PostgreSQL connection used by the API. Use a network-reachable database and a pooled/serverless-safe connection string. |
| `CLOUDINARY_CLOUD_NAME` | Preview, Production | Cloudinary cloud identifier used by the server to authorize and resolve staff media. |
| `CLOUDINARY_API_KEY` | Preview, Production | Sensitive Cloudinary API key used only in short-lived signed upload authorizations. |
| `CLOUDINARY_API_SECRET` | Preview, Production | Sensitive server-only Cloudinary signing secret. Never expose this through a `VITE_*` variable. |

No Clerk, Replit authentication proxy, Replit storage value, or browser authentication key is required.

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

SOSO media uploads are signed by the API and sent directly from the staff browser to Cloudinary. The app does not require a public unsigned upload preset or any Replit Object Storage variables.

### Keep unset until their separate approval gates pass

| Variable group | Required decision before setting it |
| --- | --- |
| `VITE_PUBLIC_SITE_URL`, `VITE_SOSO_INDEXING_ENABLED`, `VITE_SOSO_CATALOG_APPROVED`, `VITE_SOSO_POLICIES_APPROVED`, `VITE_SOSO_JOURNAL_APPROVED`, `VITE_SOSO_SOCIAL_IMAGE_PATH` | Approved production domain, legal text, catalogue/editorial facts, and search-owner sign-off. |
| `VITE_COMMERCE_MODE=justicesure-headless`, `JUSTICESURE_COMMERCE_BASE_URL`, `JUSTICESURE_COMMERCE_API_KEY`, `JUSTICESURE_COMMERCE_WEBHOOK_SECRET`, `JUSTICESURE_PAYMENT_PROVIDER`, `JUSTICESURE_COMMERCE_RUNTIME_READY`, `SOSO_PAYMENT_RETURN_URL` | JusticeSure contract, payment/refund/webhook validation, fulfilment acceptance, and named operational owners. |

With these launch-only values unset, the storefront remains deliberately noindex and checkout remains in safe catalogue-preview mode.

## Post-deploy checks

1. Request `/api/healthz` and expect only `{"status":"ok"}`. Then request `/api/readyz` and expect `{"status":"ok","database":"ok"}`; this second check proves PostgreSQL connectivity.
2. Open `/shop` directly in a new browser tab and confirm the storefront loads rather than returning a 404.
3. Open `/staff` unauthenticated and confirm the SOSO staff sign-in boundary appears without staff data. Verify owner login, secure cookie persistence, logout, and role authorization.
4. Request `/api/redirects?path=/shop` and expect `{"redirect":null}` before staff configure any redirects. A 500 requires the Preview database schema/permissions to be corrected before proceeding.
5. Confirm `/robots.txt` still disallows crawling and no XML sitemap is emitted while release switches remain off. Vercel’s SPA rewrite can return the noindex HTML shell for `/sitemap.xml`; confirm the response is not XML and contains no `<urlset>` sitemap.
6. Confirm the build log reports both the Cloudinary production storage diagnostic and the non-Replit runtime scan as passed.
7. Record the Vercel preview URL, deployment timestamp, tested routes, and database target in the release record. A successful deployment does not satisfy the separate JusticeSure, legal, SEO, roster, backup, or real-device launch gates.
