# SOSO R2 media recovery

## Storage boundaries

- Runtime private originals and rendition manifests: `soso-media-private`.
- Approved public originals and responsive copies: `soso-media-public`, delivered at `https://media.shopsoso.co`.
- Independent pre-cutover backup: `soso-media-backup`, private and outside application credential scope.
- Production uses an empty `R2_MEDIA_NAMESPACE`. Do not introduce an isolated-test namespace into production.
- Existing `/api/storage/objects/...` and `/api/storage/public-objects/...` references remain the persisted identities. Do not rewrite merchant documents to presigned, expiring URLs.

The migration copied the then-existing Cloudinary originals and derivatives. It is not an ongoing backup of later R2 uploads. Do not delete the Cloudinary source or independent backup as part of routine cleanup.

The follow-up daily-backup/hourly-monitor implementation is documented in
`workers/soso-media-operations/README.md`. The owner repaired Worker-write
permission and native Free-plan execution has been verified. Consult the private
operations report and deployment receipt for scheduled production completion;
an isolated restore test alone does not prove that a schedule has run.

## Release evidence

The externally published, protected release is recorded in `.local/releases/r2-switch/github-release.json`. Its complete tree is based on the current remote production parent, not the local workspace branch.

The corrected recovery reference is `media-r2-approval-safe-20261017`. Do not recover to the initial `media-r2-cutover-20261017` release: it preceded the failed-publication privacy fix.

Read-only live acceptance is available with:

```sh
pnpm --dir scripts exec tsx verify-r2-live-cutover.ts
```

This needs the ignored migration manifests in `generated-artifacts/media-migration/`. It checks the original cutover snapshot: 170 published families, 850 public objects, representative real production redirects and exact bytes, anonymous draft denial, and Staff authentication enforcement. If approved content has subsequently changed, do not restage an old snapshot to make this historical check pass.

The production build's existing storage diagnostic must select R2 and complete an actual owner-bound signed upload, four responsive uploads, finalization, governed delivery, byte-range checks, and awaited deletion of its own temporary objects. Preview success alone does not prove this production-scoped diagnostic passed.

Publication preflight must never write to the public bucket while its database transaction is still pending. Missing delivery copies are created on a subsequent managed-media request, after a fresh check of committed published references under the shared media/cleanup lock. A failed publication therefore leaves its media private. If a delivery copy temporarily fails after a successful publication, the next request retries the immutable family; do not rewind the approved content or copy an unrelated draft.

## R2-compatible application rollback

1. Select a verified **R2-capable deployment containing the committed-publication privacy fix**, or rebuild the corrected recovery reference above. Keep the current hosting project, production database, custom domains, and merchant documents unchanged.
2. Retain production-only `MEDIA_STORAGE_PROVIDER=r2`, `R2_MEDIA_ACTIVATION_APPROVED=yes`, the existing R2 account/application credentials, both runtime bucket names, `R2_PUBLIC_MEDIA_ORIGIN=https://media.shopsoso.co`, and the stable production `SESSION_SECRET`.
3. Keep previews isolated from production credentials and the production database. Do not copy sensitive values into a workspace file, command argument, log, or chat.
4. Require the actual R2 production diagnostic to pass again. Verify representative original and resized managed paths redirect to the approved custom origin, anonymous draft requests fail, and public bytes/ranges remain correct.
5. Verify the actual deployment serving the production domains, not merely a ready preview or the latest commit on main.

Rolling back to a pre-R2 deployment is **not** a recovery after Cloudinary restriction. It also cannot serve new R2-only uploads. Never silently revive Cloudinary as a fallback. Once an R2 deployment has passed live checks, retain that replacement-compatible deployment and source reference.

## Data recovery and cleanup

Do not rewind the production database or publish retained drafts to recover media delivery. Retained revisions can refer to private media, so cleanup must continue checking all current and retained references under the existing serialization lock.

For a missing or damaged object, inspect the verified private original and migration checksums first. Restore only the exact affected, approved family, with a fresh ownership/publication check. Do not expose the backup bucket or copy all private objects into public delivery.

For verification uploads, record only their newly issued object paths and delete only those exact original/rendition/manifest keys after inspection. Do not invoke the global pending-cleanup queue merely to remove a test object; that can act on unrelated merchant work.

## Cost and service limits

Budget alerts are not spending caps. Project bucket totals are not account-wide billable storage or monthly request usage. Preserve the owner's no-paid-upgrade constraint, measure account-wide usage separately, and avoid repeated full video downloads or unrestricted inventory scans.
