---
name: Product colour integrity
description: Durable rules for shopper colour selection, fulfilment identity, and truthful garment recolouring.
---

Selected product colour is immutable order-line identity, not editable delivery-note text. Standard choices must match the published palette; custom requests are separately authorized and retained as bounded free text.

**Why:** Atelier fulfilment must not lose or silently overwrite the exact colour the shopper purchased.

**How to apply:** Keep colour in cart-line identity, authoritative checkout validation, order-item snapshots, and Staff order-line displays.

Never tint a complete editorial product photograph. Live recolouring requires a Staff-approved garment mask that is decoded and verified as a usable mixed-transparency PNG with the exact dimensions of its base photo; otherwise show the normal photograph and honest preview-unavailable guidance.

**Why:** Full-photo tinting changes skin, background, accessories, embroidery, and shadows and can materially misrepresent the garment.

**How to apply:** Keep generated masks as local review drafts until explicit approval. Validate mask ownership, MIME, extension, decoded-pixel budget, alpha coverage, and exact base-image dimensions before publication; keep the visualizer fail-closed when any check fails.

Technical mask validity is not shopper-facing approval. Do not publish generated masking merely because its file checks pass; use a dedicated colour-specific photo/render or require a human side-by-side review of several light and dark colours at full size.

**Why:** The shipped Dashiki mask met byte, alpha, and dimension checks but still looked crude and amateur in the actual product composition.

**How to apply:** Keep the public visualizer absent until each product has its own visually approved asset. Hex swatches may preserve a shopper's colour choice, but must not imply that an on-photo preview exists.

Treat brush history, not the mutable display canvas, as the source of truth for refined masks. Rebuild each committed draft from the immutable original plus serialized strokes, and keep approval locked until validation and any canvas repaint finish.

**Why:** Asynchronous canvas serialization and image decoding can otherwise overwrite a newly drawn stroke or let Staff approve the previous mask while the latest correction is still visible.

**How to apply:** Serialize refinement operations, synchronously block approval and further input while one is pending, ignore stale image callbacks, and unlock only when the validated draft and visible canvas agree.

For two-tone garments, the approved mask must cover only the material panels that the selected colour replaces. Preserve contrasting panels, trim, skin, accessories, and scenery; “As shown” must bypass recolouring and render the original photograph exactly. Use a normal partially transparent colour overlay rather than multiply-only blending when the source material is black.

**Why:** Multiply blending cannot turn black fabric into visibly lighter options, while an over-broad mask changes intentional contrast and misrepresents the design.

**How to apply:** Review several light and dark swatches against the same mask, verify the original selection restores the untouched base image, and keep a redundant replacement swatch out when it duplicates the original colour.