---
name: PostgreSQL cursor precision
description: Prevent cursor-pagination gaps when PostgreSQL timestamps have more precision than JavaScript dates.
---

For cursor pagination ordered by a PostgreSQL timestamp plus a stable ID, resolve the cursor row's exact timestamp in PostgreSQL and compare the `(timestamp, id)` tuple there. Do not round-trip the timestamp through JavaScript `Date` inside the cursor.

**Why:** PostgreSQL `timestamptz` can retain microseconds while JavaScript `Date` preserves only milliseconds. Reusing the truncated value as the next-page boundary can skip rows that share the cursor row's actual timestamp.

**How to apply:** Use an opaque stable row ID in the cursor, scope the cursor lookup to the same parent/entity, and let PostgreSQL perform the tuple comparison with its original timestamp value. Include a database test with equal microsecond timestamps across a page boundary.