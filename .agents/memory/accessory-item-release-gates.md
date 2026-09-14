---
name: Accessory item release gates
description: Governing the independent transition from an accessory placeholder to a purchasable product.
---

Each accessory must remain explicitly marked as a placeholder until that exact item has complete real copy, governed product photography, an approved price, an available fulfilment state, applicable stock, and exact JusticeSure product and variant mappings. Placeholder state must fail closed in purchasing and offer metadata even if stale commerce IDs are present.

**Why:** Accessory types are previewed before their real product records are ready. A department-wide launch or inference from partial commerce fields could expose an incomplete checkout or remove coming-soon safeguards from unrelated items.

**How to apply:** Treat release state as item-level authority. Keep unreleased items browse-only and non-indexable; remove placeholder copy, artwork, and SEO signals only from the item being approved. Revalidate the same rule at publication and at storefront purchase/offer boundaries.