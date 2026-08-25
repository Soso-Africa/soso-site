---
name: Cloudinary serverless release gate
description: Production acceptance rules for serverless startup, Cloudinary media, and client-rendered public routes.
---

Serverless entry points must explicitly complete shared application initialization before serving requests. Production promotion must also prove Cloudinary with an ephemeral upload, byte-level delivery inspection, and awaited cleanup, and must verify important public routes in a real browser rather than relying on HTTP status alone.

**Why:** A serverless handler can bypass listener-only startup and serve broken content despite a successful build. An SPA fallback can also return HTTP 200 while rendering a client-side 404, and configured Cloudinary variables do not prove signing, upload, delivery, or deletion permissions.

**How to apply:** For every serverless entry point, await the same initialization contract used by the long-running server. Keep the Cloudinary transaction as a fail-closed production release gate, and include rendered-page assertions for launch-critical routes.

When Cloudinary credentials are Vercel-production-only, do not force the local workspace into `VERCEL_ENV=production`. Run the normal local release build, where the diagnostic skips explicitly, and require the real Cloudinary transaction in Vercel’s production build.

**Why:** Forcing the production flag locally creates an environmental failure before the storefront bundle runs; copying production media credentials into development would weaken the environment boundary rather than improve verification.