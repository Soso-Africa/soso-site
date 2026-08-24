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

The storefront build generates `dist/public/robots.txt`, `dist/public/sitemap.xml`, and an internal SEO manifest after Vite completes. The generated storefront sitemap is the public sitemap; the API sitemap is intentionally conservative and does not infer Journal approval from publication status. A production response layer sets route-specific robots and canonical metadata before React loads. Do not hand-edit generated files. The committed `public/robots.txt` is deliberately private as a safety fallback.

Before enabling Journal indexing, add each approved, published article's factual SEO record to `src/data/journal-seo.json`. The record is the explicit publication allowlist used by the response layer and sitemap; keep it empty until editorial approval:

```json
{
  "articles": []
}
```

Each approved entry must include `slug`, `title`, `excerpt`, `authorName`, and `publishedAt`, with an optional approved `coverImageUrl`. Its slug must exactly match the published Journal post. Remove or update the entry before archiving or materially changing an article, then rebuild and redeploy.

After publishing:

1. Open the production domain over HTTPS and check `/robots.txt` and `/sitemap.xml`.
2. Confirm canonical, Open Graph, Twitter, and robots tags on the home page, shop, one product, one final policy, and one published Journal article.
3. Validate Organization/WebSite and Product structured data in Google's Rich Results Test or Schema Markup Validator. Do not add Offer availability or review markup until SOSO has approved a source of truth for those facts.
4. Submit the exact production sitemap URL in the verified Search Console property. Do not submit a preview URL. Publish and validate individual Journal articles only after their approved record is in `journal-seo.json` and their server-rendered title, description, canonical URL, and article schema are confirmed; until then they remain intentionally noindex.
5. Inspect Search Console's Page Indexing and Enhancements reports after the first crawl; resolve any `noindex`, canonical, mobile, or structured-data errors before marketing traffic is sent.

## Required release validation

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

### Customer support handoff

1. Publish only the approved support channels in final policy text and checkout communications.
2. Give support a current escalation matrix for sizing, payment failure, order status, delivery delay, cancellation/refund, privacy requests, and security incidents.
3. Use order references and the approved system of record; do not place personal details in unapproved tools.
4. Test one complete support case from shopper question through handoff, resolution, and customer confirmation.

## Release decision

The release owner signs off only when every applicable item above is evidenced, the separate payment/fulfilment launch gate is complete, and no draft or unapproved content is indexed. If any item is missing, keep the indexing switch off and record the blocker rather than shipping a partial public claim.