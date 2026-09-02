# SOSO storefront visual baselines

`pnpm --filter @workspace/soso-store run validate:visual` builds and serves the
production storefront, intercepts API requests with the fixtures in `fixtures/`,
and compares 18 rendered screenshots against the approved PNGs in `baselines/`.
Long routes use full-page captures; the fixed cart drawer uses its defined
viewport.

The matrix covers home, shop, product, cart, checkout, policy, payment return,
404, and signed-out Staff at 1440×900 and 390×844.

The check also fails when:

- a public body or substantial semantic surface is no longer bright or readable;
- Staff sign-in is no longer dark and readable;
- the homepage hero slogan returns; or
- a global/header WhatsApp control is rendered.

After an intentional, reviewed visual change, refresh the approved images with:

```sh
UPDATE_VISUAL_BASELINES=1 pnpm --filter @workspace/soso-store run validate:visual
```

Review every changed PNG before committing it. Failed comparisons write captures
and highlighted diffs to the ignored `output/` directory. Successful runs remove
the output directory so stale or unnecessary captures are not retained.

For pull requests, the **Client review evidence / Storefront visual review**
check uploads failed PNG output and links it from the check summary. Evidence is
generated only from the deterministic public fixtures, expires after seven days,
and is not uploaded after a successful check. If setup or compilation fails
before a browser capture is possible, the summary points reviewers to the failed
step instead of promising an unavailable artifact.
