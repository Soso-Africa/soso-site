---
name: Consent-aware event lifecycle
description: Rules for reliable, privacy-safe first-party analytics events across consent changes and restricted browser storage.
---

Treat an affirmative measurement decision as a discrete grant, not merely a React state value. Record a page view once for each pathname within that grant, then record it again only after a real navigation or a subsequent grant that follows no/essential consent. Switching between allowed consent categories must not create a second page view.

**Why:** React effects can rerun when consent state changes or components remount. Browser storage can also be unavailable, so depending solely on local/session storage causes either stale consent decisions or repeated session-start events.

**How to apply:** Reconcile readable durable consent immediately before optional events, keep an in-memory fallback only when storage cannot be read, and maintain module-level guards for the current consent grant/path and the once-per-session start marker. Private route classification must remain shared between the client shell and server validator.