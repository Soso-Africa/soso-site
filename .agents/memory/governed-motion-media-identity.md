---
name: Governed motion media identity
description: Publication rules for storage-backed hero video and static fallback assets.
---

Treat a storage-backed hero asset as publishable only when its configured extension, detected bytes, stored MIME type, animation state, and size budget agree. Motion fallbacks must be demonstrably static, not merely labeled as an image.

**Why:** Direct uploads do not make a filename or browser-supplied MIME authoritative, and animated raster fallbacks can bypass reduced-motion and data-saving behavior even when video itself is gated.

**How to apply:** Enforce these checks at both draft save and publication for governed hero media. Keep bundled-asset release validation aligned with the same static-fallback and transfer-budget rules.

Use one approved black-garment studio source for both desktop and mobile homepage hero motion, reframing the same footage responsively rather than switching creative between viewports.

**Why:** The merchant explicitly chose a coordinated desktop/mobile treatment so the hero keeps one visual identity across devices.

**How to apply:** Derive a landscape desktop export and centered portrait mobile crop from the same source, keeping both muted, loop-safe, browser-compatible, and within the transfer budget.