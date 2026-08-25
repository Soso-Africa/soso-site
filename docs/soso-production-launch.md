# SOSO production launch runbook

## Purpose and current safety state

This runbook is the release gate for SOSO Africa's public storefront. The project is intentionally **not ready to index or describe as live commerce** until SOSO supplies approved business facts, legal text, support channels, a production domain, and the separate payment/fulfilment work is verified.

With no launch environment variables set, the storefront is safe by default:

- the initial HTML emits `noindex, nofollow`;
- `robots.txt` disallows crawling;
- no sitemap file is emitted;
- draft policies, unapproved catalogue content, empty Journal states, checkout, staff routes, auth routes, and 404s use `noindex`.

Do not bypass these defaults by adding a guessed domain or final-sounding copy.

## Inputs SOSO must approve before release

1. Registered business name, business address, official support email, phone, and WhatsApp channel.
2. Final privacy, cookies, terms, delivery, returns, refunds, cancellation, and care policies with an effective date and version.
3. Official product names, prices, sizes, material/fabric facts, availability, and product images with publishing rights.
4. Approved atelier/brand editorial facts, named authors, cover images, and initial Journal articles.
5. Final social-sharing image with rights to use it.
6. A verified production domain and the account that will own Search Console.
7. The confirmed payment, refund, delivery, customer-support, backup, and incident owners.

## Production SEO configuration

Set these build-time variables **only after the matching approval is complete**:

| Variable | Purpose |
| --- | --- |
| `VITE_PUBLIC_SITE_URL` | Approved canonical `https` production origin; never use a development preview URL. |
| `VITE_SOSO_INDEXING_ENABLED=true` | Master release switch for crawling, canonical URLs, and sitemap generation. |
| `VITE_SOSO_CATALOG_APPROVED=true` | Allows the shop and product routes into the sitemap and search. |
| `VITE_SOSO_POLICIES_APPROVED=true` | Allows policy routes into the sitemap and search after final text replaces the drafts. |
| `VITE_SOSO_JOURNAL_APPROVED=true` | Allows only Journal landing/article records present in the explicit approved SEO allowlist into search. |
| `VITE_SOSO_SOCIAL_IMAGE_PATH=/images/...` | Path to SOSO's approved social-sharing image. |

The storefront build generates `dist/public/robots.txt`, sitemap, RSS/Atom/JSON feeds, `llms.txt`, an SEO manifest, and clean-URL crawler HTML after Vite completes (`journal.html`, `journal/<slug>.html`, and equivalent files). The generator reads only the published platform record and published Journal rows when the corresponding approval gate is enabled. Vercel `cleanUrls` and filesystem handling serve those generated files before the SPA fallback, while React still hydrates them in browsers. Missing, private, preview, and unknown routes naturally use the SPA `index.html`; do not add explicit prerender rewrites or hand-edit generated files.

When indexing is disabled—or when the exact approved canonical origin is absent—the build retains private robots and removes every sitemap, feed, manifest, `llms.txt`, and generated route directory. Public generation accepts only `https://shopsoso.co`; an explicit `https://www.shopsoso.co` input is canonicalized to the apex and Vercel redirects www requests to that canonical origin. Do not use a preview URL or assume DNS has been cut over.

After publishing:

1. Open the production domain over HTTPS and check `/robots.txt` and `/sitemap.xml`.
2. Confirm canonical, Open Graph, Twitter, and robots tags on the home page, shop, one product, one final policy, and one published Journal article.
3. Validate Organization/WebSite and Product structured data in Google's Rich Results Test or Schema Markup Validator. Do not add Offer availability or review markup until SOSO has approved a source of truth for those facts.
4. Submit the exact production sitemap URL in the verified Search Console property. Do not submit a preview URL. Publish and validate individual Journal articles only after editorial approval and after their server-rendered title, body, description, canonical URL, social metadata, and article schema are confirmed; until the Journal approval gate is enabled they remain intentionally absent from generated search output.
5. Inspect Search Console's Page Indexing and Enhancements reports after the first crawl; resolve any `noindex`, canonical, mobile, or structured-data errors before marketing traffic is sent.

## Required release validation

For the Vercel-specific import flow, environment checklist, and post-deploy route checks, use [the Vercel deployment guide](./soso-vercel-deployment.md). Hosting the application does not relax any of the approval gates in this runbook.

### Local build and routes

Run:

```sh
pnpm --filter @workspace/soso-store run validate:release
```

This performs the storefront typecheck, static media/performance budgets, production build, and a local staging-like inspection of the generated release files. Save the command output with the release record. The static check rejects embedded image data, public image files over 512 KiB, a public-image total over 1 MiB, images without alternative text or layout reservation, and built client assets over 1 MiB. These are lightweight safeguards, not a substitute for real-device measurement.

Then verify the generated SEO files match the intended release state. A release build must only include a sitemap when the approved domain and master indexing switch are both present.

### Service health and readiness evidence

The API exposes the unauthenticated, non-sensitive process health endpoint `GET /api/healthz`. It intentionally reports only `{"status":"ok"}` and does not expose configuration, dependency status, or secrets. The deployment startup health check uses this endpoint.

For a local or staging-like environment, after the managed services are available, capture:

```sh
curl --fail --silent --show-error http://localhost:80/api/healthz
```

Record the response, timestamp, target environment, and release identifier. Do not treat this process-level endpoint as proof that payment, database recovery, or third-party providers are operational; those have separate release gates.

