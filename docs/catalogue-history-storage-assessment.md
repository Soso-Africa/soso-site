# Catalogue history storage assessment

## Owner-approved capacity warning

The owner approved a **100 MiB (104,857,600 byte)** internal storage budget,
with warning at **70 MiB (73,400,320 bytes)** and urgent warning at
**90 MiB (94,371,840 bytes)**. At 100 MiB the report says budget exceeded.
The destination is **Staff → Overview, owners only**; no email or external
notification destination is authorized. These are internal thresholds, not a
Neon/Vercel plan allowance or a statement of remaining account capacity.

`artifacts/api-server/src/lib/catalogue-history-capacity.ts` measures allocated
storage using exactly two `pg_total_relation_size` calls: site-content revisions
and shared audit logs. Table, indexes and TOAST allocation are included.
The latter includes the repeated full mapping-audit summaries left unchanged by
the product editor. Neither snapshots nor audit metadata are selected, summed,
downloaded or reconstructed for monitoring. The existing schema has no separate
catalogue-only audit allocation, so the warning deliberately uses a conservative
**shared-table envelope**, not a fabricated catalogue-only byte total. Other
site-content revisions and unrelated audit events count toward this envelope;
the owner report labels that limitation.

A versioned operational cache uses a private `soso_site_content` key, following
the existing media-usage-cache convention. Its published value is empty.
No history/audit writer or schema change is needed. It holds only the latest and
previous successful allocation observations, a next-attempt timestamp and an
explicit error/in-progress message. These observations are replaceable monitoring
state, not retained catalogue evidence. It does not grow one cache row per visit.

An advisory try-lock serializes a committed daily claim across processes and
serverless instances. Database time sets its next eligible attempt. Measurement
has a 2-second statement timeout and 250 ms lock timeout, and a fenced final
update cannot overwrite a newer claim. Failure/crash still consumes the daily
attempt; the previous successful sample and baseline survive. No force refresh
path exists. Normal owner page visits read a fixed-size cache, not history.
The initial owner visit measures immediately; later owner visits measure only
after 24 hours. There is **no unattended scheduler or off-site delivery**.
Warnings are persistent in the owner report, not dismissible notifications that
could conceal a continuing capacity problem. Non-owners cannot call the endpoint.

The report separates revision bytes, audit bytes, combined bytes, and their
observed per-day growth across the last two successful observations. Until there
are two observations at least 24 hours apart, growth is unknown, not zero.
Positive combined growth can show an explicitly approximate days-to-budget
estimate; flat/negative growth does not invent a date. Allocation can shrink or
stay flat due to page reuse; it is not a logical payload-size or per-save measure.
After a failed attempt or 48 hours without a successful sample, the report is
stale; no successful sample means unavailable, never “healthy zero”.

Database stored bytes and observed allocation growth are **separate from network
transfer usage**, media storage/delivery, billing and quota qualification.
Current draft/published content, other tables, backups, WAL and provider overhead
are outside these two totals. No threshold blocks saves, deletes, expires,
archives, compacts, or rewrites revisions, mapping evidence or media references.
The rest of this document remains a prospective format assessment, not approval
to alter existing evidence.

Focused verification:

```sh
pnpm --dir scripts exec tsx --test ../artifacts/api-server/src/lib/catalogue-history-capacity.test.ts ../artifacts/api-server/src/routes/staff-history-capacity.test.ts ../artifacts/soso-store/src/components/staff/CatalogueHistoryCapacity.test.tsx
```

## Decision and approval boundary

Recommend **prospective, versioned product deltas with periodic full checkpoints**,
subject to the activation gates below. The executable prototype is assessment-only:
it is not imported by the server, does not change the database schema, and does not
activate smaller production revisions. Existing history is neither read nor
rewritten, deleted, expired, or compacted.

This fulfills the design assessment before adoption, not a production storage
rollout. Current product saves continue writing complete catalogue revisions.
No retention/deletion policy has been approved. Do not infer permission to alter
retained history from this assessment.

## Current storage and safety dependencies

- `artifacts/api-server/src/routes/staff-product-editor.ts`: each product save
  copies the **entire** draft into `soso_site_content_revisions` in PostgreSQL.
  Avoiding its network round trip does not reduce its stored size. Its audit
  entry also repeats all confirmed mapping summaries; that remains a separate
  catalogue-sized cost.
