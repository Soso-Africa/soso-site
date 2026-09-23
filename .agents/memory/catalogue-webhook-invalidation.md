---
name: Catalogue webhook invalidation
description: How JusticeSure catalogue webhook events make confirmed SOSO mappings stale without weakening live hash checks.
---

Treat a catalogue webhook as an early warning, not as new mapping authority. A
mapping becomes stale only when a completed, signature-verified event names its
product or variant identifier and occurred after that mapping was confirmed.
Replayed events, older events, broad events without identifiers, and unrelated
identifiers must not affect it. Save, publication, and checkout must continue to
use the live local and remote hash checks independently.

**Why:** Webhooks can surface remote drift faster than a full catalogue refresh,
but replayed or non-specific events must not invalidate unrelated products, and
delivery alone cannot prove the current catalogue state.

**How to apply:** Keep invalidation effects tied to the durable idempotent webhook
event record and compare event time and identifiers with each confirmation. Use
the warning to trigger Staff review; never use it to bypass authoritative
revalidation or silently replace a mapping.