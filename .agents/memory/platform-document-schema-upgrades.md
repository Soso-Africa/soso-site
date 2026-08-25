---
name: Platform document schema upgrades
description: How to evolve the database-backed platform content document without overwriting edited or intentionally unpublished content.
---

When the platform content schema gains required fields, recursively fill only missing object fields from the approved defaults. Preserve existing scalar values and arrays, then accept the upgrade only if the merged document passes the complete current schema.

**Why:** Actor-based “replace the original seed” checks are too brittle. Even a no-op staff save or publish changes attribution, leaving an old-shaped document that can fail public validation after deployment. Replacing the whole document would destroy merchant edits.

**How to apply:** Upgrade draft and published snapshots independently. Never apply publication defaults when the record is intentionally unpublished, and never silently repair invalid edited values beyond adding fields that did not exist in the earlier schema. Detect known legacy object shapes by semantic fields rather than serialized object equality, because PostgreSQL JSONB may reorder keys.