- `artifacts/api-server/src/routes/staff-content.ts`: whole-document saves,
  availability changes and publication flows also create revisions. The
  metadata-only revisions endpoint does not imply a history-storage limit.
  Unpublication writes a null snapshot, not a replacement for prior evidence.
- `artifacts/api-server/src/lib/platform-content.ts`: initialization is another
  revision writer. Any future format must support mixed old/new records and
  every writer, not only the product editor.
- `lib/db/src/schema/soso-commerce.ts`: revisions retain ID, content key, event,
  nullable JSONB snapshot, content hash, actor and timestamp, with a key/time
  index and parent content foreign key.
- `artifacts/api-server/src/lib/collection-cover-cleanup.ts` and
  `lib/catalogue-import-cleanup.ts` (under that same `src/` directory): cleanup
  scans retained snapshots for managed URLs, alongside current content, Journal
  history and import reviews. Historical URLs disappearing from the physical
  snapshot representation would make these readers unsafe without adaptation.
- `artifacts/api-server/src/lib/verification-import-recovery.ts` and
  `lib/db/scripts/run-in-isolated-soso-schema.mjs`: the recovery manifest and
  exact revision discard path depend on the original snapshot/hash/owner/media
  identities. A base revision must never be discarded while another revision
  depends on it, even in a disposable verification schema.
- `artifacts/api-server/src/lib/r2-storage.ts`: approved media deletion requires
  the retained-reference-aware coordinator. Do not bypass this with a new
  archive or history reader.

The shared platform media advisory lock, optimistic draft-version fence,
transactional audit writes, upload authorization expiry, original ownership
checks and fail-closed cleanup decisions all remain unchanged.

## Options assessed

| Option | Evidence and tradeoff | Decision |
| --- | --- | --- |
| Keep full JSONB snapshots; rely on TOAST/compression | Simple restoration, but compression is per value, not shared unchanged products across revisions. Still grows with catalogue size × saves. Changing compression needs its own measured migration approval. | Safe current behavior, not a solution to repeated content. |
| Cap revisions or expire older rows | Bounds online history only by losing evidence unless an independently verified, restorable archive replaces it. Also risks dropping media references and verification receipts. | Rejected without explicit policy approval; no age/count deletion. |
| Versioned deltas plus full checkpoints | Preserves every logical revision and mapping state; bounds restoration dependencies. Lower measured storage for narrow edits, more reader complexity. | Recommended future implementation, not activated. |
| Archive older full history outside PostgreSQL | Could bound online storage but needs approved retention, access controls, durable backups, hash verification, media-reference availability and a proven restore tool. Archive availability must never authorize deletion by absence. | Alternative only after separate policy and operational approval. |

No design retaining unlimited audit events can promise a fixed total storage
ceiling. Checkpoints bound **reconstruction depth**, not total history bytes.

## Executable candidate

`lib/db/scripts/catalogue-history-prototype.mjs` implements a versioned envelope
with original revision identity, event and actor, parent identity/hash, complete
content hash and conservative managed-media evidence.

- Full checkpoint initially and after at most 31 consecutive deltas.
- Product-only saves store complete changed products by stable index and slug.
  Complete products retain optional fields, removed confirmations and old/new
  mapping states exactly at their respective revision.
- Non-product changes, insertions, deletions, reorderings, publication and
  unpublication use full independent checkpoints. Wide changes also fall back
  when a delta is not smaller. No-op saves still retain their audit event.
- Restoration checks every traversed base hash, final content hash, depth,
  product identity/index and reconstructed media evidence. Missing or corrupted
  dependencies fail explicitly. Checkpoints do not require older bases.
- Media evidence retains all managed-path-bearing strings, including embedded
  body URLs, suffixes and object keys. This intentionally over-retains possible
  references. It is **not** a complete production deletion-authority interface.
- Hashing uses explicitly canonicalized JSON for this experiment, not the
  product route's `postgres-jsonb-text` encoding nor every existing application
  hash encoding. Existing hashes must retain their original encoding. A future
  schema needs a versioned hash-encoding discriminator; do not rewrite old hashes.
- Content hashes detect accidental corruption, not a malicious rewrite of both
  data and hashes. Audit access controls and backup evidence remain necessary.

## Repeatable verification

Run from the repository root:

```sh
node --test lib/db/scripts/catalogue-history-prototype.test.mjs
node lib/db/scripts/measure-catalogue-history.mjs
```

