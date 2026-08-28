---
name: Deterministic Chromium visual gates
description: Constraints for reliable pixel-baseline checks in the Replit storefront environment.
---

Browser visual gates must render the production build against committed content fixtures and approved screenshots, not infer coverage from source text. Long public routes need full-page or section-by-section coverage.

**Why:** Dynamic published content, late consent UI, web fonts, animations, locale, and API availability can change pixels without a storefront code regression. Replit also needs declared browser host libraries and an installed Playwright browser.

**How to apply:** Fix viewport, scale, locale, timezone, reduced motion, consent state, API responses, and font behavior before capture. Check substantial semantic surfaces and horizontal overflow in addition to pixels. Keep generated captures/diffs ignored, commit only reviewed baselines, and run the gate from the release command.