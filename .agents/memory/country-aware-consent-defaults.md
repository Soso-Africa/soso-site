---
name: Country-aware consent defaults
description: Privacy and trust-boundary rules for SOSO's regional consent banner and automatic first-party analytics.
---

Show explicit consent choices in EU/EEA/UK countries and whenever location is unknown. In a verified non-regulated country, automatically enable anonymous first-party analytics only; marketing always requires an explicit choice.

**Why:** Country headers are an external trust boundary, visitors can change regions between visits, and treating an old automatic grant like explicit consent can collect data after a move into a regulated or unresolvable location.

**How to apply:** On Vercel, accept only its platform-owned country header and classify only recognized country codes. Keep automatic provenance separate from explicit choices, re-resolve it before startup and after cross-tab changes, and recheck the current region during event ingestion. Unknown, malformed, alternate-proxy, or failed classifications must show the banner and send no optional events.