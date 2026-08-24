---
name: Empty GitHub repository publishing
description: Safe GitHub connector publishing for an empty repository.
---

When publishing through the GitHub connector to a repository with no commits, create one real tracked file with the Contents API first, then create the complete tree and a follow-up commit through the Git-data API.

**Why:** GitHub returns a conflict for Git-data blob/ref operations while the repository has no commit, although Contents can create the initial branch and commit.

**How to apply:** Verify the default branch has no ref before bootstrapping, use a real source file rather than a disposable placeholder, and retain that bootstrap commit as the parent of the full project commit. Pass Git manifests through a base64-wrapped NUL-safe transport because shell callback output can normalize control separators.