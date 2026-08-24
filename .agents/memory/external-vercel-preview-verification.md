---
name: External Vercel preview verification
description: Hosting-specific checks required when SOSO is deployed to an external Vercel preview.
---

The Replit-managed Clerk same-origin proxy must not be assumed to work for a new `*.vercel.app` host. First verify that the deployed `/api/__clerk` path serves Clerk JavaScript and that the Clerk environment accepts the hostname before configuring the web client to use that proxy.

**Why:** A preview can render SOSO’s sign-in page shell while Clerk itself fails to load, leaving sign-in and staff access unusable. Reaching one database-backed endpoint also does not prove that every required table is present or permitted in the deployed database.

**How to apply:** On every external Vercel preview, verify Clerk controls in the browser, unauthenticated `/staff`, and a normal redirect lookup in addition to `/api/healthz`, a direct storefront refresh, private robots, and no XML sitemap. Apply schema changes only to the explicitly chosen preview database after review; never use this validation to enable commerce or indexing.