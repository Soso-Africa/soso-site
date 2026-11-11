# SOSO storefront visual baselines

`pnpm --filter @workspace/soso-store run validate:visual` builds and serves the
production storefront, intercepts API requests with the fixtures in `fixtures/`,
and compares 18 rendered screenshots against the approved PNGs in `baselines/`.
Long routes use full-page captures; the fixed cart drawer uses its defined
viewport.

The matrix covers home, shop, product, cart, checkout, policy, payment return,
404, and signed-out Staff at 1440×900 and 390×844.

## Open phone menu rotation regression

The gate also keeps one homepage document mounted while opening the phone menu
at 390×844 and resizing through 844×390, 767×390, 768×390, 1279×720,
1440×900 and back to portrait. It checks the close control's viewport position
and hit-testing, background scroll lock, explicit close and Escape cleanup,
automatic dismissal when measured desktop navigation fits, restored wheel
scrolling, focus return, and working portrait collection navigation.
All API traffic is fixture-backed, service workers are blocked, and no Staff
credentials or real content writes are used. Failures retain a screenshot and
phase log in ignored `output/`.

Run only this case with a fresh production build:

```sh
pnpm --filter @workspace/soso-store run test:phone-menu-browser
```

It runs automatically in `validate:visual` and both release gates; no pixel
baseline changes are needed.

## Comparison-video hero regression

The same gate also runs 20 isolated homepage cases: 390×844, 430×932 and
1440×900 under motion, reduced-motion and connection policies, plus two
same-page rotation cases and three real-playback visibility cases.
Three additional viewport screenshots cover
motion-enabled comparison framing. The checks assert:

- both figures remain in the full 4:3 contain-fit phone frame;
- an opaque, readable 72px mobile header stays above the frame;
- the shop CTA is visible below the phone frame and actually navigates to Shop;
- no horizontal overflow or wrong-viewport video download;
- desktop remains full-height with cover-fit footage;
- reduced motion renders/fetches neither video nor unrelated image-mode artwork.

The six fixed-viewport motion/reduced-motion cases also change the browser's
real `prefers-reduced-motion` preference twice without reloading (12 changes).
They retain the mounted document, hero and header, assert immediate video/control
removal and no new video requests during reduced motion, and verify recovery
decodes only the selected rendition with muted inline playback and no poster.
Header readability, frame geometry and first-screen CTA position must remain
unchanged. Actionability is checked at each change; real Shop navigation runs
in both the final reduced-motion and recovered states. The fixture holds the
decoded frame, so this is not proof of continuous autoplay.

Run only this matrix (including a fresh production build) with:

```sh
pnpm --filter @workspace/soso-store run test:hero-comparison-browser
```

It is already included in `validate:visual`, and consequently both
`validate:client-review` and `validate:release`. No Staff password, real content
write, database, or live media service is used. New contexts block service
workers; API replies and hero media are intercepted locally. Failure evidence
includes screenshots and a request log under ignored `output/`; completed
preference-change cases also write per-phase request logs until a successful
run clears the directory.

`fixtures/hero-comparison.webm` is a 12KB, one-second VP9 excerpt of the same
two-figure footage used for the comparison-layout review, reduced to 384×288 at
6fps without cropping. It is test-only (not in `public/` or the production
bundle). The first decoded frame is held for deterministic capture, while native
codec selection, loading and rendering remain real. Separate mobile/desktop URLs
serve the same small bytes so request assertions catch accidental desktop fetches.
This proves public layout, not production H.264 playback or Staff media approval.

To refresh only these three baselines after reviewing an intentional change:

```sh
UPDATE_VISUAL_BASELINES=1 pnpm --filter @workspace/soso-store run test:hero-comparison-browser
```

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
