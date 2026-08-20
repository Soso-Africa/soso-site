---
name: OpenAPI Zod format compatibility
description: Compatibility constraint for API contract generation in this workspace.
---

The current API contract generator targets a Zod version that does not support generated `zod.uuid()`, `zod.email()`, or `zod.int()` helpers.

**Why:** OpenAPI `format: uuid`, `format: email`, and `type: integer` caused code generation to complete but fail the workspace typecheck afterwards.

**How to apply:** For new API schemas, use compatible string patterns/length validation and numeric constraints unless the workspace’s Zod/codegen versions are updated together and validated.