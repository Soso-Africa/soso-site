---
name: Production serverless bundle checks
description: Avoid false failures when locally smoke-testing the API's serverless bundle.
---

When manually bundling the Express API for a serverless smoke test, set `NODE_ENV=production` before loading the bundle.

**Why:** The development logger enables Pino's optional pretty-print transport, whose dynamic module resolution can fail in a generic one-file bundle even though the production serverless path does not use it. Likewise, forcing an ESM bundle can fail on CommonJS dependencies that the Node serverless runtime supports.

**How to apply:** Treat the production-mode CommonJS bundle/import check as the local handler smoke test. Keep the normal API typecheck and test suite alongside it; do not infer a Vercel runtime failure from a development-only Pino transport resolution error.

For Vercel, keep the function entrypoint in compiled JavaScript/ESM rather than importing the raw TypeScript API source.

**Why:** Vercel can apply NodeNext-style TypeScript resolution to function source independently of the workspace's bundler-mode TypeScript settings, which rejects otherwise valid extensionless workspace imports.

**How to apply:** Build the Express app bundle during the root Vercel build, then have the `/api` function import that compiled handler. Preserve the normal API listener bundle for Replit development.

For a Vite static output plus Express API on Vercel, route every API depth explicitly through a fixed JavaScript function and restore the captured path before calling Express.

**Why:** In this deployment shape, Vercel matched a bracketed catch-all function for one API segment but returned its own 404 for nested paths, preventing Clerk proxy and staff endpoints from reaching Express.

**How to apply:** Keep the compiled Express bundle, use a fixed `/api` function entry, and add the Vercel route mapping before the filesystem and SPA fallback routes. Confirm a nested unauthenticated API request reaches Express with its expected 401/404 rather than a Vercel 404.