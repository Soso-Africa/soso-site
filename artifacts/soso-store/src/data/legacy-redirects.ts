export type LegacyRedirect = {
  fromPath: string;
  toPath: string;
  statusCode: 301;
};

/** Valuable live legacy URLs only. Obsolete WordPress utilities are intentionally absent. */
export const legacyRedirects: LegacyRedirect[] = [
  { fromPath: "/my-account/", toPath: "/sign-in", statusCode: 301 },
  { fromPath: "/checkout/", toPath: "/checkout", statusCode: 301 },
  { fromPath: "/cart/", toPath: "/?cart=open", statusCode: 301 },
  { fromPath: "/privacy-policy-2/", toPath: "/privacy", statusCode: 301 },
  { fromPath: "/reviews/", toPath: "/about#reviews", statusCode: 301 },
  { fromPath: "/post-reviews/", toPath: "/about#reviews", statusCode: 301 },
  { fromPath: "/newarrivals/", toPath: "/shop?sort=newest", statusCode: 301 },
  { fromPath: "/blog/", toPath: "/journal", statusCode: 301 },
  { fromPath: "/track-orders/", toPath: "/delivery-returns#track-order", statusCode: 301 },
  { fromPath: "/track-your-order/", toPath: "/delivery-returns#track-order", statusCode: 301 },
  { fromPath: "/guest-track-order-form/", toPath: "/delivery-returns#track-order", statusCode: 301 },
  { fromPath: "/track-fedex-order/", toPath: "/delivery-returns#track-order", statusCode: 301 },
  { fromPath: "/our-story/", toPath: "/about/our-story", statusCode: 301 },
  { fromPath: "/the-architect-of-the-modern-man/", toPath: "/about/the-architect-of-the-modern-man", statusCode: 301 },
  { fromPath: "/the-client/", toPath: "/about/the-client", statusCode: 301 },
  { fromPath: "/craftsmanship/", toPath: "/about/craftsmanship", statusCode: 301 },
  { fromPath: "/about-soso-legacy-vision/", toPath: "/about/legacy-vision", statusCode: 301 },
  { fromPath: "/about-soso-the-soso-foundation/", toPath: "/about/soso-foundation", statusCode: 301 },
  { fromPath: "/partner-with-us/", toPath: "/about/partner-with-us", statusCode: 301 },
  { fromPath: "/danshiki/", toPath: "/collections/dashikis", statusCode: 301 },
  { fromPath: "/product-category/kaftans/", toPath: "/collections/kaftans", statusCode: 301 },
  { fromPath: "/product-category/agbada/", toPath: "/collections/agbadas", statusCode: 301 },
  { fromPath: "/product-category/cufflinks/", toPath: "/shop?search=cufflinks", statusCode: 301 },
  { fromPath: "/product-category/danshiki/", toPath: "/collections/dashikis", statusCode: 301 },
  { fromPath: "/product-category/kigali-2025/", toPath: "/shop?search=Kigali", statusCode: 301 },
  { fromPath: "/product-category/koles-collection/", toPath: "/shop?search=Koles", statusCode: 301 },
  { fromPath: "/product-category/pants/", toPath: "/shop?search=pants", statusCode: 301 },
  { fromPath: "/product-category/shirts/", toPath: "/collections/shirts", statusCode: 301 },
  { fromPath: "/product-category/ss26-27/", toPath: "/shop?search=SS26", statusCode: 301 },
  { fromPath: "/product-category/two-piece/", toPath: "/collections/two-piece", statusCode: 301 },
  { fromPath: "/product-category/women/", toPath: "/collections/women-ready-to-wear", statusCode: 301 },
  { fromPath: "/2025/10/24/abuja-mens-fashion-koles-collection-soso-africa-nigerian-designer-menswear-african-fashion-brands-modern-kaftan-abuja-style-mens-traditional-wear-nigeria/", toPath: "/journal/abuja-man-koles-collection", statusCode: 301 },
  { fromPath: "/2025/11/01/kaftan-style-for-men-modern-designs-abuja/", toPath: "/journal/modern-kaftan-styles-men-abuja", statusCode: 301 },
  { fromPath: "/2025/11/07/the-rise-of-the-abuja-gentleman-how-native-wear-became-everyday-luxury/", toPath: "/journal/rise-abuja-gentleman-native-wear", statusCode: 301 },
  { fromPath: "/2025/11/14/danshiki-for-the-modern-african-man/", toPath: "/journal/dashiki-modern-african-man", statusCode: 301 },
  { fromPath: "/2025/11/21/how-the-abuja-man-is-redefining-native-wear/", toPath: "/journal/abuja-man-redefining-native-wear", statusCode: 301 },
  { fromPath: "/2025/11/29/the-grey-italian-wool-kaftan-refined-northern-elegance-for-the-modern-abuja-man/", toPath: "/journal/grey-italian-wool-kaftan", statusCode: 301 },
  { fromPath: "/2025/10/17/into-the-process-sosos-latest-traditional-mens-wear-clothing-collection/", toPath: "/journal/into-the-process-koles-collection", statusCode: 301 },
  { fromPath: "/2025/12/06/abuja-modern-mens-fashion-hub/", toPath: "/journal/abuja-modern-menswear-hub", statusCode: 301 },
  { fromPath: "/2025/12/20/the-d-o-capsule/", toPath: "/journal/the-d-o-capsule", statusCode: 301 },
  { fromPath: "/2026/04/29/soso-spring-summer-2026-2027-african-modern-kaftan-collection/", toPath: "/journal/spring-summer-african-modern-kaftan-collection", statusCode: 301 },
  { fromPath: "/2026/05/12/modern-kaftans-beyond-traditional-wear/", toPath: "/journal/modern-kaftans-beyond-traditional-wear", statusCode: 301 },
  { fromPath: "/2026/05/14/modern-mens-two-piece-sets/", toPath: "/journal/modern-mens-two-piece-sets", statusCode: 301 },
  { fromPath: "/2026/05/29/the-rise-of-minimalist-african-luxury-fashion/", toPath: "/journal/minimalist-african-luxury-fashion", statusCode: 301 },
  { fromPath: "/2026/06/08/how-to-style-black-traditional-outfits-for-modern-occasions/", toPath: "/journal/style-black-traditional-outfits-modern-occasions", statusCode: 301 },
];

export const legacyRedirectByPath = new Map(legacyRedirects.map((redirect) => [redirect.fromPath, redirect]));