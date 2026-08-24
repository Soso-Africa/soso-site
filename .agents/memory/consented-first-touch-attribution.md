---
name: Consented first-touch attribution
description: Keep campaign landing context without storing optional analytics data before affirmative consent.
---

Capture UTM parameters in memory on the initial landing render, and persist or send them only after the visitor has affirmatively enabled measurement.

**Why:** A client-side route or redirect may remove the query string before the consent action finishes. Capturing only when an event is sent loses the first-touch campaign, while storing it before consent violates the intended measurement boundary.

**How to apply:** For any first-party campaign attribution enhancement, keep landing values ephemeral until consent succeeds; after that, retain the first valid attribution for the browser session and use it for later consented events.