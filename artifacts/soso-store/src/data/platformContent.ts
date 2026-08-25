import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { createElement } from "react";

export type SeoCopy = { title: string; description: string };
export type ContentLink = { label: string; href: string; external?: boolean };
export type ProductDepartment = "men" | "women" | "accessories";
export type MegaMenuGroup = {
  id: string;
  label: string;
  href: string;
  department?: ProductDepartment;
  visible: boolean;
  columns: { heading: string; links: ContentLink[] }[];
  featuredProductSlugs: string[];
};
export type CatalogProduct = {
  slug: string;
  name: string;
  img: string;
  images?: {
    src: string;
    alt: string;
    provenance: { source: string; rights: string; credit?: string; sourceUrl?: string };
  }[];
  price: number;
  tag: string;
  note: string;
  category: string;
  department: ProductDepartment;
  description: string;
  sizes: string[];
  featured?: boolean;
  relatedProductSlugs?: string[];
  commerceProductId?: string;
  commerceVariantIds?: Record<string, string>;
  colour: string;
  fabric: string;
  fit: string;
  searchableTerms: string[];
  merchandising: { isNew: boolean; label?: string; sortPriority: number };
  standardEligible: boolean;
  customEligible: boolean;
  standardSizes: string[];
  readyNowSizes: string[];
  fulfilmentState: "ready_now" | "made_immediately" | "unavailable";
  dispatchMessage: string;
  unavailableMessage?: string;
  composition?: string;
  care?: string;
  delivery?: string;
  returns?: string;
};
export type PlatformCollection = {
  slug: string;
  label: string;
  category: string;
  department: ProductDepartment;
  h1: string;
  intro: string;
  seo: SeoCopy;
};
export type FaqItem = { id: string; category: string; question: string; answer: string };
export type CopyItem = { title: string; body: string; imageUrl?: string; href?: string; linkLabel?: string };
export type PlatformContent = {
  site: {
    name: string;
    logoUrl: string;
    logoAlt: string;
    announcement: string;
    skipLinkLabel: string;
    contactEmail: string;
    contactPhone: string;
    instagramUrl: string;
    whatsappUrl: string;
    navigation: ContentLink[];
    mobileNavigation: ContentLink[];
    megaMenu: MegaMenuGroup[];
    platformState: { loadingMessage: string; unavailableMessage: string };
    header: {
      openMenuLabel: string; closeMenuLabel: string; mainNavigationLabel: string; whatsappLabel: string;
      cartLabel: string; openCartLabel: string; mobileWhatsappLabel: string;
      searchLabel: string; searchPlaceholder: string; closeSearchLabel: string; searchSuggestionsLabel: string;
      searchSuggestions: { label: string; href: string }[];
    };
    cart: { title: string; closeLabel: string; emptyMessage: string; continueShoppingLabel: string; sizeLabel: string; removeLabel: string; subtotalLabel: string; helpText: string; checkoutCta: ContentLink; stylistCta: ContentLink };
    floatingCta: ContentLink;
    consent: { regionLabel: string; title: string; body: string; essentialLabel: string; analyticsLabel: string; marketingLabel: string; manageLabel: string; necessaryDescription: string; measurementDescription: string; marketingDescription: string; footerText: string; privacyLink: ContentLink };
    footer: {
      description: string;
      columns: { heading: string; links: ContentLink[] }[];
      legalLinks: ContentLink[];
      copyright: string;
      checkoutNote: string;
      instagramLabel: string; instagramAriaLabel: string; cookieChoicesLabel: string;
    };
  };
  homepage: {
    seo: SeoCopy;
    hero: {
      eyebrow: string; title: string; accent: string; suffix: string; description: string;
      mediaMode: "image" | "video";
      imageUrl: string; mobileImageUrl: string; imageAlt: string;
      videoUrl?: string; mobileVideoUrl?: string; playLabel: string; pauseLabel: string;
      primaryCta: ContentLink; stylistCtaLabel: string;
      assurances: string[];
    };
    trustItems: CopyItem[];
    featured: { eyebrow: string; title: string; link: ContentLink; productSlugs: string[] };
    occasions: { eyebrow: string; title: string; items: CopyItem[] };
    fit: { eyebrow: string; title: string; imageUrl: string; imageAlt: string; steps: CopyItem[]; ctaLabel: string };
    confidence: { eyebrow: string; title: string; items: CopyItem[]; marquee: string[] };
    story: { imageUrl: string; logoUrl: string; title: string; body: string; link: ContentLink };
    finalCta: { eyebrow: string; title: string; body: string; primaryCta: ContentLink; stylistCtaLabel: string; note: string };
  };
  pages: {
    shop: {
      seo: SeoCopy; eyebrow: string; title: string; intro: string; allFilterLabel: string;
      emptyMessage: string; productCtaLabel: string; collectionNotFoundTitle: string;
      collectionNotFoundCta: ContentLink; collectionEmptyMessage: string; allCollectionsLabel: string;
      searchLabel: string; searchPlaceholder: string; noSearchResultsMessage: string;
      newLabel: string; readyNowLabel: string; madeImmediatelyLabel: string; unavailableLabel: string;
      departments: Record<ProductDepartment, { seo: SeoCopy; eyebrow: string; title: string; intro: string }>;
    };
    faq: {
      seo: SeoCopy; eyebrow: string; title: string; intro: string; helpText: string; listAriaLabel: string;
      allFilterLabel: string; shopCta: ContentLink; policiesCta: ContentLink;
      items?: FaqItem[];
    };
    about: {
      seo: SeoCopy;
      hero: { eyebrow: string; title: string; body: string };
      whatWeMake: { heading: string; paragraphs: string[] };
      howItWorks: { heading: string; steps: string[] };
      location: { heading: string; columns: string[][] };
      primaryCta: ContentLink;
      secondaryCta: ContentLink;
      stylistCtaLabel: string;
    };
    journal: { seo: SeoCopy; heading: string; intro: string; loadingMessage: string; errorMessage: string; emptyMessage: string; fallbackMark: string; readCtaLabel: string; loadingSeo: SeoCopy; notFoundSeo: SeoCopy; notFoundTitle: string; notFoundMessage: string; backCta: ContentLink; updatedLabel: string; byLabel: string; writtenByLabel: string; shareLabel: string; copiedLabel: string; relatedProductsHeading: string; relatedArticlesHeading: string };
    policies: {
      seo: SeoCopy; eyebrow: string; title: string; intro: string;
      cardLabel: string; openLabel: string; emptyMessage: string;
      loadingMessage: string; unavailableMessage: string; approvedLabel: string; effectiveMessage: string;
      privacyRequest: { eyebrow: string; title: string; body: string; acceptedMessage: string; anotherLabel: string; requestTypeLabel: string; accessLabel: string; deletionLabel: string; emailLabel: string; nameLabel: string; optionalLabel: string; submitLabel: string; submittingLabel: string; invalidEmailMessage: string; submitError: string };
    };
    checkout: { seo: SeoCopy; backCta: ContentLink; eyebrow: string; title: string; intro: string; emptyMessage: string; emptyCta: ContentLink; nameLabel: string; phoneLabel: string; emailLabel: string; addressLabel: string; notesLabel: string; optionalLabel: string; deliveryNote: string; paymentUnavailableMessage: string; retryLabel: string; returnToBagLabel: string; processingLabel: string; paymentLabel: string; secureNote: string; legalLinks: ContentLink[]; stylistLabel: string; bagTitle: string; sizeQuantityLabel: string; subtotalLabel: string; stylistCtaLabel: string };
    paymentReturn: { seo: SeoCopy; eyebrow: string; missingAttemptMessage: string; statusUnavailableMessage: string; paidTitle: string; cancelledTitle: string; pendingTitle: string; paidBody: string; cancelledBody: string; pendingBody: string; orderReferenceLabel: string; authoritativeTotalLabel: string; errorSuffix: string; pendingNotice: string; retryHelp: string; reviewLabel: string; sizeLabel: string; quantityLabel: string; returnBagCta: ContentLink; continueCta: ContentLink; retryCta: ContentLink; returnCheckoutCta: ContentLink };
    notFound: { seo: SeoCopy; title: string; body: string; cta: ContentLink };
  };
  products: CatalogProduct[];
  collections: PlatformCollection[];
  sizeGuide: {
    title: string; intro: string; columns: string[];
    rows: { size: string; values: string[] }[];
    customHelp: string;
  };
  productCopy: {
    seoTitleSuffix: string;
    seoDescriptionSuffix: string;
    categorySuffix: string;
    detailImageAltSuffix: string;
    sizeGuideCloseLabel: string;
    madeToOrderLabel: string;
    sizeSelectorLabel: string;
    sizePrompt: string;
    customSizeHelp: string;
    standardSizeHelp: string;
    colourLabel: string;
    fabricLabel: string;
    fitLabel: string;
    readyNowLabel: string;
    madeImmediatelyLabel: string;
    unavailableLabel: string;
    dispatchLabel: string;
    dispatchNotDeliveryMessage: string;
    standardUnavailableMessage: string;
    customUnavailableMessage: string;
    sizeRequiredLabel: string;
    mobileSizeRequiredLabel: string;
    addToBagLabel: string;
    trustItems: CopyItem[];
    marqueeText: string;
    marqueeSymbol: string;
    detailsEyebrow: string;
    detailsHeading: string;
    details: CopyItem[];
    assurancesEyebrow: string;
    assurancesHeading: string;
    assurances: CopyItem[];
    relatedHeading: string;
    fitAssistant: {
      title: string; intro: string; heightLabel: string; weightLabel: string; chestLabel: string;
      preferredFitLabel: string; preferredFitPlaceholder: string;
      preferredFitOptions: { value: string; label: string }[];
      occasionLabel: string; occasionPlaceholder: string; submitLabel: string; submittedMessage: string;
    };
  };
  supportCopy: {
    stylistLabel: string; stylistHelp: string; productCtaLabel: string;
    productHelp: string; productDetailsCtaLabel: string; fitCtaLabel: string;
    stylistDialog: {
      eyebrow: string; title: string; productPrompt: string; generalPrompt: string;
      checkoutReassurance: string; closeLabel: string; successTitle: string; successBody: string;
      backLabel: string; nameLabel: string; phoneLabel: string; emailLabel: string;
      optionalLabel: string; questionLabel: string; questionPlaceholder: string;
      submitLabel: string; pendingLabel: string; failureMessage: string;
    };
  };
};

export type PublishedPlatformContent = { content: PlatformContent; publishedAt: string };

export const platformContentQueryKey = ["platform-content"] as const;

export function usePlatformContent() {
  return useQuery<PublishedPlatformContent>({
    queryKey: platformContentQueryKey,
    queryFn: () => customFetch("/api/content/platform", { responseType: "json" }),
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: true,
  });
}

export function PlatformContentState({
  loading,
  error,
  copy,
}: {
  loading: boolean;
  error?: boolean;
  copy?: PlatformContent["site"]["platformState"];
}) {
  const message = copy ? (loading ? copy.loadingMessage : copy.unavailableMessage) : null;
  return createElement("main", {
    "aria-busy": loading || undefined,
    className: "flex min-h-[65vh] items-center justify-center px-6 text-center",
  }, message
    ? createElement("p", {
        role: error ? "alert" : "status",
        className: "max-w-lg text-sm leading-relaxed text-muted-foreground",
      }, message)
    : createElement("div", {
        role: error ? "alert" : "status",
        "aria-live": "polite",
        className: loading ? "h-6 w-6 animate-pulse rounded-full bg-muted" : "h-6 w-6",
      }));
}