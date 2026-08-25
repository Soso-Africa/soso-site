---
name: GitHub SDK history publishing
description: How to publish local Git history when HTTPS authentication and connector proxy writes are unavailable.
---

Use the GitHub connector's native SDK for Git blob, tree, commit, and ref writes when the workspace's HTTPS remote credential is rejected. Do not rely on generic connector proxy writes for this repository.

**Why:** Direct `git push` can lack a usable credential even when GitHub is connected, and generic proxy writes can fail in the connector replay layer. The native SDK successfully performs the same authorized writes. GitHub's create-commit API normalizes timestamps to UTC and omits the trailing message newline, so generated commit SHAs differ from ordinary local commits.

**How to apply:** Recreate each commit's exact tree and message through the SDK, chain commits using the SDK-returned parent SHA, verify every tree SHA, and advance `main` without force only after the live base ref is unchanged. Read large or binary workspace files directly inside the impure SDK operation; routing base64 through shell callback output can truncate bytes before upload. Rebuild matching local commit objects with UTC offsets and no trailing message newline, retain the original local chain on a backup branch, then align local and remote refs.