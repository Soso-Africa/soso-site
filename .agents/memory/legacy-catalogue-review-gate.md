---
name: Legacy catalogue review gate
description: Release rule for imported SOSO stock, photography, claims, and purchase eligibility.
---

Import current legacy stock and its merchant-owned photography into the Staff draft only. The reviewed migration inventory is the release authority, and the server publication boundary must enforce it before any imported item becomes public.

**Why:** A complete catalogue import is useful for replacing stale photography, but a draft-wide publish action can otherwise expose unreviewed descriptions, incorrect classifications, or unsafe checkout behavior. A client-side selector or importer-only flag does not protect the actual publication write. Managed copies also avoid making the new storefront depend on the legacy site remaining online.

**How to apply:** Preserve existing merchant edits, refresh matched photography instead of creating duplicates, and record stable source identity. Revalidate inventory approval, managed mirrors, and commerce evidence inside the publication transaction. Browse-only items stay unavailable and unmapped; checkout requires exact reviewed mappings and end-to-end evidence.