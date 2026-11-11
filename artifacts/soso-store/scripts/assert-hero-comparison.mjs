import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const mediaPaths = {
  mobile: "/__visual/hero-comparison-mobile.webm",
  desktop: "/__visual/hero-comparison-desktop.webm",
  image: "/__visual/unrelated-desktop-artwork.jpg",
  mobileImage: "/__visual/unrelated-mobile-artwork.jpg",
};

function comparisonFixture(platform) {
  const fixture = structuredClone(platform);
  Object.assign(fixture.content.homepage.hero, {
    mediaMode: "video",
    mobileVideoLayout: "comparison",
    videoUrl: mediaPaths.desktop,
    mobileVideoUrl: mediaPaths.mobile,
    imageUrl: mediaPaths.image,
    mobileImageUrl: mediaPaths.mobileImage,
    primaryCta: { label: "Shop the Collection", href: "/shop" },
    campaignCta: { ...fixture.content.homepage.hero.campaignCta, enabled: false },
  });
  return fixture;
}

async function layout(page) {
  return page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`Missing comparison surface: ${selector}`);
      const { x, y, width, height, bottom, right } = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = style.backgroundColor;
      ctx.fillRect(0, 0, 1, 1);
      return { x, y, width, height, bottom, right, color: style.color,
        background: style.backgroundColor, backgroundAlpha: ctx.getImageData(0, 0, 1, 1).data[3],
        objectFit: style.objectFit, opacity: style.opacity };
    };
    const video = document.querySelector('[data-testid="home-hero-video"]');
    return {
      header: rect('[data-testid="storefront-header"]'),
      frame: rect('[data-testid="homepage-hero-frame"]'),
      hero: rect('[data-testid="homepage-hero"]'),
      cta: rect('[data-testid="link-home-hero-primary"]'),
      video: video ? { ...rect('[data-testid="home-hero-video"]'),
        widthIntrinsic: video.videoWidth, heightIntrinsic: video.videoHeight,
        currentSrc: video.currentSrc, poster: video.poster } : null,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

// Real public components + production CSS, but no Staff, database or remote media.
export async function assertHeroComparison({
  browser, origin, platform, fixtureDir, outputDir, installDeterministicRoutes,
  compareScreenshot, baselineDir, contrast, parseRgb,
}) {
  const clip = await readFile(resolve(fixtureDir, "hero-comparison.webm"));
  const fixture = comparisonFixture(platform);
  const cases = [
    { name: "phone-390", viewport: { width: 390, height: 844 }, mobile: true },
    { name: "phone-430", viewport: { width: 430, height: 932 }, mobile: true },
    { name: "desktop", viewport: { width: 1440, height: 900 }, mobile: false },
    {
      name: "rotation", viewport: { width: 390, height: 844 },
      steps: [
        { name: "portrait", viewport: { width: 390, height: 844 }, mobile: true },
        { name: "landscape", viewport: { width: 844, height: 650 }, mobile: false },
        { name: "wide-boundary", viewport: { width: 768, height: 844 }, mobile: false },
        { name: "phone-boundary", viewport: { width: 767, height: 844 }, mobile: true },
        { name: "portrait-return", viewport: { width: 390, height: 844 }, mobile: true },
      ],
    },
    {
      name: "scrolled-rotation", viewport: { width: 390, height: 844 },
      scrollBeforeResize: true,
      steps: [
        { name: "phone-boundary", viewport: { width: 767, height: 844 }, mobile: true },
        { name: "wide-boundary", viewport: { width: 768, height: 844 }, mobile: false },
        { name: "landscape", viewport: { width: 844, height: 650 }, mobile: false },
        { name: "phone-boundary-return", viewport: { width: 767, height: 844 }, mobile: true },
        { name: "portrait-return", viewport: { width: 390, height: 844 }, mobile: true },
      ],
    },
  ];
  const policies = [
    { name: "", reduced: false, saveData: false, effectiveType: "4g" },
    { name: "-reduced", reduced: true, saveData: false, effectiveType: "4g" },
    { name: "-save-data", reduced: false, saveData: true, effectiveType: "4g", constrained: true },
    { name: "-slow-2g", reduced: false, saveData: false, effectiveType: "slow-2g", constrained: true },
    { name: "-2g", reduced: false, saveData: false, effectiveType: "2g", constrained: true },
  ];
  const waitForDecodedVideo = () => {
    const video = document.querySelector('[data-testid="home-hero-video"]');
    return video?.readyState >= 2 && video.videoWidth > 0
      && Number(getComputedStyle(video).opacity) >= 0.8 && video.paused;
  };
  const pathsOf = (requests) => requests.map((url) => new URL(url).pathname);
  const assertNoArtwork = async (page, requests, label) => {
    const paths = pathsOf(requests);
    assert.ok(!paths.includes(mediaPaths.image) && !paths.includes(mediaPaths.mobileImage),
      `${label}: unrelated image-mode artwork was fetched`);
    assert.equal(await page.getByTestId("home-hero-media").locator("img,picture").count(), 0,
      `${label}: unrelated image-mode artwork was rendered`);
  };
  const assertNoMotion = async (page, requests, label) => {
    assert.equal(await page.getByTestId("home-hero-video").count(), 0,
      `${label}: motion restriction rendered a video`);
    assert.equal(await page.getByTestId("button-hero-motion").count(), 0,
      `${label}: motion restriction left an unusable motion control`);
    assert.ok(!pathsOf(requests).some((path) => /\.(webm|mp4)$/i.test(path)),
      `${label}: motion restriction fetched video`);
    await assertNoArtwork(page, requests, label);
  };
  const changeConnection = async (page, connection) => {
    await page.evaluate((next) => {
      Object.assign(navigator.connection, next);
      navigator.connection.dispatchEvent(new Event("change"));
    }, connection);
  };
  const installFixtureRoutes = async (page, label) => {
    await installDeterministicRoutes(page, fixture);
    // Registered last: no remote content, Staff requests or real writes.
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      assert.ok(["GET", "HEAD", "POST"].includes(route.request().method()));
      assert.ok(route.request().method() !== "POST" || url.pathname === "/api/price-display",
        `${label}: unexpected write ${url.pathname}`);
      if ([mediaPaths.mobile, mediaPaths.desktop].includes(url.pathname)) {
        return route.fulfill({ status: 200, contentType: "video/webm", body: clip });
      }
      if ([mediaPaths.image, mediaPaths.mobileImage].includes(url.pathname)) {
        return route.abort();
      }
      return route.fallback();
    });
  };
  const assertReadableHeader = async (page, measured, label) => {
    assert.ok(measured.header.height >= 72 && Math.abs(measured.header.y) <= 1,
      `${label}: opaque header must remain pinned and unclipped`);
    assert.equal(measured.header.backgroundAlpha, 255, `${label}: header must be opaque`);
    assert.ok(contrast(parseRgb(measured.header.color), parseRgb(measured.header.background)) >= 7,
      `${label}: header text contrast`);
    const menu = page.locator("header").getByRole("button", {
      name: fixture.content.site.header.openMenuLabel, exact: true,
    });
    const menuColors = await menu.evaluate((element) => {
      // Resolve Tailwind's translucent oklab() colors against the real background.
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = getComputedStyle(element.closest("header")).backgroundColor;
      ctx.fillRect(0, 0, 1, 1);
      const background = Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3);
      ctx.fillStyle = getComputedStyle(element).color;
      ctx.fillRect(0, 0, 1, 1);
      return { color: Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3), background };
    });
    assert.ok(contrast(menuColors.color, menuColors.background) >= 4.5,
      `${label}: menu control contrast`);
    await page.getByTestId("link-header-home").waitFor({ state: "visible" });
  };
  let caseCount = 0;
  let motionChanges = 0;
  let rotationCount = 0;
  for (const scenario of cases) {
    // Keep connection-change coverage in the fixed-size matrix; the rotation
    // case independently exercises responsive listeners with and without motion.
    for (const policy of scenario.steps ? policies.slice(0, 2) : policies) {
      const { reduced, constrained } = policy;
      const scenarioLabel = `hero-comparison-${scenario.name}${policy.name}`;
      let label = scenarioLabel;
      const context = await browser.newContext({
        viewport: scenario.viewport, colorScheme: "light",
        reducedMotion: reduced ? "reduce" : "no-preference",
        deviceScaleFactor: 1, locale: "en-US", timezoneId: "Africa/Lagos",
        serviceWorkers: "block",
      });
      const page = await context.newPage();
      const requests = [];
      const errors = [];
      page.on("request", (request) => requests.push(request.url()));
      page.on("pageerror", (error) => errors.push(error.message));
      try {
        await installFixtureRoutes(page, label);
        await page.addInitScript(({ saveData, effectiveType }) => {
          localStorage.clear();
          sessionStorage.clear();
          localStorage.setItem("soso-consent-v1", "essential_only");
          sessionStorage.setItem("soso-pwa-install-dismissed-v1", "yes");
          // Keep motion enabled for source selection, but hold a decoded first
          // frame for deterministic screenshots rather than racing autoplay.
          document.addEventListener("loadeddata", (event) => {
            if (event.target instanceof HTMLVideoElement) {
              event.target.pause();
              event.target.currentTime = 0;
            }
          }, true);
          Object.defineProperty(navigator, "connection", {
            configurable: true,
            value: Object.assign(new EventTarget(), { saveData, effectiveType }),
          });
        }, { saveData: policy.saveData, effectiveType: policy.effectiveType });
        await page.goto(origin, { waitUntil: "networkidle" });
        await page.getByTestId("link-home-hero-primary").waitFor({ state: "visible" });
        await page.evaluate(() => document.fonts.ready);
        await page.addStyleTag({
          content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}",
        });
        // Retain the actual mounted public hero and header: a reload or remount
        // would hide the missing matchMedia listeners this case must catch.
        const mounted = await page.evaluateHandle(() => ({
          document,
          hero: document.querySelector('[data-testid="homepage-hero"]'),
          header: document.querySelector('[data-testid="storefront-header"]'),
        }));
        const expectedVideoPaths = new Set();
        for (const testCase of scenario.steps ?? [scenario]) {
          label = scenario.steps ? `${scenarioLabel}-${testCase.name}` : scenarioLabel;
          if (scenario.scrollBeforeResize) {
            // Use a real scroll event, not a class/state shim. Resize only after
            // Navbar has observed the scrolled position in the previous viewport.
            await page.evaluate(() => window.scrollTo({ top: 160, behavior: "instant" }));
            await page.waitForFunction(() => window.scrollY > 40
              && document.querySelector('[data-testid="storefront-header"]').classList.contains("bg-background"));
            await assertReadableHeader(page, await layout(page), `${label}/before-resize`);
          }
          if (scenario.steps) await page.setViewportSize(testCase.viewport);
          if (scenario.scrollBeforeResize) {
            const selected = testCase.mobile ? mediaPaths.mobile : mediaPaths.desktop;
            await page.waitForFunction(({ selected, reduced }) => {
              const video = document.querySelector('[data-testid="home-hero-video"]');
              return window.scrollY > 40
                && document.querySelector('[data-testid="storefront-header"]').classList.contains("bg-background")
                && (reduced ? !video : video && new URL(video.currentSrc, location.href).pathname === selected);
            }, { selected, reduced });
            const scrolled = await layout(page);
            assert.ok(scrolled.overflow <= 1, `${label}: scrolled horizontal overflow`);
            await assertReadableHeader(page, scrolled, `${label}/after-resize`);
            await page.screenshot({ path: resolve(outputDir, `${label}-scrolled.png`), animations: "disabled" });
            // Restore the top without reloading: the same Navbar must discard
            // its scrolled state and recover the viewport-specific hero treatment.
            await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
            await page.waitForFunction(() => window.scrollY === 0);
          }
          const selected = testCase.mobile ? mediaPaths.mobile : mediaPaths.desktop;
          // Source selection and Navbar update in independent React effects.
          // Wait for observable results, not an arbitrary timeout after resize.
          await page.waitForFunction(({ mobile, selected, motionUnavailable }) => {
            const header = document.querySelector('[data-testid="storefront-header"]');
            const video = document.querySelector('[data-testid="home-hero-video"]');
            return header?.classList.contains(mobile ? "bg-background" : "bg-transparent")
              && (motionUnavailable ? !video : video && new URL(video.currentSrc, location.href).pathname === selected
                && getComputedStyle(video).objectFit === (mobile ? "contain" : "cover"));
          }, { mobile: testCase.mobile, selected, motionUnavailable: reduced || constrained });
          if (!reduced && !constrained) {
            await page.waitForFunction(waitForDecodedVideo);
          }
          assert.ok(await page.evaluate((mounted) => mounted.document === document
            && mounted.hero === document.querySelector('[data-testid="homepage-hero"]')
            && mounted.header === document.querySelector('[data-testid="storefront-header"]'), mounted),
          `${label}: responsive changes must preserve the mounted document, hero and header`);
          const measured = await layout(page);
          assert.ok(measured.overflow <= 1, `${label}: horizontal overflow`);
          assert.equal(await page.getByTestId("homepage-hero").getAttribute("data-mobile-layout"), "comparison");
          if (testCase.mobile) {
            assert.ok(Math.abs(measured.frame.width / measured.frame.height - 4 / 3) < 0.01,
              `${label}: frame must stay 4:3`);
            assert.ok(measured.frame.y >= measured.header.bottom - 1,
              `${label}: footage must start below the mobile header`);
            await assertReadableHeader(page, measured, label);
            assert.ok(measured.cta.y >= measured.frame.bottom && measured.cta.bottom < testCase.viewport.height,
              `${label}: shop CTA must be below the footage and reachable in the first screen`);
          } else {
            assert.ok(Math.abs(measured.hero.height - testCase.viewport.height) <= 1,
              `${label}: desktop must remain full-height`);
            assert.ok(Math.abs(measured.frame.height - measured.hero.height) <= 1,
              `${label}: desktop footage must fill the hero`);
            assert.equal(measured.header.backgroundAlpha, 0, `${label}: wider header must be transparent`);
            assert.ok(measured.frame.y <= measured.header.y + 1
              && measured.frame.bottom > measured.header.bottom,
            `${label}: wider footage must extend underneath the overlay header`);
          }
          if (scenario.scrollBeforeResize) {
            // Hit-test at every recovered viewport; the final real click below
            // additionally proves the CTA still reaches the fixture shop.
            await page.getByTestId("link-home-hero-primary").click({ trial: true });
            assert.equal(await page.evaluate(() => window.scrollY), 0,
              `${label}: recovered CTA must be reachable without scrolling`);
          }
          const paths = pathsOf(requests);
          await assertNoArtwork(page, requests, label);
          if (reduced || constrained) {
            await assertNoMotion(page, requests, label);
          } else {
            expectedVideoPaths.add(selected);
            assert.ok(paths.includes(selected), `${label}: selected video was not fetched`);
            assert.deepEqual([...new Set(paths.filter((path) => /\.(webm|mp4)$/i.test(path)))].sort(),
              [...expectedVideoPaths].sort(),
              `${label}: unexpected video preload or download`);
            assert.equal(new URL(measured.video.currentSrc).pathname, selected);
            assert.equal(measured.video.poster, "", `${label}: video has unrelated poster`);
            assert.equal(measured.video.objectFit, testCase.mobile ? "contain" : "cover");
            assert.equal(measured.video.widthIntrinsic, 384);
            assert.equal(measured.video.heightIntrinsic, 288);
            // contain + matching 4:3 bounds preserves the ENTIRE same-footage frame
            // (both figures). Pixel baselines also detect obscuring overlays.
            assert.ok(Math.abs(measured.video.width - measured.frame.width) <= 1);
            assert.ok(Math.abs(measured.video.height - measured.frame.height) <= 1);
          }
          const actualPath = resolve(outputDir, `${label}.png`);
          await page.screenshot({ path: actualPath, animations: "disabled" });
          if (!reduced && !constrained && !scenario.steps) {
            await compareScreenshot(actualPath, resolve(baselineDir, `${label}.png`),
              resolve(outputDir, `${label}-diff.png`), label);
          }
          if (!constrained && !scenario.steps) {
            // Emulate the browser preference, not a synthetic matchMedia mock.
            // Starting from both policies ends one case in reduced motion and
            // the other recovered, so the real Shop click below covers both.
            const phases = [];
            for (const nextReduced of [!reduced, reduced]) {
              const phase = nextReduced ? "changed-to-reduce" : "changed-to-no-preference";
              const phaseLabel = `${label}-${phase}`;
              const requestStart = requests.length;
              await page.emulateMedia({ reducedMotion: nextReduced ? "reduce" : "no-preference" });
              assert.equal(await page.evaluate(() =>
                matchMedia("(prefers-reduced-motion: reduce)").matches), nextReduced,
              `${phaseLabel}: browser preference did not change`);
              if (nextReduced) {
                await page.getByTestId("home-hero-video").waitFor({ state: "detached" });
                await page.waitForFunction(() => document.querySelector('[data-testid="home-hero-media"]')
                  ?.getAttribute("data-playback-state") === "motion-unavailable");
              } else {
                await page.waitForFunction(waitForDecodedVideo);
                await page.getByTestId("button-hero-motion").waitFor({ state: "visible" });
                const recovered = await layout(page);
                assert.equal(new URL(recovered.video.currentSrc).pathname, selected,
                  `${phaseLabel}: recovery selected the wrong rendition`);
                assert.equal(recovered.video.poster, "", `${phaseLabel}: recovery added a poster`);
                assert.equal(recovered.video.objectFit, testCase.mobile ? "contain" : "cover");
                assert.equal(recovered.video.widthIntrinsic, 384);
                assert.equal(recovered.video.heightIntrinsic, 288);
                assert.ok(await page.getByTestId("home-hero-video").evaluate((video) =>
                  video.muted && video.defaultMuted && video.playsInline),
                `${phaseLabel}: recovery lost safe playback attributes`);
              }
              // Observe the settled request window, including deferred loads.
              // Pre-change video requests are allowed; new restricted ones aren't.
              await page.waitForLoadState("networkidle");
              const phaseRequests = requests.slice(requestStart);
              if (nextReduced) await assertNoMotion(page, phaseRequests, phaseLabel);
              await assertNoArtwork(page, requests, phaseLabel);
              assert.deepEqual([...new Set(pathsOf(requests).filter((path) => /\.(webm|mp4)$/i.test(path)))],
                [selected], `${phaseLabel}: preference changes fetched another rendition`);
              assert.ok(await page.evaluate((mounted) => mounted.document === document
                && mounted.hero === document.querySelector('[data-testid="homepage-hero"]')
                && mounted.header === document.querySelector('[data-testid="storefront-header"]'), mounted),
              `${phaseLabel}: preference change reloaded or remounted the public surfaces`);
              const changed = await layout(page);
              for (const surface of ["header", "frame", "hero", "cta", "overflow"]) {
                // Initial checks above establish readability, contrast and
                // first-screen CTA reachability; none may change with motion.
                assert.deepEqual(changed[surface], measured[surface],
                  `${phaseLabel}: preference change moved or restyled ${surface}`);
              }
              await page.getByTestId("link-home-hero-primary").click({ trial: true });
              // Playwright's trial click still moves the pointer. Clear the
              // CTA hover transform before measuring the next preference.
              await page.mouse.move(0, 0);
              await page.screenshot({
                path: resolve(outputDir, `${phaseLabel}.png`), animations: "disabled",
              });
              phases.push({ phase, requests: phaseRequests });
              motionChanges++;
              process.stdout.write(`Passed ${phaseLabel}: same-page motion, stable layout and safe requests.\n`);
            }
            await writeFile(resolve(outputDir, `${label}-motion.json`),
              JSON.stringify({ initiallyReduced: reduced, phases }, null, 2));
          }
          if (constrained) {
            // No reload or remount: exercise the public component's real
            // NetworkInformation change listener, not just source-selection units.
            const phases = [{ phase: "initially-restricted", requests: [...requests] }];
            await changeConnection(page, { saveData: false, effectiveType: "4g" });
            await page.waitForFunction(waitForDecodedVideo);
            await page.waitForLoadState("networkidle");
            assert.deepEqual([...new Set(pathsOf(requests).filter((path) => /\.(webm|mp4)$/i.test(path)))],
              [selected], `${label}: recovery must download only the matching rendition`);
            const recovered = await layout(page);
            assert.equal(new URL(recovered.video.currentSrc).pathname, selected);
            assert.equal(recovered.video.poster, "", `${label}: recovery added unrelated poster`);
            phases.push({ phase: "recovered-4g", requests: [...requests] });

            // Once restricted again, unmount the active video and keep the frame,
            // header and CTA stable without starting any further media requests.
            const restrictedStart = requests.length;
            await changeConnection(page, { saveData: policy.saveData, effectiveType: policy.effectiveType });
            await page.getByTestId("home-hero-video").waitFor({ state: "detached" });
            await page.waitForLoadState("networkidle");
            await assertNoMotion(page, requests.slice(restrictedStart), `${label}: changed connection`);
            await assertNoArtwork(page, requests, label);
            const restricted = await layout(page);
            for (const surface of ["header", "frame", "hero", "cta", "overflow"]) {
              assert.deepEqual(restricted[surface], measured[surface],
                `${label}: connection changes moved or restyled ${surface}`);
            }
            phases.push({ phase: "restricted-again", requests: requests.slice(restrictedStart) });
            await writeFile(resolve(outputDir, `${label}-network.json`),
              JSON.stringify({ connection: policy, phases }, null, 2));
          }
          process.stdout.write(`Passed ${label}: framing, header, CTA, overflow and media requests.\n`);
        }
        await mounted.dispose();
        // A real click proves neither a header nor another layer intercepts it.
        await page.getByTestId("link-home-hero-primary").click();
        await page.waitForURL(`${origin}/shop`);
        await page.getByTestId("status-result-count").waitFor({ state: "visible" });
        assert.deepEqual(errors, [], `${label}: browser errors`);
        caseCount++;
        if (scenario.steps) rotationCount++;
        process.stdout.write(`Passed ${scenarioLabel}: shop CTA navigation${scenario.steps ? " after same-page rotation" : ""}.\n`);
      } catch (error) {
        await page.screenshot({ path: resolve(outputDir, `${label}-failure.png`) }).catch(() => {});
        await writeFile(resolve(outputDir, `${label}-requests.json`),
          JSON.stringify({ requests, errors }, null, 2));
        throw error;
      } finally {
        await context.close();
      }
    }
  }
  // Separate contexts deliberately omit the screenshot loadeddata/pause shim:
  // these assertions exercise actual decoding, playback and IntersectionObserver.
  const fixedCases = cases.filter((scenario) => !scenario.steps);
  for (const testCase of fixedCases) {
    const label = `hero-comparison-${testCase.name}-visibility`;
    const selected = testCase.mobile ? mediaPaths.mobile : mediaPaths.desktop;
    const context = await browser.newContext({
      viewport: testCase.viewport, colorScheme: "light", reducedMotion: "no-preference",
      deviceScaleFactor: 1, locale: "en-US", timezoneId: "Africa/Lagos",
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    const requests = [];
    const errors = [];
    const phases = [];
    page.on("request", (request) => requests.push(request.url()));
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await installFixtureRoutes(page, label);
      await page.addInitScript(() => {
        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem("soso-consent-v1", "essential_only");
        sessionStorage.setItem("soso-pwa-install-dismissed-v1", "yes");
        Object.defineProperty(navigator, "connection", {
          configurable: true,
          value: Object.assign(new EventTarget(), { saveData: false, effectiveType: "4g" }),
        });
        // Headless tabs do not reliably change Page Visibility on focus. Control
        // only that browser signal; do not mock play/pause or the app's hook.
        let hidden = true;
        Object.defineProperty(document, "visibilityState", {
          configurable: true, get: () => hidden ? "hidden" : "visible",
        });
        Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
        window.__setHeroDocumentHidden = (next) => {
          hidden = next;
          document.dispatchEvent(new Event("visibilitychange"));
        };
        window.__heroLoadEvents = [];
        window.__heroDocument = document;
        window.__heroLifecycle = [];
        for (const type of ["pageshow", "pagehide", "popstate"]) {
          window.addEventListener(type, (event) => {
            window.__heroLifecycle.push({ type, persisted: event.persisted ?? null });
          });
        }
        for (const type of ["loadstart", "emptied"]) {
          document.addEventListener(type, (event) => {
            if (event.target instanceof HTMLVideoElement) window.__heroLoadEvents.push(type);
          }, true);
        }
      });
      const setHidden = (hidden) => page.evaluate((next) => window.__setHeroDocumentHidden(next), hidden);
      const scrollHero = (visible) => page.evaluate((next) => {
        const media = document.querySelector('[data-testid="home-hero-media"]');
        const bottom = media.getBoundingClientRect().bottom + window.scrollY;
        window.scrollTo({ top: next ? 0 : bottom + 100, behavior: "instant" });
      }, visible);
      const waitForPlayback = async (playing) => {
        await page.waitForFunction((expected) => {
          const media = document.querySelector('[data-testid="home-hero-media"]');
          const video = document.querySelector('[data-testid="home-hero-video"]');
          return video?.readyState >= 2 && video.paused === !expected
            && media.dataset.playbackState === (expected ? "playing" : "paused");
        }, playing);
        const time = await page.getByTestId("home-hero-video").evaluate((video) => video.currentTime);
        if (playing) {
          // A "playing" event alone is not proof the footage advances.
          await page.waitForFunction((previous) => {
            const video = document.querySelector('[data-testid="home-hero-video"]');
            return !video.paused && video.currentTime !== previous;
          }, time);
        } else {
          // Allow a paint/task turn before checking that paused footage stays put.
          await page.waitForTimeout(200);
          assert.equal(await page.getByTestId("home-hero-video").evaluate((video) => video.currentTime), time,
            `${label}: paused footage advanced`);
        }
      };
      await page.goto(origin, { waitUntil: "networkidle" });
      await page.getByTestId("link-home-hero-primary").waitFor({ state: "visible" });
      assert.equal(await page.getByTestId("home-hero-video").count(), 0,
        `${label}: initially hidden document activated a video`);
      assert.deepEqual(pathsOf(requests).filter((path) => /\.(webm|mp4)$/i.test(path)), [],
        `${label}: initially hidden document downloaded video`);
      await assertNoArtwork(page, requests, label);
      phases.push({ phase: "initially-hidden", requests: [...requests] });

      await setHidden(false);
      await waitForPlayback(true);
      await page.waitForLoadState("networkidle");
      const video = await page.getByTestId("home-hero-video").elementHandle();
      assert.ok(video, `${label}: missing activated video`);
      const initialLoads = await page.evaluate(() => [...window.__heroLoadEvents]);
      assert.deepEqual(initialLoads, ["loadstart"], `${label}: unexpected initial video loads`);
      const assertRetainedSource = async (phase) => {
        await page.waitForLoadState("networkidle");
        assert.equal(await video.evaluate((element) =>
          element === document.querySelector('[data-testid="home-hero-video"]') && element.isConnected), true,
        `${label}/${phase}: activated video was replaced or removed`);
        assert.equal(await video.evaluate((element) => new URL(element.currentSrc).pathname), selected,
          `${label}/${phase}: activated source changed`);
        assert.equal(await video.evaluate((element) => element.poster), "",
          `${label}/${phase}: unrelated poster appeared`);
        assert.deepEqual(await page.evaluate(() => window.__heroLoadEvents), initialLoads,
          `${label}/${phase}: activated video was reloaded`);
        // Exact request counts, not a Set: repeated downloads of the same URL
        // must fail too. Routing disables HTTP cache in these isolated contexts.
        assert.deepEqual(pathsOf(requests).filter((path) => /\.(webm|mp4)$/i.test(path)), [selected],
          `${label}/${phase}: repeated or unexpected rendition request`);
        await assertNoArtwork(page, requests, `${label}/${phase}`);
        phases.push({ phase, requests: [...requests],
          playback: await video.evaluate((element) => ({
            paused: element.paused, currentTime: element.currentTime, currentSrc: element.currentSrc,
          })) });
      };
      await assertRetainedSource("activated-visible");
      for (let cycle = 1; cycle <= 2; cycle += 1) {
        await scrollHero(false);
        await page.waitForFunction(() =>
          document.querySelector('[data-testid="home-hero-media"]').getBoundingClientRect().bottom < 0);
        await waitForPlayback(false);
        await assertRetainedSource(`offscreen-${cycle}`);
        await scrollHero(true);
        await waitForPlayback(true);
        await assertRetainedSource(`onscreen-${cycle}`);
      }
      await setHidden(true);
      await waitForPlayback(false);
      await assertRetainedSource("document-hidden");
      await scrollHero(false);
      await setHidden(false);
      await waitForPlayback(false);
      await assertRetainedSource("visible-document-still-offscreen");
      await setHidden(true);
      await scrollHero(true);
      await waitForPlayback(false);
      await assertRetainedSource("onscreen-document-still-hidden");
      await setHidden(false);
      await waitForPlayback(true);
      await assertRetainedSource("document-visible-resumed");

      // Visibility must not undo the shopper's explicit pause.
      await page.getByTestId("button-hero-motion").click();
      await waitForPlayback(false);
      await scrollHero(false);
      await setHidden(true);
      await scrollHero(true);
      await setHidden(false);
      await waitForPlayback(false);
      await assertRetainedSource("manual-pause-retained");
      await page.getByTestId("button-hero-motion").click();
      await waitForPlayback(true);
      await assertRetainedSource("manual-play-resumed");

      // Wouter's Home -> Shop -> Back is same-document history, not BFCache.
      // Home unmounts: a fresh video (and one fresh fixture request with routing
      // disabling HTTP cache) is expected. Manual pause is component-scoped, not
      // a session preference; do not assert persistence across remount/reload.
      let expectedLoads = 1;
      const documentRequests = () => requests.filter((url) => url === `${origin}/`).length;
      const initialDocumentRequests = documentRequests();
      const initialLifecycle = await page.evaluate(() => [...window.__heroLifecycle]);
      const assertReturn = async (phase, previousVideo, playing) => {
        await page.waitForURL(`${origin}/`);
        await page.getByTestId("home-hero-media").waitFor();
        assert.equal(await page.evaluate(() => window.__heroDocument === document), true,
          `${label}/${phase}: document changed; this check only covers route remounts`);
        assert.equal(await previousVideo.evaluate((element) => element.isConnected), false,
          `${label}/${phase}: Home video did not unmount`);
        assert.equal(documentRequests(), initialDocumentRequests,
          `${label}/${phase}: Back unexpectedly loaded a document`);
        const lifecycle = await page.evaluate(() => [...window.__heroLifecycle]);
        assert.deepEqual(lifecycle.filter((event) => event.type !== "popstate"), initialLifecycle,
          `${label}/${phase}: unexpected page lifecycle; do not classify as a route remount`);
        assert.equal(lifecycle.filter((event) => event.type === "popstate").length, phases
          .filter((entry) => entry.navigation === "same-document-remount").length + 1,
        `${label}/${phase}: missing browser Back popstate`);
        if (playing !== null) await waitForPlayback(playing);
        await page.waitForLoadState("networkidle");
        assert.deepEqual(pathsOf(requests).filter((path) => /\.(webm|mp4)$/i.test(path)),
          Array(expectedLoads).fill(selected),
          `${label}/${phase}: repeated or wrong rendition request across route remounts`);
        await assertNoArtwork(page, requests, `${label}/${phase}`);
        if (playing !== null) {
          const attributes = await page.getByTestId("home-hero-video").evaluate((element) => ({
            source: new URL(element.currentSrc).pathname, poster: element.poster,
            muted: element.muted, loop: element.loop, playsInline: element.playsInline,
          }));
          assert.deepEqual(attributes, { source: selected, poster: "", muted: true, loop: true, playsInline: true },
            `${label}/${phase}: restored video lost its safe source or playback attributes`);
        } else {
          assert.equal(await page.getByTestId("home-hero-video").count(), 0,
            `${label}/${phase}: hidden restoration activated a new source`);
        }
        phases.push({ phase, navigation: "same-document-remount", expectedLoads, lifecycle,
          requests: [...requests] });
      };
      const visitShop = async () => {
        const previousVideo = await page.getByTestId("home-hero-video").elementHandle();
        assert.ok(previousVideo, `${label}: navigate only after hero activation`);
        await page.getByTestId("link-home-hero-primary").click();
        await page.waitForURL(`${origin}/shop`);
        await page.getByTestId("home-hero-media").waitFor({ state: "detached" });
        assert.equal(await page.getByTestId("home-hero-media").count(), 0,
          `${label}: Shop retained the Home hero`);
        return previousVideo;
      };

      // Visible Back creates a new hero with the ordinary autoplay policy.
      let previousVideo = await visitShop();
      await page.goBack();
      expectedLoads++;
      await assertReturn("back-visible-playing", previousVideo, true);

      // A manual pause survives visibility changes above, but intentionally
      // ends with the component's lifetime when the shopper leaves Home.
      await page.getByTestId("button-hero-motion").click();
      await waitForPlayback(false);
      previousVideo = await visitShop();
      await page.goBack();
      expectedLoads++;
      await assertReturn("back-after-manual-pause-new-mount", previousVideo, true);
      await page.getByTestId("button-hero-motion").click();
      await waitForPlayback(false);
      await setHidden(true);
      await setHidden(false);
      await waitForPlayback(false);
      await page.getByTestId("button-hero-motion").click();
      await waitForPlayback(true);

      // A hidden Back must not attach/fetch the replacement until visible.
      previousVideo = await visitShop();
      await setHidden(true);
      await page.goBack();
      await assertReturn("back-document-hidden", previousVideo, null);
      await setHidden(false);
      expectedLoads++;
      await waitForPlayback(true);
      await page.waitForLoadState("networkidle");
      assert.deepEqual(pathsOf(requests).filter((path) => /\.(webm|mp4)$/i.test(path)),
        Array(expectedLoads).fill(selected), `${label}: hidden Back recovery fetched an unexpected rendition`);
      // A shopper's wheel cancels pending late-layout scroll restoration.
      // scrollTo alone does not, and can race its ResizeObserver correction.
      await page.mouse.wheel(0, 100);
      await scrollHero(false);
      await waitForPlayback(false);
      previousVideo = await page.getByTestId("home-hero-video").elementHandle();
      assert.ok(previousVideo);
      // Dispatch the real link's click without Playwright scrolling the CTA
      // into view: Back must restore the actual offscreen departure position.
      const departureY = await page.evaluate(() => {
        const y = window.scrollY;
        document.querySelector('[data-testid="link-home-hero-primary"]').click();
        return y;
      });
      await page.waitForURL(`${origin}/shop`);
      await page.getByTestId("home-hero-media").waitFor({ state: "detached" });
      await page.goBack();
      await page.waitForFunction((y) => Math.abs(window.scrollY - y) <= 2, departureY);
      await assertReturn("back-hero-offscreen", previousVideo, null);
      await page.mouse.wheel(0, -100);
      await scrollHero(true);
      expectedLoads++;
      await waitForPlayback(true);
      await page.waitForLoadState("networkidle");
      assert.deepEqual(pathsOf(requests).filter((path) => /\.(webm|mp4)$/i.test(path)),
        Array(expectedLoads).fill(selected), `${label}: offscreen Back recovery fetched an unexpected rendition`);
      await assertNoArtwork(page, requests, `${label}/back-recovered`);
      assert.deepEqual(errors, [], `${label}: browser errors`);
      await writeFile(resolve(outputDir, `${label}-network.json`), JSON.stringify({ phases, errors }, null, 2));
      process.stdout.write(`Passed ${label}: real playback, visibility gates, manual pause, retained mounted source and four same-document Back remounts (not BFCache or reload persistence).\n`);
    } catch (error) {
      await page.screenshot({ path: resolve(outputDir, `${label}-failure.png`) }).catch(() => {});
      await writeFile(resolve(outputDir, `${label}-requests.json`),
        JSON.stringify({ phases, requests, errors }, null, 2));
      throw error;
    } finally {
      await context.close();
    }
  }
  // Independent of visibility, reduced-motion and screenshot pause shims:
  // reject only the initial scripted play, then delegate to native playback.
  for (const testCase of fixedCases) {
    const label = `hero-comparison-${testCase.name}-autoplay-blocked`;
    const selected = testCase.mobile ? mediaPaths.mobile : mediaPaths.desktop;
    const context = await browser.newContext({
      viewport: testCase.viewport, colorScheme: "light", reducedMotion: "no-preference",
      deviceScaleFactor: 1, locale: "en-US", timezoneId: "Africa/Lagos",
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    const requests = [];
    const errors = [];
    const phases = [];
    page.on("request", (request) => requests.push(request.url()));
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await installFixtureRoutes(page, label);
      await page.addInitScript(() => {
        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem("soso-consent-v1", "essential_only");
        sessionStorage.setItem("soso-pwa-install-dismissed-v1", "yes");
        Object.defineProperty(navigator, "connection", {
          configurable: true,
          value: Object.assign(new EventTarget(), { saveData: false, effectiveType: "4g" }),
        });
        window.__heroPlayAttempts = [];
        window.__heroUnhandledRejections = [];
        window.__heroLoadEvents = [];
        window.addEventListener("unhandledrejection", (event) => {
          window.__heroUnhandledRejections.push(String(event.reason));
        });
        for (const type of ["loadstart", "emptied"]) {
          document.addEventListener(type, (event) => {
            if (event.target instanceof HTMLVideoElement) window.__heroLoadEvents.push(type);
          }, true);
        }
        let shopperClick;
        document.addEventListener("click", (event) => {
          if (event.target instanceof Element
            && event.target.closest('[data-testid="button-hero-motion"]') && event.isTrusted) {
            shopperClick = event;
          }
        }, true);
        const nativePlay = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function (...args) {
          if (this.dataset.testid !== "home-hero-video") return nativePlay.apply(this, args);
          const blocked = window.__heroPlayAttempts.length === 0;
          window.__heroPlayAttempts.push({
            blocked, shopperClick: !!shopperClick && shopperClick.eventPhase !== Event.NONE,
          });
          if (blocked) {
            // Native attribute-driven autoplay does not call the JS play method.
            // Disable that parallel path before rejecting the component's request
            // so the fixture cannot recover without the real shopper control.
            this.autoplay = false;
            return Promise.reject(new DOMException("Fixture blocked autoplay", "NotAllowedError"));
          }
          return nativePlay.apply(this, args);
        };
      });
      await page.goto(origin, { waitUntil: "networkidle" });
      await page.waitForFunction(() => {
        const video = document.querySelector('[data-testid="home-hero-video"]');
        const media = document.querySelector('[data-testid="home-hero-media"]');
        return window.__heroPlayAttempts.length > 0 && video?.readyState >= 2
          && video.paused && media?.dataset.playbackState === "paused";
      });
      const video = await page.getByTestId("home-hero-video").elementHandle();
      assert.ok(video, `${label}: blocked autoplay removed the video`);
      const control = page.getByTestId("button-hero-motion");
      const assertControl = async (playing) => {
        assert.equal(await control.getAttribute("aria-label"),
          playing ? fixture.content.homepage.hero.pauseLabel : fixture.content.homepage.hero.playLabel,
          `${label}: control must describe the actual playback state`);
        assert.equal(await control.getAttribute("aria-pressed"), String(playing),
          `${label}: control pressed state disagrees with playback`);
        assert.ok(await control.isVisible() && await control.isEnabled(),
          `${label}: playback control is not usable`);
      };
      const assertSource = async (phase) => {
        await page.waitForLoadState("networkidle");
        assert.ok(await video.evaluate((element) =>
          element.isConnected && element === document.querySelector('[data-testid="home-hero-video"]')),
        `${label}/${phase}: recovery replaced the video`);
        assert.equal(await video.evaluate((element) => new URL(element.currentSrc).pathname), selected,
          `${label}/${phase}: wrong rendition`);
        assert.equal(await video.evaluate((element) => element.poster), "",
          `${label}/${phase}: unrelated poster`);
        assert.deepEqual(await page.evaluate(() => window.__heroLoadEvents), ["loadstart"],
          `${label}/${phase}: video was reloaded`);
        // Do not deduplicate: another download of the SAME rendition must fail.
        assert.deepEqual(pathsOf(requests).filter((path) => /\.(webm|mp4)$/i.test(path)), [selected],
          `${label}/${phase}: repeated or unexpected rendition download`);
        await assertNoArtwork(page, requests, `${label}/${phase}`);
        assert.deepEqual(await page.evaluate(() => window.__heroUnhandledRejections), [],
          `${label}/${phase}: unhandled play rejection`);
        assert.deepEqual(errors, [], `${label}/${phase}: browser errors`);
        phases.push({ phase, requests: [...requests],
          attempts: await page.evaluate(() => [...window.__heroPlayAttempts]) });
      };
      await assertControl(false);
      await assertSource("autoplay-denied");
      assert.deepEqual(await page.evaluate(() => window.__heroPlayAttempts),
        [{ blocked: true, shopperClick: false }], `${label}: expected one automatic play rejection`);
      const pausedTime = await video.evaluate((element) => element.currentTime);
      await page.waitForTimeout(200);
      assert.equal(await video.evaluate((element) => element.currentTime), pausedTime,
        `${label}: denied autoplay advanced footage before a shopper click`);

      await control.click();
      await page.waitForFunction(() => {
        const video = document.querySelector('[data-testid="home-hero-video"]');
        return video && !video.paused
          && document.querySelector('[data-testid="home-hero-media"]')?.dataset.playbackState === "playing";
      });
      const playingTime = await video.evaluate((element) => element.currentTime);
      await page.waitForFunction((previous) => {
        const video = document.querySelector('[data-testid="home-hero-video"]');
        return video && !video.paused && video.currentTime !== previous;
      }, playingTime);
      await assertControl(true);
      await assertSource("shopper-play-recovered");
      assert.deepEqual(await page.evaluate(() => window.__heroPlayAttempts),
        [{ blocked: true, shopperClick: false }, { blocked: false, shopperClick: true }],
        `${label}: recovery must come from the explicit shopper click`);
      await writeFile(resolve(outputDir, `${label}-network.json`), JSON.stringify({ phases, errors }, null, 2));
      process.stdout.write(`Passed ${label}: denied autoplay, accurate control, native manual recovery and single rendition request.\n`);
    } catch (error) {
      await page.screenshot({ path: resolve(outputDir, `${label}-failure.png`) }).catch(() => {});
      const diagnostics = await page.evaluate(() => ({
        attempts: window.__heroPlayAttempts, unhandledRejections: window.__heroUnhandledRejections,
        loads: window.__heroLoadEvents,
      })).catch(() => ({}));
      await writeFile(resolve(outputDir, `${label}-requests.json`),
        JSON.stringify({ phases, requests, errors, ...diagnostics }, null, 2));
      throw error;
    } finally {
      await context.close();
    }
  }
  return {
    cases: caseCount + fixedCases.length * 2, baselines: fixedCases.length,
    rotations: rotationCount, motionChanges,
  };
}
