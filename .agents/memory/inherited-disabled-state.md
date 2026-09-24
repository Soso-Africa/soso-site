---
name: Inherited disabled state in browser tests
description: How to assert effective disabled controls inside a fieldset
---

Use Playwright's `isDisabled()` or CSS `:disabled` to assert that a control is disabled by its enclosing fieldset. The DOM element's own `.disabled` property can still be false when the fieldset disables it.

**Why:** A browser regression waited for `.disabled === true` on a child button and timed out even though the editor was correctly locked during an in-flight request.

**How to apply:** When testing forms locked by a parent fieldset, check the effective disabled state rather than the button's own attribute.