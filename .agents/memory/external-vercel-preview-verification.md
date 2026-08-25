---
name: External Vercel preview verification
description: Hosting-specific checks required when SOSO is deployed to an external Vercel preview.
---

Do not treat a reachable Vercel URL as proof that the newest GitHub commit deployed. Compare the local and GitHub `main` commit SHAs, then verify the Vercel status attached to that exact commit before reporting success.

**Why:** Vercel can continue serving the previous successful build after a newer deployment fails, so the public URL may return `200` while the latest SOSO changes are not live. Reaching one database-backed endpoint also does not prove that every required table is present or permitted in the deployed database.

**How to apply:** For every external Vercel release, confirm GitHub `main` matches the intended local commit and that Vercel reports success for that SHA. Then verify `/api/healthz`, a direct storefront refresh, unauthenticated `/staff`, a normal redirect lookup, private robots, and no XML sitemap. Apply schema changes only to the explicitly chosen database after review; never use this validation to enable commerce or indexing.