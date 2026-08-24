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