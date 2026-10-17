# SOSO independent media operations

## Current activation state

The owner repaired Worker-write permission. Native Cloudflare **Free-plan**
execution has verified isolated 1 MiB and 12 MiB copies, full read-back and the
actual delivery monitor. Production initialization uses a temporary minute trigger
with an explicit expiration, followed by the two approved permanent schedules.
The deployment receipt and private report must confirm completion before
describing initialization or the Staff website release as live.

The existing Cloudflare connection needs **Account → Workers Scripts → Edit**
on the SOSO account. Its current object-storage permissions must remain scoped;
do not give the storefront access to the independent backup bucket. Workers.dev
subdomain administration is unnecessary: the services have no public routes.

## Approved operating policy

- Daily backup: `15 3 * * *` UTC, 04:15 Lagos.
- Anonymous photo delivery check: `0 * * * *` UTC.
- At most 100,000,000 original bytes attempted per daily run/date, including
  retries, and 1,000,000,000 bytes reserved for additional independent backups.
- A bounded 16 originals per run and eight inventory pages per source prefix.
  Remaining work stays pending and warns Staff; nothing silently claims success.
- Reservations include a 4 MB checkpoint/report allowance and 32 KiB per original
  for recovery metadata. A failed or interrupted copy retains its reservation.
- No automatic deletion or pruning. Preserve the existing Cloudinary archive.
- These application guards are **not** account-wide billing caps or guaranteed
  free allowances. No billing/subscription change is part of activation.

## Privilege and recovery boundaries

`SOURCE` is the private runtime bucket; `BACKUP` is the separately private archive.
Neither service has a public-bucket binding or any object-deletion code.
The storefront only reads a small sanitized summary from the private runtime
bucket. It never receives backup credentials or recovery records.

The executor uses a private named service binding (`BackupExecutor`) rather than
an HTTP administration endpoint. Default HTTP behavior is always 404. Keep
workers.dev disabled and do not add public routes.

Each new original is immutable by logical key and source ETag. Its recovery record
contains the full SHA-256, byte size, original HTTP/custom metadata and a pointer
to the independently copied bytes. Both streams undergo full SHA-256 comparison.
An interrupted copy is resumed only after full checksum/read-back verification.

The backup covers **originals and their ownership/recovery metadata**, not a
byte-exact archive of every regenerated responsive derivative. Restore an original
to an isolated namespace first. Rebuild missing responsive media through the
governed pipeline; never overwrite conflicting immutable delivery objects or
silently publish a draft. The daily policy also means new uploads have an
unprotected interval until a completed backup; Staff must see this limitation.

## Activation checklist after permission repair

1. Re-read the existing Cloudflare connection instructions; proxy paths start
   `/v4`, relative to its API base ending `/client`.
2. Run the seed command **without** `--seed`. It must map every original in the
   verified cutover runtime inventory to the independent legacy checksum record.
   Then use `--seed` once. It refuses an existing checkpoint.
3. Create a persistent private synthetic pixel under
   `uploads/_soso_ops_private_<random hex>.png`, using conditional creation, and
   configure `PRIVACY_CANARY_KEY`. Never publish this pixel.
4. Upload the four ESM modules in `deployment.json` to the executor first.
   Bind `SOURCE` and `BACKUP` to the specified private buckets and set
   `BACKUP_PREFIX=r2-runtime/v1`, `SOURCE_NAMESPACE=""`.
5. Upload the same modules to the coordinator. Add service binding `EXECUTOR`,
   service `soso-media-backup-executor`, entrypoint `BackupExecutor`; add
   `DAILY_CRON`, `PRIVACY_CANARY_KEY` and `STATUS_KEY` plaintext bindings.
6. Keep both public subdomains disabled and routes empty. Configure only the two
   approved schedules on the coordinator. Never schedule the executor directly.
7. Confirm actual **Free-plan Worker** execution and CPU/subrequest usage using
   isolated source/archive namespaces before relying on the service. The Free
   plan has a 10 ms CPU allowance; the Node/S3 adapter test does not prove this
   edge-runtime limit is satisfied. Do not upgrade the plan to bypass a failure.
   Do not explicitly configure `limits.cpu_ms` on Free: Cloudflare rejects that
   field even when its value is 10. Free applies the 10 ms allowance itself.
8. Observe successful actual scheduled invocations, the private report and its
   timestamps, then deploy the Staff report reader/display through the existing
   protected website release process. Until this happens, do not claim the
   schedules or Staff warnings are live.

## Verification

```sh
node --test workers/soso-media-operations/operations.test.mjs
node scripts/seed-r2-independent-backup.mjs
node scripts/verify-r2-independent-backup.mjs
node scripts/verify-r2-delivery-monitor.mjs
```

The last command creates a random isolated 1 MiB source, simulates an interruption
after data copy, retries without double reservation, restores the exact bytes and
ownership metadata into a different isolated namespace, and removes only its
exact fixtures. Its report is ignored under `generated-artifacts/media-migration/`.
It does not change merchant documents, public media, old backups or schedules.

## Failure and staleness

The private report is `operations/media-operations.json`. Missing, invalid, failed
or stale evidence is never turned into a healthy status. Staff treats delivery
older than two hours and a completed backup older than 26 hours as unverified.
Invocation failures before report persistence are detected through that aging.

Delivery checks use current approved public content, persisted managed-media
paths, unsigned custom-domain HEADs, two responsive widths, one tiny range and
the known private pixel. DNS/TLS/access/MIME/rendition/privacy failures warn rather
than returning to Cloudinary. No video is repeatedly downloaded.

Account owners should inspect Worker invocation errors and the independent
checkpoint, fix affected access/domain/object problems, and review a reached
budget before approving larger limits. Never expose the backup or clear a
warning by deleting pending work.