The measurement runner always creates a new empty **local PostgreSQL** cluster.
It never consumes `DATABASE_URL`, connects to a remote database, or invokes
external media services. It stops and removes its own cluster in `finally`.
Requirements: local `initdb`/`pg_ctl`, workspace Node and installed `pg`.
Detailed output goes to ignored
`generated-artifacts/catalogue-history/results.json`.

The tests cover restoration of every revision, repeated edits, mapping
replacement/removal, replaced media, no-op events, checkpoints, structural
fallbacks, publication/unpublication, malformed indices, duplicate operations,
cycles, missing bases, changed hashes, payload corruption, unsupported formats
and media-evidence corruption.

The database experiment uses 100 and 1,000 synthetic products, each with
deterministic varied description text, media and mapping confirmation. Each run
stores an initial save plus 96 individual product saves. Mapping changes,
confirmation removal and media replacement occur during the sequence.
Both alternatives store 97 revisions, including checkpoints at 0/32/64/96.
Every candidate revision is read back from JSONB and reconstructed to its
independently retained expected content hash: **194/194 restorations**.

The fixture tables approximate the revision row layout and its primary/key-time
indexes. Audit payloads conservatively repeat all confirmed mapping summaries
for both alternatives. They use revision-shaped rows for comparable allocation,
not the exact production audit schema. No claimed savings depend on truncating
audit metadata or dropping confirmations.

### Measured results

See the recorded measurements below. `pg_total_relation_size` includes table,
TOAST and indexes. Logical JSON text bytes and stored column bytes are also
recorded separately by the runner; neither is substituted for allocated storage.

PostgreSQL **16.10**, default TOAST compression **pglz**. MiB = 1,048,576 bytes.

| Products | Full revision allocation | Candidate revision allocation | Revision reduction | Shared mapping-audit allocation | Full + audit | Candidate + audit | Combined reduction |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 11.43 MiB | 0.83 MiB | 92.75% | 0.88 MiB | 12.30 MiB | 1.70 MiB | 86.16% |
| 1,000 | 113.34 MiB | 4.45 MiB | 96.08% | 7.40 MiB | 120.73 MiB | 11.84 MiB | 90.19% |

Exact revision allocations: 11,984,896 → 868,352 bytes (100 products),
118,841,344 → 4,661,248 bytes (1,000 products).
Shared audit allocations: 917,504 and 7,757,824 bytes respectively.
Amortized revision bytes per recorded save, including checkpoints and initial
allocation: 123,556 → 8,952 and 1,225,168 → 48,054 respectively.
These are batch averages, not marginal bytes for a specific edit.

| Products | Full logical JSON bytes | Candidate logical JSON bytes | Full stored column bytes | Candidate stored column bytes |
| --- | ---: | ---: | ---: | ---: |
| 100 | 11,069,067 | 1,005,296 | 11,376,284 | 652,642 |
| 1,000 | 111,027,567 | 8,793,896 | 114,390,284 | 4,188,623 |

The largest observed in-memory restore took 110 ms (100 products) and 257 ms
(1,000 products) on this shared workspace. These timings vary under load and do
not include fetching dependencies from a database.

### Interpretation and limits

Results are local synthetic PostgreSQL allocations, **not Neon billing estimates
or live transfer qualification**. The current draft/published rows, backups,
WAL, replicas, database-level overhead and shared application tables are outside
these totals. Restorations run with rows already loaded in memory: their timings
are CPU observations, not database/API recovery latency guarantees.

Savings depend on product size, edit width, checkpoint frequency, compression,
mapping count and retained-media strings. Already compressed or highly repetitive
catalogues will differ. The unchanged full-mapping audit remains an O(products ×
saves) cost, as does conservative per-revision media evidence at a lower byte
cost. Even the candidate remains unbounded over time. Do not advertise the
revision-only reduction as the whole-database reduction.

## Mandatory activation gates

1. Obtain approval for **prospective** new-format writes and their operational
   rollout. Any retrospective conversion, deletion, archive or expiration needs
   separate explicit approval and a recoverable backup; it is not authorized here.
2. Introduce additive versioned format/base/hash fields (or a separate revision
   payload table) with constraints, supporting legacy full rows without rewriting
   them. Bases need immutable identities, same-content-key checks and restrictive
   dependency foreign keys. Missing bases cannot be represented as empty content.
3. Build one verified mixed-format reconstruction service for audit, mapping
   review and recovery. Preserve original IDs, timestamps, actors, event names,
   mapping metadata and existing hash encodings. Checkpoint reconstruction depth
   is not permission to remove its ancestors' evidence.
