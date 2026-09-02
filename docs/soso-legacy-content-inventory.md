# SOSO legacy content migration inventory

Audit date: **31 August 2026**  
Sources: live `page-sitemap.xml`, `post-sitemap.xml`, and WordPress REST page/post records at `https://shopsoso.co`.

## Audit summary

- 27 page-sitemap entries reviewed.
- 14 published journal articles preserved.
- 7 About/brand destination pages preserved.
- WordPress samples, duplicate shop tests, plugin/account utilities, wishlist and payment-success utility pages were not copied.
- The machine-readable register, including dates, media, SEO metadata, status, and structured-data decisions, is `legacy-content-inventory.json`.
- Migrated copy requires editorial approval before indexing; no claims have been expanded beyond the source.

## Redirect register

| Legacy URL | New route / decision | Status |
|---|---|---|
| https://shopsoso.co/ | / | 301-required |
| https://shopsoso.co/sample-page/ | Retire; no content copy | 410-retire |
| https://shopsoso.co/my-account/ | /sign-in | 301-required |
| https://shopsoso.co/privacy-policy-2/ | /privacy | 301-required |
| https://shopsoso.co/barter/ | Retire; no content copy | 410-retire |
| https://shopsoso.co/wishlist/ | Retire; no content copy | 410-retire |
| https://shopsoso.co/checkout/ | /checkout | 301-required |
| https://shopsoso.co/shop1111/ | Retire; no content copy | 410-retire |
| https://shopsoso.co/shop11111/ | Retire; no content copy | 410-retire |
| https://shopsoso.co/shopsoso/ | Retire; no content copy | 410-retire |
| https://shopsoso.co/reviews/ | /about#reviews | 301-required |
| https://shopsoso.co/success/ | Retire; no content copy | 410-retire |
| https://shopsoso.co/post-reviews/ | /about#reviews | 301-required |
| https://shopsoso.co/newarrivals/ | /shop?sort=newest | 301-required |
| https://shopsoso.co/cart/ | /?cart=open | 301-required |
| https://shopsoso.co/blog/ | /journal | 301-required |
| https://shopsoso.co/track-orders/ | /delivery-returns#track-order | 301-required |
| https://shopsoso.co/track-your-order/ | /delivery-returns#track-order | 301-required |
| https://shopsoso.co/guest-track-order-form/ | /delivery-returns#track-order | 301-required |
| https://shopsoso.co/track-fedex-order/ | /delivery-returns#track-order | 301-required |
| https://shopsoso.co/our-story/ | /about/our-story | 301-required |
| https://shopsoso.co/the-client/ | /about/the-client | 301-required |
| https://shopsoso.co/about-soso-the-soso-foundation/ | /about/soso-foundation | 301-required |
| https://shopsoso.co/craftsmanship/ | /about/craftsmanship | 301-required |
| https://shopsoso.co/about-soso-legacy-vision/ | /about/legacy-vision | 301-required |
| https://shopsoso.co/partner-with-us/ | /about/partner-with-us | 301-required |
| https://shopsoso.co/the-architect-of-the-modern-man/ | /about/the-architect-of-the-modern-man | 301-required |
| https://shopsoso.co/2025/10/24/abuja-mens-fashion-koles-collection-soso-africa-nigerian-designer-menswear-african-fashion-brands-modern-kaftan-abuja-style-mens-traditional-wear-nigeria/ | /journal/abuja-man-koles-collection | 301-required |
| https://shopsoso.co/2025/11/01/kaftan-style-for-men-modern-designs-abuja/ | /journal/modern-kaftan-styles-men-abuja | 301-required |
| https://shopsoso.co/2025/11/07/the-rise-of-the-abuja-gentleman-how-native-wear-became-everyday-luxury/ | /journal/rise-abuja-gentleman-native-wear | 301-required |
| https://shopsoso.co/2025/11/14/danshiki-for-the-modern-african-man/ | /journal/dashiki-modern-african-man | 301-required |
| https://shopsoso.co/2025/11/21/how-the-abuja-man-is-redefining-native-wear/ | /journal/abuja-man-redefining-native-wear | 301-required |
| https://shopsoso.co/2025/11/29/the-grey-italian-wool-kaftan-refined-northern-elegance-for-the-modern-abuja-man/ | /journal/grey-italian-wool-kaftan | 301-required |
| https://shopsoso.co/2025/10/17/into-the-process-sosos-latest-traditional-mens-wear-clothing-collection/ | /journal/into-the-process-koles-collection | 301-required |
| https://shopsoso.co/2025/12/06/abuja-modern-mens-fashion-hub/ | /journal/abuja-modern-menswear-hub | 301-required |
| https://shopsoso.co/2025/12/20/the-d-o-capsule/ | /journal/the-d-o-capsule | 301-required |
| https://shopsoso.co/2026/04/29/soso-spring-summer-2026-2027-african-modern-kaftan-collection/ | /journal/spring-summer-african-modern-kaftan-collection | 301-required |
| https://shopsoso.co/2026/05/12/modern-kaftans-beyond-traditional-wear/ | /journal/modern-kaftans-beyond-traditional-wear | 301-required |
| https://shopsoso.co/2026/05/14/modern-mens-two-piece-sets/ | /journal/modern-mens-two-piece-sets | 301-required |
| https://shopsoso.co/2026/05/29/the-rise-of-minimalist-african-luxury-fashion/ | /journal/minimalist-african-luxury-fashion | 301-required |
| https://shopsoso.co/2026/06/08/how-to-style-black-traditional-outfits-for-modern-occasions/ | /journal/style-black-traditional-outfits-modern-occasions | 301-required |
| https://shopsoso.co/danshiki/ | /collections/dashikis | 301-required |

## Integration gate

The local content module and routes are now integrated:

- `/about/:slug` → `LegacyAboutPage`
- Journal listing/detail merge `legacyJournalPosts` as the archival fallback while keeping a matching CMS record authoritative.

The approved redirect rows are bundled, seeded idempotently into the redirect store, and served by the real HTTP 301 endpoint through the Vercel rewrite rules. Development HTTP checks verified representative About and `danshiki` redirects. Production population and a complete production-domain redirect crawl remain required after deployment; client routing alone is not treated as evidence.

The remaining launch gates are external: editorial/legal approval of preserved claims, rights and durable hosting for remote legacy media, final live-sitemap reconciliation, approved production-domain cutover, and Search Console/indexing verification.
