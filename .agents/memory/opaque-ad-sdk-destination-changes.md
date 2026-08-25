---
name: Opaque ad SDK destination changes
description: Fail-closed lifecycle rule for replacing browser advertising destinations after a vendor SDK has initialized.
---

Do not hot-swap an advertising pixel identifier after that provider's browser SDK has initialized. Revoke the old provider immediately, block that provider for the rest of the page lifetime, and activate the replacement only after a full page load creates a fresh SDK context.

**Why:** Meta, X, and TikTok browser globals do not reliably unregister an initialized destination when their script element is removed. Reinitializing the same global can leave the old destination receiving later events. Cached public settings can create the same disclosure after consent is revoked and re-granted.

**How to apply:** Treat any in-page provider-ID change as terminal for that provider. After consent revocation or a private-surface transition, clear runtime configuration and require an explicitly successful fresh public-settings response before reactivation; never accept cached data attached to a failed refetch.

Consent withdrawal must also become authoritative in local state before awaiting persistence. Invalidate in-flight grants and activation generations synchronously so navigation, query completion, or an older request response cannot reopen a provider during the network gap.

Removing a vendor's script element is cleanup, not consent revocation: already-executed SDK code and globals remain alive. Invoke each SDK's supported revoke/deny command before removing owned scripts, and invoke grant on same-destination re-consent.