4. Under the **same advisory lock and transaction** as each content write, choose
   the correct immediate base, write the delta/checkpoint, verify its reconstruction,
   and write audit and retained-media evidence. A stale write or any history/audit
   failure must roll back the content save. Do not download/re-upload the full
   catalogue through the product endpoint to compute the delta.
5. Adapt **all** retained-reference readers before enabling any new writer:
   cleanup coordinators, R2 authorization, import recovery/manifest generation,
   current draft/published content, Journal histories and import reviews. Use a
   durable transactional union of checkpoint/delta references or equivalent
   verified evidence. Preserve conservative substring matches and active upload
   grants. On unknown format, missing evidence or reconstruction failure, defer
   deletion and report the problem, never assume the file is unused.
6. Update verification-history discard to reject bases with retained dependents;
   only explicitly approved, exact disposable-schema identities can be discarded.
   Keep recovery manifests usable and repeat-safe after partial failures.
7. Qualify the integrated mixed-format path in an empty local or approved
   isolated database: concurrent saves, checkpoint boundaries, rollback on audit/
   revision failure, corrupted/missing bases, restore all mapping states and prove
   cleanup refusal for historical-only URLs on every supported provider.
8. Roll out behind a reversible writer switch. On rollback, create a verified
   full checkpoint for new saves; **retain the new reader** for existing deltas.
   Track bytes/save, restore failures, chain depth and deferred cleanup. Do not
   remove the new format or its dependencies on rollback.

This assessment changes no storefront or Staff behavior, live history, media
retention rule, recovery receipt or publication/payment safeguard.

## Approved prospective implementation

The owner explicitly approved **implementation and gated activation** of future
versioned writes. This approval does **not** include rewriting, converting,
compacting, expiring or deleting any existing evidence. The experiment above
remains assessment code and is never imported by the application.

The additive `0020_catalogue_history.sql` migration installs the production
boundary in PostgreSQL. A BEFORE INSERT trigger covers **every** revision writer,
including product-only SQL saves, scoped/whole-document saves, availability,
publication/unpublication and initialization. An AFTER INSERT trigger verifies
reconstruction before the transaction can commit. Content, complete mapping-audit
metadata and retained-media evidence remain in the original transaction. The
product endpoint never downloads or re-uploads the catalogue to calculate deltas.
Initialization now takes the shared media lock and refuses to overwrite a draft
or publication that changed while defaults were being prepared.

### Formats and evidence

- Existing rows receive only additive column defaults: `legacy-full` and
  `legacy-preserved`. Their snapshots, IDs, actors, timestamps and hashes are
  unchanged. No backfill or row UPDATE runs.
- Future rows are `full-v1` or `products-v1`. Original audit/content hashes keep
  their encoding: `platform-canonical-json-v1` for application writers and
  `postgres-jsonb-text` for the product SQL writer.
- A **separate** SHA-256 of PostgreSQL JSONB text verifies every new logical
  document, including null unpublication. This never replaces the audit hash.
- Deltas contain complete changed products, including optional fields and exact
  mapping confirmation replacement/removal. The immediate predecessor must be a
  verified new-format draft save. Structural/non-product changes, publications,
  migration events, wide edits and every 32nd chain position are independent full
  checkpoints. No-op events still produce a revision and normal audit entry.
- Bases have restrictive same-key foreign keys; revision updates are prohibited.
  New timestamps are monotonically ordered inside the shared lock to avoid
  same-transaction timestamp ties; existing timestamps are never changed.
- Every new row retains the complete conservative managed-path-bearing string
  union, including object keys and embedded URLs, plus its own checksum.
  `soso_history_restore` verifies document hashes, depth, base identity/hash,
  product indices/slugs, duplicate operations and media evidence. A chain is at
  most 31 deltas. Missing or unsupported history raises an explicit error.
- `soso_history_references` is the shared cleanup reader. It retains legacy
  substring matching and verifies new history before authorizing absence.
  Both Cloudinary and R2 coordinators use it, alongside current draft/published
  content, Journal history, import reviews and active upload grants.
  Collection cleanup uses a savepoint so corruption produces a durable
  `history_verification_failed` deferral instead of losing the pending job.
- Mapping review and verification manifests reconstruct through the same service.
  Disposable-schema recovery still requires the exact manifest, schema/run,
  original owner/hash/path identities and explicit discard flag. It refuses a
  base with any retained dependent, even when the manifest names that base.

### Qualification and rollout

