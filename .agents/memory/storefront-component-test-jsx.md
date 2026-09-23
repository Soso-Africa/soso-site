---
name: Storefront component test JSX
description: JSX runtime constraint for Node-run interaction tests that import storefront components
---

Storefront component interaction tests run through the Node TSX test command, while the app TypeScript config preserves JSX for Vite. Components rendered by the Node test renderer therefore need `React` in scope, including directly rendered child components.

**Why:** Vite supplies the app's automatic JSX transform, but the standalone Node test path does not. A test can compile successfully and still fail at render time with `React is not defined`.

**How to apply:** When adding Node-run `.test.tsx` interaction coverage, ensure the test command discovers TSX files and imported component modules have React in scope, or provide an explicit test-only automatic JSX configuration.