---
name: Controlled privacy access packages
description: Safety boundary for handling verified subject-access requests without exposing data through staff views or audit trails.
---

Generate a subject-access package only after recorded identity verification, keep it server-side with a short expiry and one-time owner download, and audit only its reference, hash, counts, and actors.

**Why:** A staff-facing JSON response, broad customer export, or audit payload can create a second uncontrolled copy of sensitive information. Requester email is not sufficient evidence of identity.

**How to apply:** Keep the data allowlist explicit; exclude payment-provider secrets and references, staff/audit internals, credentials, and anonymous analytics. Do not complete deletion until approved retention and legal rules are available.