Run from the workspace root:

```sh
node lib/db/scripts/qualify-catalogue-history.mjs
```

This command creates and removes its own empty **local** PostgreSQL cluster and
never consumes the workspace `DATABASE_URL`. Its API tests and migration tests
receive only that local URL. The report is
`generated-artifacts/catalogue-history/qualification.json` (ignored by Git and
deployment). SQL-only diagnostics may use `--sql-only`, but that report **cannot
activate** the writer.

Qualification covers 66 independently expected restorations, legacy hash
preservation, multiple checkpoint boundaries, exact mapping removal/replacement,
both provider cleanup coordinators, historical-only URLs, dependent-base discard
refusal, unknown/corrupt/missing bases, immutable evidence, stale concurrent
writes, content rollback on revision/audit failure, repeat preparation and the
actual activation/rollback commands. The complete fresh/repeat/legacy migration
suite also runs, including retained-ledger recovery after failed child runs.
The temporary cluster uses PostgreSQL 16.10 and SSD-like
`random_page_cost=1.1`; no hosted planner configuration is changed.

Eight targeted API integration tests passed. Two existing tests in the broader
Staff-content file are explicitly excluded from this history gate and listed in
the report, rather than represented as passing:

- The collection-cover publication fixture makes its homepage arrival
  unavailable, so existing publication validation rejects it before cleanup.
  Its later deletion expectations also predate all-provider historical retention.
- The confirmed-catalogue fixture expects automatic Accessories visibility
  removal, while the current candidate builder intentionally preserves visibility.

The new history integration test independently qualifies both cleanup providers,
corruption deferrals and recovery discard refusal. The targeted existing tests
exercise scoped saves, product SQL saves, per-product publication, availability
and exact business/mapping evidence. SQL qualification additionally exercises
whole-document, migration, publication and null-unpublication event formats.
This is not a claim that the entire existing API suite is green.

### Release preparation, activation and rollback

The release and post-merge entry points run only the bounded additive preparation:

```sh
node lib/db/scripts/ensure-catalogue-history-schema.mjs --development
```

The Vercel build calls the same script without `--development`; it runs there
only for a production-scoped build, following the existing external-Neon release
convention. It verifies the new column types/defaults, constraints, restrictive
base FK, index, trigger state and schema-pinned function bodies against the
isolated release fingerprint. It does not run the full historical migration
queue, read/download snapshots, enable deltas, or alter retained rows.

After the merge/release, use the normal approved environment-secret flow to
select the exact destination database. Never paste a connection string into a
command or report. With that environment selected:

```sh
# Requires this exact release's complete local qualification report.
node lib/db/scripts/set-catalogue-history-writer.mjs --enable generated-artifacts/catalogue-history/qualification.json

# Immediate writer rollback; does not remove new readers or dependencies.
node lib/db/scripts/set-catalogue-history-writer.mjs --disable
```

The switch command checks the release schema and report's migration/source
digests, verifies all existing new-format records inside PostgreSQL, then changes
only the database-local writer flag under the same media lock. Incomplete,
SQL-only or stale-code reports cannot enable it. Disabling does not require a
report. Subsequent saves create verified independent full checkpoints; all
previous deltas, bases, media evidence and mixed-format readers stay installed.
Do **not** roll back the schema or deploy an old snapshot-only reader.

The default is off. Qualification enables and disables the real switch only in
its local disposable database. This fork does not publish or activate the live
database; a successful qualification is permission for the gated command, not an
unreported production change.

### Operational evidence and remaining limits

`soso_catalogue_history_metrics` exposes format counts, maximum chain depth and
stored snapshot/change/media payload bytes without transferring catalogue
documents. Divide payload bytes by revisions for observed payload bytes/save;
this is not total relation allocation or whole-database savings. The existing
owner capacity report continues to measure relation/audit allocation separately.
Reconstruction errors fail the calling request and are logged by the existing
API error handler; cleanup deferrals additionally retain their explicit reason
in the normal media audit queue. Monitor these alongside chain depth and
bytes/save before broader use. Neither monitoring nor rollback authorizes history
deletion.

Deletion-authority checks intentionally favor safety over speed: a no-reference
decision may reconstruct retained new-format history, with each reconstruction
bounded to 31 deltas. Large-history cleanup latency still needs operational
measurement; do not replace a timeout/error with "unused". The earlier storage
percentages remain **synthetic prototype measurements**, not claims of actual
Neon storage, transfer or bill reduction from this implementation.
