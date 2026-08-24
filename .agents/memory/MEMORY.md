- [Conversion review evidence](conversion-review-evidence.md) — distinguish absent content from content that exists but is buried or poorly connected to the purchase decision.
- [Payment-first bespoke checkout](payment-first-bespoke-checkout.md) — shoppers pay first; atelier production confirmation follows, with stylist help kept optional.
- [JusticeSure v1 activation gate](justicesure-v1-activation-gate.md) — keep Commerce fail-closed until its staged runtime, credentials, webhook, catalogue, and return flow pass acceptance together.
- [OpenAPI Zod format compatibility](openapi-zod-format-compatibility.md) — avoid unsupported generated format helpers until the workspace toolchain is upgraded together.
- [Launch SEO safety gates](soso-launch-seo-gates.md) — direct responses stay private unless approved domain, route category, and editorial metadata are explicitly supplied.
- [Lib package build order](lib-package-build-order.md) — after changing lib/db or lib/api-client-react schemas/exports, build those packages before typechecking consumers.
- [Generated-client HMR refresh](generated-client-hmr-refresh.md) — Orval temporarily replaces generated source files; restart the storefront after generation before treating Vite import errors as app failures.
- [Consented first-touch attribution](consented-first-touch-attribution.md) — hold landing UTM values in memory until measurement consent, then retain first touch for the session.
- [Consent-aware event lifecycle](consent-aware-event-lifecycle.md) — key page views to the affirmative-consent grant and pathname, and retain a memory fallback when browser session storage is unavailable.
- [Controlled privacy access packages](controlled-privacy-access-packages.md) — verified requests get a bounded, short-lived one-time export; deletion stays blocked without approved rules.
- [Shared storefront analytics paths](shared-storefront-analytics-paths.md) — keep public-route validation as one deny-list policy usable by both JavaScript ingestion and PostgreSQL staff checks.
- [API Zod library rebuild](api-zod-library-rebuild.md) — rebuild composite library declarations with the root TypeScript project command before checking API consumers.
<<<<<<< HEAD
- [Empty GitHub repository publishing](empty-github-repository-publishing.md) — bootstrap an empty repository through Contents before creating a full Git-data commit.
- [Production serverless bundle checks](production-serverless-bundle-checks.md) — bundle Express handlers in production mode when development-only logging transports use runtime module resolution.
- [External Vercel preview verification](external-vercel-preview-verification.md) — validate Clerk proxy attribution and every required schema table on the actual Vercel preview, not only local.
=======
>>>>>>> github/main
