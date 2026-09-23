---
name: Catalogue mapping authority
description: Safety rules for mapping SOSO catalogue choices to JusticeSure inventory.
---

Treat a confirmed catalogue mapping as a binding between both sides: the SOSO product identity, eligibility, choices, and selected IDs, plus the JusticeSure product, variant semantics, price, attributes, and stock.

**Why:** A remote-only hash can leave a confirmation apparently current after local catalogue edits, while a local-only check cannot catch provider drift. Test credentials must not bypass the same catalogue authorization rules.

**How to apply:** Require current local and remote hashes at publication and checkout, verify the shopper's SOSO choice maps to the same live variant semantics, and use the same checks in JusticeSure test and live modes.