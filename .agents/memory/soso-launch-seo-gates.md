---
name: Launch SEO safety gates
description: The storefront's production indexing rules and the approvals required to open them.
---

Indexing is deliberately fail-closed. The static shell and default build deny crawling; the production response layer is the authority for route-specific `X-Robots-Tag`, canonical URLs, social metadata, and schema.

**Why:** Client-side metadata can arrive too late for crawlers and could expose draft, operational, or unapproved pages. SOSO has not yet supplied a real domain or approved factual content.

**How to apply:** Enable public indexing only with an approved HTTPS domain and the relevant explicit approval flags. Add a Journal URL only when its factual metadata is present in the committed editorial allowlist and exactly matches the published post. Keep checkout, staff, auth, unknown, and draft routes noindex regardless of the global flag.