---
name: Governed motion media identity
description: Publication rules for storage-backed hero video and static fallback assets.
---

Treat a storage-backed hero asset as publishable only when its configured extension, detected bytes, stored MIME type, animation state, and size budget agree. Motion fallbacks must be demonstrably static, not merely labeled as an image.

**Why:** Direct uploads do not make a filename or browser-supplied MIME authoritative, and animated raster fallbacks can bypass reduced-motion and data-saving behavior even when video itself is gated.

**How to apply:** Enforce these checks at both draft save and publication for governed hero media. Keep bundled-asset release validation aligned with the same static-fallback and transfer-budget rules.

Use the approved watermark-free atelier footage for both desktop and mobile homepage hero motion, reframing the same source responsively rather than switching creative between viewports or embedding a fixed logo.

**Why:** The merchant approved the clean source because the responsive site header already supplies SOSO branding; an embedded centre watermark duplicates the logo, competes with craft details, and crops poorly on mobile.

**How to apply:** Derive a 30fps landscape desktop export and centred portrait mobile crop from the clean source, keeping both muted, loop-safe, browser-compatible, and within the transfer budget.