---
name: Lib package build order
description: Workspace packages (lib/db, lib/api-client-react) need a tsc build before downstream consumers can see new exports or generated types.
---

When adding new exports (tables, types, generated hooks) to a workspace package, the TypeScript resolution in consumers like `artifacts/api-server` or `artifacts/soso-store` goes through the compiled `dist/` of the lib, not the source. Even though the monorepo uses path aliases, TS composite projects resolve declarations from `dist/`.

**Why:** `lib/db/tsconfig.json` and `lib/api-client-react/tsconfig.json` use `composite: true, emitDeclarationOnly: true`. Downstream projects reference their type declarations from `dist/*.d.ts`.

**How to apply:**
1. After editing `lib/db/src/schema/soso-commerce.ts` (new table, new export): `cd lib/db && pnpm exec tsc`
2. After editing `lib/api-client-react/src/index.ts` (new re-export) or running orval codegen: `cd lib/api-client-react && pnpm exec tsc`
3. After running orval codegen (`cd lib/api-spec && pnpm exec orval --config orval.config.ts`): also rebuild `lib/api-client-react`
4. Only then run `pnpm exec tsc --noEmit` in the consumer artifacts to check types accurately.

Missing this step causes confusing "Module has no exported member" errors that look like the export is missing but it's actually just stale declarations.
