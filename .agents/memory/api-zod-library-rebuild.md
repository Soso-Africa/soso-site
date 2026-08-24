---
name: API Zod library rebuild
description: How to refresh local declaration output for the shared API Zod package.
---

When a consumer cannot see a newly exported symbol from `@workspace/api-zod`, run the workspace root's composite library TypeScript build (`pnpm run typecheck:libs`) before treating the consumer error as a source-code defect.

**Why:** The package intentionally exports TypeScript source and has no package-level `build` script, while composite declaration output can still be stale for dependent checks.

**How to apply:** Use the root library build after changing shared API Zod source or exports, then run the affected API/storefront typecheck. Do not invent a package-level build command solely to refresh declarations.