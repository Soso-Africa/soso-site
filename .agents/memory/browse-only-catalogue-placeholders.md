---
name: Browse-only catalogue placeholders
description: Safety rules for planned products that should be discoverable before they are approved for sale.
---

Planned catalogue placeholders may appear in navigation, search, collections, and product details while their fulfilment state is unavailable. They must have no commerce mappings, and public surfaces must hide placeholder prices, structured-data offers, quick purchase, and cart controls.

**Why:** The content schema requires a positive editable price field even before a merchant has approved a real price. Treating that internal placeholder as public would create a false commercial claim.

**How to apply:** Keep coming-soon records unavailable until real media, price, stock, fulfilment, and commerce mappings are approved. Preserve merchant-edited records during default upgrades by merging additions by stable slug rather than replacing arrays.