# Product-sized Staff editing

## Scope

Staff's Product editing view lists a bounded page of names and loads one saved
product when selected. It never requests the complete Staff platform document.
The read includes that product's published counterpart, collection choices and
names of its existing related products, not unrelated galleries or descriptions.
Search pages also supply choices for adding related products.

Existing products are replaced through the product editor endpoint. Slugs are
immutable there. New products, deletion, coupled collection changes, approval and
publication remain in the explicit Full catalogue tools. Merely opening those
tools does not discard the focused editor's work.

The same product-sized write is used by individual Save and existing-product-only
Save draft in the full editor; those saves do not reload the complete document.

## Safety

- A single expected draft timestamp fences all sections, not just the product.
  A conflict never silently reloads or resubmits local work. Explicit conflict
  recovery tells Staff when their complete product would replace another change.
- Local changes are retained by product, including typing during an in-flight
  save. A successful own save advances only sibling entries based on exactly
  that submitted global version; genuinely older entries remain stale.
- Product field validation reuses the full editor's product schema. SQL checks
  enforce affected cross-document invariants and global mapping ownership.
  Full publication still performs fresh commerce, business and media checks.
- Decisive media validation, replacement, full revision and audit insertion use
  the shared content/media advisory lock and one transaction. Products are
  replaced inside JSONB, without transferring the complete document to Node.
- Neither the published JSON nor its timestamp or actor is changed by a save.
  Existing collection-cover cleanup is unaffected because product edits do not
  replace collection covers. The shared lock remains the cleanup boundary.
- Revision snapshots and confirmed-mapping audit metadata are copied within
  PostgreSQL. These revisions use SHA-256 of PostgreSQL's stable JSONB text;
  audit metadata identifies this encoding. Older full-document writes retain
  their existing JavaScript canonical encoding. Do not compare hashes across
  encodings as proof of content inequality.

## Synthetic qualification

Run `pnpm --filter @workspace/api-server run test:product-editor`.
The command starts an empty local PostgreSQL instance, runs migrations in a
temporary schema, and tears it down. It ignores the workspace database URL.
It requires PostgreSQL's `initdb` and `pg_ctl`; no live database or media writes
are required.

Measured `Buffer.byteLength(JSON.stringify(databaseResult))`, without HTTP
compression:

| Result selected from PostgreSQL | 23 products | 418 products |
| --- | ---: | ---: |
| Previous complete platform row (draft and published) | 236,551 bytes | 8,345,701 bytes |
| Product editor read, including published product and choices | 4,064 bytes | 4,064 bytes |
| Product commit projection | 1,496 bytes | 1,496 bytes |
| Cross-document validation result | 155 bytes | 155 bytes |

These are synthetic payload measurements, not production usage claims. SQL still
scans/rebuilds the JSONB array, and history still stores full revision snapshots;
the savings here are database-to-application and editing transport, not a claim
that database CPU or history storage is constant.

The route tests cover role denial, stale and simultaneous writers, lock waiting,
revision-failure rollback, mapping collisions, invalid media/references,
unchanged published data and validation parity for department/availability edits.
State tests and a synthetic browser pass cover product switching, saving,
explicit conflict recovery, reload and typing during a delayed save. The browser
pass allowed no API request through to real data and observed no full platform
read, publication, deletion or upload.
