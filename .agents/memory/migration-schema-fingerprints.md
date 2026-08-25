---
name: Migration schema fingerprints
description: How to make fail-closed PostgreSQL schema fingerprints strict without rejecting equivalent fresh and upgraded schemas.
---

Schema fingerprints must compare application-relevant definitions: column types,
nullability and defaults; ordered enum labels; complete constraint definitions;
and named index uniqueness, validity, access method, keys, direction, and INCLUDE
columns.

Normalize only catalog differences proven to be semantically irrelevant. Physical
column position differs naturally between fresh `CREATE TABLE` and additive
`ALTER TABLE` paths, and PostgreSQL may represent an inserted enum position with
a fractional internal sort number even when label order is identical. A narrowly
identified historical btree variant may also be accepted when its equality
prefix and reverse-scannable ordering make it equivalent to the reviewed form.

**Why:** Presence-only checks allowed malformed established databases to report
success, while a raw catalog hash rejected supported legacy upgrades because of
representation details that do not affect application behavior.

**How to apply:** When the baseline or additive migrations change, regenerate
the canonical fingerprint from a fresh schema, prove a real legacy upgrade
produces the same normalized manifest, and add a negative case for any newly
fingerprinted definition.