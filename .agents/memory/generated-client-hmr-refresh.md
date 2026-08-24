---
name: Generated-client HMR refresh
description: Avoid false Vite errors while regenerating API clients in development.
---

When Orval regenerates the API client, it briefly removes and recreates generated source modules. Vite can attempt hot updates during that gap and report failed imports or failed reloads for otherwise valid application modules.

**Why:** Browser verification performed while regeneration is in flight can show 404/pre-transform errors that disappear once generation completes; they do not necessarily represent a runtime defect.

**How to apply:** After API-client generation, let generation and library typechecking finish, then restart the storefront workflow before using browser-console output as verification evidence.