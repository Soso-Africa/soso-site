---
name: Managed media cleanup serialization
description: Safety rule for reclaiming managed uploads after governed content changes.
---

Queue orphan cleanup durably in the same transaction that removes the content reference. Before deleting, recheck every current draft and published snapshot while holding the same advisory lock used by content mutations. Content saves must perform their decisive managed-media validation after acquiring that lock and commit before releasing it. Treat a still-referenced asset as deferred, not completed, and retain failed attempts for explicit retry.

**Why:** A draft replacement can leave the old asset referenced by published content. An in-flight save can also validate an upload, wait for cleanup to delete it, and then commit the deleted path unless validation and commit share the cleanup lock. External storage calls can fail after the content save has committed.

**How to apply:** Use this pattern whenever managed media is reclaimed from Platform content. Revalidate all managed references inside the mutation lock, run pending cleanup after save, publish, and unpublish transitions, make deletion idempotent, and preserve auditable queued, deferred, failed, and deleted outcomes.