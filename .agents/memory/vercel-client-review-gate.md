---
name: Vercel client-review gate
description: External repository protection and authorization constraints for storefront review checks.
---

Keep the `Vercel` commit status as a strict required check on `main`, enforced for administrators. The storefront client-review validation belongs at the start of the Vercel build, while database-backed release checks remain separate.

**Why:** The connected GitHub OAuth grant can write repository contents but does not include GitHub's separate `workflow` scope, so attempts to create `.github/workflows/*` fail even though normal files publish successfully. Vercel already reports a visible commit status and cannot produce a client-review preview when its build fails.

**How to apply:** Preserve the required `Vercel` context when changing branch protection. Keep deterministic visual and release validation ahead of the deploy build, and do not move the check to GitHub Actions through the existing connection unless its available OAuth scopes explicitly gain workflow-file access.