### Accessibility and supported mobile devices

Test the homepage, product page, size selection, cart, checkout, privacy choices, policies, Journal, and mobile menu on the actual supported devices/browsers named by SOSO.

- Keyboard: use Tab, Shift+Tab, Enter, Space, and Escape. The visible focus indicator, skip link, mobile menu controls, cart, size controls, policy links, and consent controls must all work without a mouse.
- Screen reader: confirm landmark names, one page heading, image alt text, form labels, status/error messages, and dialog/menu labels are announced correctly.
- Contrast: check normal and hover/focus text against each background, especially gold controls and muted copy.
- Mobile: test at 320px, 375px, and 390px widths as well as one real Android and one real iOS device. Verify no horizontal scrolling, that the sticky buy action is reachable, and that checkout form controls are not obscured by the keyboard.

Record the device, browser, route, tester, date, and any remediation in the release record.

### Performance

Run Lighthouse or an equivalent real-device test on the published production domain with a cold cache. Capture mobile scores and Core Web Vitals for the home page, shop, a product page, Journal, and checkout. Fix large images, layout shifts, broken fonts, or blocking network requests before launch.

## Operations procedures

### Live atelier-day roles

Before any live atelier day, use [the staff role checklist](./soso-live-atelier-role-checklist.md) to confirm the active owner, operations lead, stylist/support contact, analyst, and editor have the minimum role needed for their shift and no broader access. This is a local permission and handoff guide, not evidence that SOSO has approved a roster or activated payment/fulfilment.

### Incident and payment-failure response

1. Name an incident lead, customer-support owner, technical owner, and decision-maker before publishing.
2. When checkout or payment fails, pause paid traffic that points to checkout, preserve timestamps/order references, and confirm whether any payment was actually captured before replying to a customer.
3. If an approved payment may be affected, use the payment provider and order system as the source of truth; never request card details over email, chat, or WhatsApp.
4. Publish a factual customer update through the approved support channel, log the incident, and complete a short post-incident review before reopening the path.

### Backup and restore drill

1. Identify every persistent source: production database, payment/order provider records, editorial records, and uploaded media.
2. Confirm each source's backup owner, frequency, retention, encryption/access controls, and restore contact.
3. Perform a non-destructive restore drill into an isolated local, test, preview, or staging environment and record the recovery time and result. Never supply production credentials or a production target to a release validation command.
4. Create `backup-manifest.json` and `restored-manifest.json` in `artifacts/soso-store/.release-evidence/backup-restore/` (or set `BACKUP_RESTORE_EVIDENCE_DIR`). Each file must contain `environment` (`local`, `staging`, `preview`, or `test`), `production: false`, `snapshotId`, `integrityHash`, and non-negative integer `recordCount`. Use the same snapshot ID, integrity hash, and record count in both files only after the isolated restore has been checked.
5. Run this evidence-only verifier; it is hard-disabled under `NODE_ENV=production` and makes no network, database, or restore calls:

   ```sh
   NODE_ENV=staging pnpm --filter @workspace/soso-store run verify:backup-restore
   ```

6. Save the manifests (without credentials or personal data), command output, restore target, operator, date, and measured recovery time in the release record. Repeat before major schema, payment, or catalogue changes.

### Monitoring boundary

No external monitoring, alerting, uptime, error-tracking, or analytics provider is configured by these safeguards. Keep provider credentials and integrations unconfigured until SOSO approves an owner, data handling, alert policy, retention, escalation process, and budget. Until then, retain the health-check and release/restore evidence above as local operational evidence; they do not create external alerts.

### Privacy access-package procedure

The staff workspace may generate a subject-access package **only after an owner has verified identity and recorded verification evidence**. The package is intentionally bounded to the requester's matched orders, order items, enquiries, and checkout-attempt records. It excludes payment card data, payment-provider references and tokens, staff/audit records, credentials, and anonymous analytics.

The owner downloads the server-stored package through a one-time, 24-hour link. The package contents are never placed in audit metadata; audit records retain only the package reference, hash, row counts, and the generating/downloading owner. Do not email, paste, or re-upload the exported JSON to an unapproved service.

Deletion requests remain operationally blocked. Staff may receive and verify them, but must not mark them complete until SOSO approves the retention schedule, legal basis, jurisdictional process, and deletion procedure.

### Analytics interpretation boundary

Staff reporting is consent-gated and aggregate only. It offers custom ranges, equal-length prior-period comparisons, anonymous new/returning visitor splits, acquisition and country aggregates, funnel event rates, session-stage journeys, and signal freshness/coverage.

`payment_clicked` is only an intent event. It is not payment success, revenue, paid conversion attribution, CAC, or a verified order. Editorial article-to-product/stylist handoffs are reported only as non-payment assist signals until a provider-authoritative order/payment link is approved and implemented.

### Customer support handoff

1. Publish only the approved support channels in final policy text and checkout communications.
2. Give support a current escalation matrix for sizing, payment failure, order status, delivery delay, cancellation/refund, privacy requests, and security incidents.
3. Use order references and the approved system of record; do not place personal details in unapproved tools.
4. Test one complete support case from shopper question through handoff, resolution, and customer confirmation.

## Release decision

The release owner signs off only when every applicable item above is evidenced, the separate payment/fulfilment launch gate is complete, and no draft or unapproved content is indexed. If any item is missing, keep the indexing switch off and record the blocker rather than shipping a partial public claim.