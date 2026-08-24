---
name: JusticeSure v1 activation gate
description: Safety rule for enabling the JusticeSure Commerce integration after its staged v1 runtime is available.
---

Keep JusticeSure Commerce fail-closed until the matching published v1 runtime, scoped server-only Commerce credentials, webhook secret/endpoint, merchant catalogue and stock, provider selection, and approved HTTPS return URL have been staged and exercised together.

**Why:** The supplied contract arrived before the public runtime update. Enabling against an older deployment, without replay-safe webhook delivery, or without the provider return path verified would create payment and fulfilment risk.

**How to apply:** Treat a runtime-ready configuration flag as an activation decision, not a development convenience. Before turning it on, run a staged order/session idempotency retry, delivery quote, provider return/status recovery, signed webhook replay/retry, and verified-paid-order acceptance test. Never mark an order paid from a browser redirect.