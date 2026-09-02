---
name: Vercel client-review gate
description: External repository protection and authorization constraints for storefront review checks.
---

Keep the `Vercel` commit status as a strict required check on `main`, enforced for administrators. The storefront client-review validation belongs at the start of the Vercel build, while database-backed release checks remain separate.

**Why:** The connected GitHub OAuth grant can write repository contents but does not include GitHub's separate `workflow` scope, so attempts to create `.github/workflows/*` fail even though normal files publish successfully. Vercel already reports a visible commit status and cannot produce a client-review preview when its build fails. The project database credential is production-scoped in Vercel; exposing it to previews would let preview builds touch the live database.

**How to apply:** Preserve the required `Vercel` context when changing branch protection. Keep deterministic visual and non-mutating release validation ahead of the deploy build, but run database-backed browser checks only in a database-enabled isolated validation environment. Do not move the check to GitHub Actions through the existing connection unless its available OAuth scopes explicitly gain workflow-file access.
