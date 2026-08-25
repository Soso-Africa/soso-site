---
name: Neon prepared-migration SQL
description: Compatibility rule for SQL sent through Neon's prepared migration workflow.
---

SQL sent through the Neon MCP prepared-migration workflow must avoid dollar-quoted procedural blocks such as `DO $$ ... $$`.

**Why:** The migration workflow's statement parser can split inside a dollar-quoted block and report an unterminated string even though PostgreSQL accepts the checked-in SQL through a normal client.

**How to apply:** Preserve the migration's semantics with parser-safe, idempotent statements such as `CREATE ... IF NOT EXISTS`, `INSERT ... WHERE NOT EXISTS`, and `ON CONFLICT DO NOTHING`, then verify the exact transformed SQL on the temporary branch before completing it on production.