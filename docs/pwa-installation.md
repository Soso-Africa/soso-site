# SOSO installable web app

This guide describes SOSO installation behavior and browser limitations.

- HTTPS production builds advertise a standalone app with the existing blue SOSO brand icon, 192px and maskable 512px icons, and iPad/iPhone touch-icon metadata.
- Desktop Chrome/Edge and Android support installation where the browser offers it. The footer uses a native installation prompt when available, plus accessible manual instructions.
- iPhone/iPad users open the site in Safari and choose Share → Add to Home Screen. Mac Safari offers File → Add to Dock. Installation is browser-controlled, not guaranteed in every browser or embedded preview.
- Public browsing automatically shows a dismissible install popup after a short delay, without requiring a footer visit. On iPhone/iPad (including iPadOS desktop-style user agents), it explains Safari Share → Add to Home Screen; supported browsers can open their native prompt from a user click.
- Privacy choices and existing dialogs take precedence. The popup does not interrupt checkout, payment return, Staff, authentication or privacy/legal pages. Dismissal lasts for the browser session, with an in-memory fallback if storage is unavailable; footer help remains available.
- Installed standalone/fullscreen mode, iOS `navigator.standalone`, and observed `appinstalled` events hide installation help. Safari cannot reliably detect an app installed elsewhere from a normal browser tab. No permanent claim of installation is inferred from a dismissed popup or an accepted prompt alone.
- Browser installation events are captured during startup, before potentially slow catalogue requests mount the footer.
- Shopping requires an internet connection. Offline launch shows a generic reconnect notice, not stale catalogue prices, stock, account information or payment success.
- The service worker caches only the generic offline notice and the two app icons. It never caches HTML pages, API responses, media, cart contents, checkout, payment or Staff data. This prevents stale purchase decisions and private information remaining accessible after sign-out.
- A new worker does not force an update or reload during checkout. New navigation always requests current page HTML.
- Development does not register a worker, avoiding interference with development previews. Test the production build over HTTPS or localhost.
- When changing offline assets, also bump the worker cache version. Activation removes only previous SOSO caches for the same app scope.

## Release safety

Publish a PWA-only release from current GitHub production main. Do not publish the workspace wholesale: its separate domestic-delivery draft remains unreleased. Include the manifest, icons, worker, offline notice, metadata/bootstrap, install UI, Vercel static-file headers and reviewed visual baselines.
