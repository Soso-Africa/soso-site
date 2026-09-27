---
name: GitHub SDK history publishing
description: Durable guidance for publishing a verified Git tree through the GitHub SDK when ordinary push is unavailable.
---

When ordinary authenticated Git push is unavailable, prefer low-request native GitHub SDK commit batches over one request per blob, and treat remote tree verification as the release boundary.

**Why:** A connected GitHub account does not guarantee that the workspace remote has push credentials, and high-volume per-file writes can hit provider limits. Provider-generated commit identities can also differ from local Git history.

**How to apply:** Batch changes conservatively, publish serially from a verified base, and compare the complete remote tree with the intended local tree before opening or merging a pull request. Never merge a partially written branch.

When work is published directly to GitHub while the local task branch remains older, task completion may rebase that old branch onto a different main history. Treat the already-published tree as the authority for overlapping checkout behavior rather than reintroducing old implementations from the task branch.

**Why:** Parallel release and task histories can both contain valid-looking changes to the same payment files, but accepting older task hunks can replace an already verified production path.

**How to apply:** Compare behavior and generated contracts on both sides of a conflict, preserve the newer safe behavior, then typecheck and run focused tests before completing the task.