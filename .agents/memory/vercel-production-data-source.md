---
name: Vercel production data source
description: Which production database surface is authoritative for live SOSO diagnostics.
---

Treat the Neon database configured for the Vercel production environment as the source of truth for live SOSO data.

**Why:** The Replit production-database surface reports no production database for this project, while the deployed Vercel application uses a production-scoped Neon connection. Querying Replit production therefore gives a false “no database” result.

**How to apply:** For live analytics or commerce investigations, validate through the Vercel runtime and its Neon production branch. Keep Replit database checks limited to development unless deployment architecture changes.