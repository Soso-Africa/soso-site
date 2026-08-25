---
name: TikTok browser pixel bootstrap
description: Required destination-specific initialization contract for the TikTok browser Pixel.
---

Initialize TikTok Pixel with the pixel-specific `events.js` request carrying `sdkid` and `lib=ttq`, plus the matching `_i`, `_t`, and `_o` bootstrap metadata. Loading the generic script and merely queuing `load(id)` is not sufficient.

**Why:** The generic loader cannot derive which governed pixel destination should receive events without the per-ID URL and metadata. A local queue can appear correct in unit tests while the real vendor SDK never initializes that destination.

**How to apply:** Assert the exact loader URL and bootstrap state, not only queued method names. On same-ID re-consent, restore the same pixel-specific loader and use TikTok's consent grant/revoke calls; continue to block in-page destination replacement.