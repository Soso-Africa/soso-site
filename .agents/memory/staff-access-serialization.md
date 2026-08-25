---
name: Staff access serialization
description: Concurrency rule for changes that can affect active SOSO ownership or staff authorization.
---

All staff access mutations that can change active-owner status must share one database transaction-scoped serialization boundary. Revalidate the acting owner's current active role after entering that boundary, then read the target, check the owner invariant, write the change, and record its audit event before committing.

**Why:** Separate authorization, owner-count, and update operations allow concurrent requests to act on stale state. Two individually valid changes can otherwise remove every active owner, and a request queued by an owner can continue after another request has already revoked that owner's authority.

**How to apply:** Use the same serialization boundary for future role, activation, deletion, or ownership-transfer paths. Keep the authorization recheck, invariant check, mutation, and audit write in one transaction; do not add a parallel mutation path that bypasses it.