---
name: Shared storefront analytics paths
description: Keep analytics ingestion and staff quality reporting aligned as public storefront routes evolve.
---

Public storefront analytics paths use a shared deny-list policy: accept safe, root-relative storefront routes while excluding API, staff, authentication, journal-preview, malformed, and oversized paths. The same pattern must remain compatible with JavaScript and PostgreSQL regex engines.

**Why:** An allow-list needs a coordinated analytics release for every new public route, while separate client and SQL rules can drift and either drop valid measurement or falsely flag it in the staff quality report.

**How to apply:** When adding a private surface, extend the shared path policy rather than adding an ingestion-only or staff-only exception. When adding a public route, verify it is accepted at ingestion and remains unflagged in the staff quality report.