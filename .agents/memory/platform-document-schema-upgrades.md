---
name: Platform document schema upgrades
description: How to evolve the database-backed platform content document without overwriting edited or intentionally unpublished content.
---

When the platform content schema gains required fields, recursively fill only missing object fields from the approved defaults. Preserve existing scalar values and arrays, then accept the upgrade only if the merged document passes the complete current schema.

**Why:** Actor-based “replace the original seed” checks are too brittle. Even a no-op staff save or publish changes attribution, leaving an old-shaped document that can fail public validation after deployment. Replacing the whole document would destroy merchant edits.

Content migrations that add catalogue records must be version-gated and one-time. Run them before the API starts listening, record system revision/audit evidence, preserve the original publication timestamp, and keep public content reads side-effect free.

**Why:** An unconditional “append missing defaults” pass can silently recreate products that staff intentionally retired or renamed, while a read-triggered update bypasses publication controls.

**How to apply:** Upgrade draft and published snapshots independently. Never apply publication defaults when the record is intentionally unpublished, and never silently repair invalid edited values beyond adding fields that did not exist in the earlier schema. Detect known legacy object shapes by semantic fields rather than serialized object equality, because PostgreSQL JSONB may reorder keys.

For a narrowly recognized shipped payload, keep the shape guard active after the nominal migration version so a partial upgrade can recover on the next reconciliation. The exact semantic match—not the version alone—protects merchant-authored variants.

Hash platform documents from recursively key-sorted objects while preserving array order.

**Why:** PostgreSQL JSONB can return semantically identical objects with a different key order. Raw JSON serialization then makes every read-triggered upgrade look like a content change, advances the optimistic revision, and causes an editor’s next save to conflict. Merchandising arrays remain order-sensitive and must not be sorted.

**How to apply:** Canonicalize object keys only before hashing. Keep arrays in their authored order so category, featured-product, and occasion changes still produce distinct revision hashes.

When replacing one editable scalar with a repeatable collection, seed the new collection from the merchant’s current scalar rather than the shipped default. Additions inside editable arrays must be version-gated so staff can remove them after the upgrade without having them silently restored.

**Why:** Generic default merging preserves arrays wholesale, while unconditional insertion turns a one-time launch addition into a permanent override of later staff choices.

When a legacy document cannot satisfy a new authored-content invariant, keep any compatibility marker migration-owned: the normal write boundary may preserve established provenance but must reject a caller trying to introduce or reshape it.

**Why:** A marker accepted directly from Advanced JSON becomes a bypass for the new invariant, even when the structured editor never creates it.

**How to apply:** Validate the stored snapshot and optimistic revision before accepting a marked update. Require the relevant catalogue identity and legacy selection prefix to remain unchanged; reject new markers on ordinary drafts.