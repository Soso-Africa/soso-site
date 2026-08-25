---
name: Filtered header overlays
description: Why viewport dialogs must not remain inside sticky headers that use backdrop filters.
---

Render full-viewport dialogs outside any sticky header that applies `backdrop-filter`, preferably through a portal to the document body.

**Why:** Filtered ancestors establish a containing block for fixed descendants in browsers. A dialog that appears to use `position: fixed; inset: 0` can therefore collapse to the header's dimensions and expose the page beneath it, especially on mobile.

**How to apply:** When adding a menu, search, cart, or other viewport overlay from a filtered header, portal the overlay and give its internal flex scroll region `min-height: 0`; keep body scrolling locked while it is open.