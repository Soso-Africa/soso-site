import { createHash } from "node:crypto";
import { auditLogsTable, db, faqItemsTable, siteContentRevisionsTable, siteContentTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160);
const localPath = z.string().startsWith("/").max(512).refine((value) => !value.startsWith("//"));
const governedColourAssetPath = z.string().max(512).refine(
  (value) => (
    /^\/images\/soso\/[^?#]*\.(?:jpe?g|png|webp)$/i.test(value)
    || /^\/api\/storage\/objects\/uploads\/[^?#]*\.(?:jpe?g|png|webp)$/i.test(value)
  ) && !value.includes("..") && !value.includes("\\") && !value.includes("//"),
  "Colour assets must use a governed local SOSO image or media path",
);
const colourHex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Colour must use #RRGGBB");
const colourOption = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(1).max(64),
  label: z.string().trim().min(1).max(80),
  hex: colourHex,
  previewImageSrc: governedColourAssetPath.optional(),
}).strict();
const garmentMaskPath = z.string().max(512).refine(
  (value) => (
    /^\/images\/soso\/[^?#]*\.png$/i.test(value)
    || /^\/api\/storage\/objects\/uploads\/[^?#]*\.png$/i.test(value)
  ) && !value.includes("..") && !value.includes("\\") && !value.includes("//"),
  "Garment masks must be governed transparent PNG images",
);
const href = z.string().max(1024).refine((value) => {
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}, "Must be an internal path or HTTPS URL");
const httpsUrl = z.string().max(1024).refine((value) => {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}, "Must be an HTTPS URL");
const optionalHttpsUrl = z.union([z.literal(""), httpsUrl]);
const copy = z.string().max(10_000);
const interfaceLabel = z.string().trim().min(1).max(300);
const contactPhone = z.string().max(40).refine(
  (value) => value === "" || (/^\+?[0-9().\s-]{7,40}$/.test(value) && (value.match(/\d/g)?.length ?? 0) >= 7),
  "Contact phone must contain at least seven digits and use standard phone punctuation",
);
const measurementRangeErrorTemplate = interfaceLabel.refine(
  (value) => ["{label}", "{min}", "{max}", "{unit}"].every((token) => value.includes(token)),
  "Measurement range error template must include {label}, {min}, {max}, and {unit}",
);
const seo = z.object({ title: z.string().min(1).max(160), description: z.string().min(1).max(320) }).strict();
const link = z.object({ label: z.string().min(1).max(120), href, external: z.boolean().optional() }).strict();
const copyItem = z.object({
  title: copy, body: copy, imageUrl: localPath.optional(), href: localPath.optional(), linkLabel: copy.optional(),
}).strict();
const homepageCategoryTile = z.object({
  eyebrow: copy.min(1),
  title: copy.min(1),
  description: z.string().trim().min(1).max(320),
  imageUrl: localPath,
  imageUrls: z.array(localPath).max(4).optional(),
  mobileImageUrls: z.array(localPath).max(4).optional(),
  imageAlt: z.string().trim().min(1).max(300),
  href,
  desktopCropPosition: z.string().regex(/^(?:left|center|right)(?: (?:top|center|bottom))?$/).optional(),
  mobileCropPosition: z.string().regex(/^(?:left|center|right)(?: (?:top|center|bottom))?$/).optional(),
  active: z.boolean().optional(),
  imageMode: z.enum(["static", "crossfade"]).optional(),
  rotationMs: z.number().int().min(3000).max(15000).optional(),
}).strict();
const homepageOccasion = z.object({
  title: copy.min(1),
  body: copy.min(1),
  imageUrl: localPath,
  imageAlt: z.string().trim().min(1).max(300),
  href,
  linkLabel: copy.min(1),
}).strict();
const imageProvenance = z.object({
  source: z.string().min(1).max(300),
  rights: z.string().min(1).max(500),
  credit: z.string().max(300).optional(),
  sourceUrl: href.optional(),
}).strict();
const image = z.object({
  src: localPath,
  alt: z.string().min(1).max(300),
  provenance: imageProvenance,
}).strict();
const materialTurnSet = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(1).max(64),
  label: z.string().trim().min(1).max(120),
  front: image,
  back: image,
}).strict();
const department = z.enum(["men", "women", "accessories"]);
const megaMenuGroup = z.object({
  id: slug,
  label: z.string().min(1).max(120),
  href: localPath,
  department: department.optional(),
  visible: z.boolean(),
  columns: z.array(z.object({
    heading: z.string().min(1).max(120),
    links: z.array(link).min(1).max(12),
  }).strict()).max(4),
  featuredProductSlugs: z.array(slug).max(2),
}).strict();
const searchSuggestion = z.object({
  label: z.string().min(1).max(120),
  href: localPath,
}).strict();
const heroImagePath = localPath.refine(
  (value) => /\.(?:jpe?g|png|webp)$/i.test(value),
  "Hero image must be a local static JPEG, PNG, or WebP asset",
);
const videoPath = localPath.refine(
  (value) => /\.(?:mp4|webm)$/i.test(value),
  "Hero video must be a local MP4 or WebM asset",
);
const homepageHero = z.object({
  eyebrow: copy, title: copy, accent: copy, suffix: copy, description: copy,
  mediaMode: z.enum(["image", "video"]),
  imageUrl: heroImagePath,
  mobileImageUrl: heroImagePath,
  imageAlt: z.string().min(1).max(300),
  videoUrl: videoPath.optional(),
  mobileVideoUrl: videoPath.optional(),
  playLabel: copy.min(1),
  pauseLabel: copy.min(1),
  primaryCta: link,
  campaignCta: z.object({
    enabled: z.boolean(), label: z.string().trim().min(1).max(120), href,
    startsAt: z.string().datetime(), endsAt: z.string().datetime(),
  }).strict().refine((campaign) => new Date(campaign.startsAt) < new Date(campaign.endsAt), {
    message: "Campaign CTA end must be after its start", path: ["endsAt"],
  }).optional(),
  stylistCtaLabel: copy,
  assurances: z.array(copy).min(1),
}).strict().superRefine((hero, ctx) => {
  if (hero.mediaMode === "video") {
    if (!hero.videoUrl) {
      ctx.addIssue({ code: "custom", message: "Video heroes require a desktop video", path: ["videoUrl"] });
    }
    if (!hero.mobileVideoUrl) {
      ctx.addIssue({ code: "custom", message: "Video heroes require a mobile video", path: ["mobileVideoUrl"] });
    }
    return;
  }
  if (hero.videoUrl !== undefined || hero.mobileVideoUrl !== undefined) {
    ctx.addIssue({
      code: "custom",
      message: "Image heroes must not include video assets; switch mediaMode to video first",
      path: ["mediaMode"],
    });
  }
});

export const PlatformContentSchema = z.object({
  contentVersion: z.number().int().positive(),
  site: z.object({
    name: copy, logoUrl: localPath, logoAlt: z.string().min(1), announcement: copy,
    announcementItems: z.array(z.string().trim().min(1).max(180)).max(8),
    hqAddress: z.string().trim().min(1).max(300),
    socialLinks: z.object({
      facebookUrl: optionalHttpsUrl,
      twitterUrl: optionalHttpsUrl,
      youtubeUrl: optionalHttpsUrl,
      tiktokUrl: optionalHttpsUrl,
      linkedinUrl: optionalHttpsUrl,
    }).strict(),
    skipLinkLabel: copy.min(1),
    contactEmail: z.union([z.literal(""), z.string().email()]), contactPhone,
    instagramUrl: href, whatsappUrl: href,
    navigation: z.array(link).min(1), mobileNavigation: z.array(link).min(1),
    megaMenu: z.array(megaMenuGroup).min(1).max(8),
    platformState: z.object({ loadingMessage: copy.min(1), unavailableMessage: copy.min(1) }).strict(),
    header: z.object({
      openMenuLabel: copy, closeMenuLabel: copy, mainNavigationLabel: copy, whatsappLabel: copy,
      cartLabel: copy, openCartLabel: copy, mobileWhatsappLabel: copy,
      searchLabel: copy.min(1), searchPlaceholder: copy.min(1), closeSearchLabel: copy.min(1),
      clearSearchLabel: interfaceLabel, searchSuggestionsLabel: copy.min(1), searchSuggestions: z.array(searchSuggestion),
    }).strict(),
    cart: z.object({ title: copy, closeLabel: copy, emptyMessage: copy, continueShoppingLabel: copy, sizeLabel: copy, removeLabel: copy, subtotalLabel: copy, helpText: copy, checkoutCta: link, stylistCta: link, changeSizeLabel: interfaceLabel, unavailableSizeSuffix: interfaceLabel, readyNowLabel: interfaceLabel, madeImmediatelyLabel: interfaceLabel, decreaseQuantityLabel: interfaceLabel, increaseQuantityLabel: interfaceLabel, quantityLabel: interfaceLabel }).strict(),
    floatingCta: link,
    consent: z.object({ regionLabel: copy, title: copy, body: copy, essentialLabel: copy, analyticsLabel: copy, marketingLabel: copy, manageLabel: copy, necessaryDescription: copy, measurementDescription: copy, marketingDescription: copy, footerText: copy, privacyLink: link }).strict(),
    footer: z.object({
      description: copy,
      columns: z.array(z.object({ heading: copy, links: z.array(link).min(1) }).strict()).min(1).max(4),
      legalLinks: z.array(link).min(1), copyright: copy, checkoutNote: copy, instagramLabel: copy, instagramAriaLabel: copy, cookieChoicesLabel: copy,
    }).strict(),
    structuredData: z.object({ organizationDescription: interfaceLabel, locality: interfaceLabel, country: interfaceLabel, countryCode: z.string().regex(/^[A-Z]{2}$/), websiteDescription: interfaceLabel }).strict(),
  }).strict(),
  homepage: z.object({
    seo,
    hero: homepageHero,
    trustItems: z.array(copyItem).min(1),
    categories: z.object({
      heading: copy.min(1), accessibleLabel: copy.min(1), ctaLabel: copy.min(1),
      items: z.array(homepageCategoryTile).length(5),
    }).strict(),
    newArrival: z.object({
      eyebrow: copy.min(1), title: copy.min(1), link, productSlug: slug,
      editorial: z.object({
        imageUrl: localPath, imageAlt: z.string().trim().min(1).max(300),
        eyebrow: copy.min(1), title: copy.min(1), body: copy.min(1), link,
      }).strict(),
    }).strict(),
    featured: z.object({
      eyebrow: copy, title: copy.min(1), link, productSlugs: z.array(slug).length(4),
      legacySparseCompatibility: z.literal(true).optional(),
    }).strict(),
    occasions: z.object({ eyebrow: copy, title: copy, items: z.array(homepageOccasion).length(2) }).strict(),
    fit: z.object({
      eyebrow: copy, title: copy, imageUrl: localPath, imageAlt: z.string().min(1),
      steps: z.array(copyItem).min(1), ctaLabel: copy,
    }).strict(),
    confidence: z.object({ eyebrow: copy, title: copy, items: z.array(copyItem).min(1), marquee: z.array(copy).min(1) }).strict(),
    story: z.object({ imageUrl: localPath, logoUrl: localPath, title: copy, body: copy, link }).strict(),
    finalCta: z.object({
      eyebrow: copy, title: copy, body: copy, primaryCta: link, stylistCtaLabel: copy, note: copy,
    }).strict(),
  }).strict(),
  pages: z.object({
    shop: z.object({
      seo, eyebrow: copy, title: copy, intro: copy, allFilterLabel: copy, emptyMessage: copy,
      productCtaLabel: copy, collectionNotFoundTitle: copy, collectionNotFoundCta: link,
      collectionEmptyMessage: copy, allCollectionsLabel: copy,
      searchLabel: copy.min(1), searchPlaceholder: copy.min(1), noSearchResultsMessage: copy.min(1),
      newLabel: copy.min(1), readyNowLabel: copy.min(1), madeImmediatelyLabel: copy.min(1),
      unavailableLabel: copy.min(1),
      departmentLabels: z.object({ men: interfaceLabel, women: interfaceLabel, accessories: interfaceLabel }).strict(),
      departmentsAriaLabel: interfaceLabel, controlsAriaLabel: interfaceLabel, sizeFilterLabel: interfaceLabel, colourFilterLabel: interfaceLabel,
      minimumPriceLabel: interfaceLabel, maximumPriceLabel: interfaceLabel, clearSearchLabel: interfaceLabel, sortLabel: interfaceLabel,
      sortOptions: z.object({ featured: interfaceLabel, newest: interfaceLabel, priceAscending: interfaceLabel, priceDescending: interfaceLabel }).strict(),
      refineLabel: interfaceLabel, refineProductsTitle: interfaceLabel, closeFiltersLabel: interfaceLabel, categoryLabel: interfaceLabel, fulfilmentLabel: interfaceLabel,
      activeFiltersLabel: interfaceLabel, searchFilterLabel: interfaceLabel, removeSearchFilterLabel: interfaceLabel, removeCategoryFilterLabel: interfaceLabel,
      removeFulfilmentFilterLabel: interfaceLabel, removeSizeFilterLabel: interfaceLabel, removeColourFilterLabel: interfaceLabel, removePriceFilterLabel: interfaceLabel,
      priceFilterLabel: interfaceLabel, maximumPriceValueLabel: interfaceLabel, resultCountSingular: interfaceLabel, resultCountPlural: interfaceLabel,
      clearAllLabel: interfaceLabel, resetFiltersLabel: interfaceLabel, resetLabel: interfaceLabel, viewResultsLabel: interfaceLabel,
      departments: z.object({
        men: z.object({ seo, eyebrow: copy, title: copy, intro: copy }).strict(),
        women: z.object({ seo, eyebrow: copy, title: copy, intro: copy }).strict(),
        accessories: z.object({ seo, eyebrow: copy, title: copy, intro: copy }).strict(),
      }).strict(),
    }).strict(),
    faq: z.object({
      seo, eyebrow: copy, title: copy, intro: copy, helpText: copy, listAriaLabel: copy.min(1),
      allFilterLabel: copy, shopCta: link, policiesCta: link,
      items: z.array(z.object({ id: slug, category: copy, question: copy, answer: copy }).strict()).optional(),
    }).strict(),
    about: z.object({
      seo,
      hero: z.object({ eyebrow: copy, title: copy, body: copy }).strict(),
      whatWeMake: z.object({ heading: copy, paragraphs: z.array(copy).min(1) }).strict(),
      howItWorks: z.object({ heading: copy, steps: z.array(copy).min(1) }).strict(),
      location: z.object({
        heading: copy,
        columns: z.array(z.array(copy).min(1)).min(1),
      }).strict(),
      primaryCta: link,
      secondaryCta: link,
      stylistCtaLabel: copy,
    }).strict(),
    journal: z.object({ seo, heading: copy, intro: copy, loadingMessage: copy, errorMessage: copy, emptyMessage: copy, fallbackMark: copy, readCtaLabel: copy, loadingSeo: seo, notFoundSeo: seo, notFoundTitle: copy, notFoundMessage: copy, backCta: link, updatedLabel: copy, byLabel: copy, writtenByLabel: copy, shareLabel: copy, copiedLabel: copy, relatedProductsHeading: copy, relatedArticlesHeading: copy }).strict(),
    policies: z.object({
      seo, eyebrow: copy, title: copy, intro: copy, cardLabel: copy, openLabel: copy, emptyMessage: copy, loadingMessage: copy, unavailableMessage: copy, approvedLabel: copy, effectiveMessage: copy,
      privacyRequest: z.object({ eyebrow: copy, title: copy, body: copy, acceptedMessage: copy, anotherLabel: copy, requestTypeLabel: copy, accessLabel: copy, deletionLabel: copy, emailLabel: copy, nameLabel: copy, optionalLabel: copy, submitLabel: copy, submittingLabel: copy, invalidEmailMessage: copy.min(1), submitError: copy }).strict(),
    }).strict(),
    checkout: z.object({ seo, backCta: link, eyebrow: copy, title: copy, intro: copy, emptyMessage: copy, emptyCta: link, nameLabel: copy, phoneLabel: copy, emailLabel: copy, addressLabel: copy, notesLabel: copy, optionalLabel: copy, deliveryNote: copy, paymentUnavailableMessage: copy, retryLabel: copy, returnToBagLabel: copy, processingLabel: copy, paymentLabel: copy, secureNote: copy, legalLinks: z.array(link).min(1), stylistLabel: copy, bagTitle: copy, sizeQuantityLabel: copy, subtotalLabel: copy, stylistCtaLabel: copy }).strict(),
    paymentReturn: z.object({
      seo, eyebrow: copy, missingAttemptMessage: copy.min(1), statusUnavailableMessage: copy.min(1),
      paidTitle: copy, cancelledTitle: copy, pendingTitle: copy, paidBody: copy, cancelledBody: copy,
      pendingBody: copy, orderReferenceLabel: copy, authoritativeTotalLabel: copy, errorSuffix: copy,
      pendingNotice: copy, retryHelp: copy, reviewLabel: copy, sizeLabel: copy, quantityLabel: copy,
      measurementSyncError: copy.min(1), noticeLabel: interfaceLabel,
      measurementsTitle: interfaceLabel, requiredMeasurementsGuidance: copy.min(1), optionalMeasurementsGuidance: copy.min(1),
      measurementInvalidErrorTemplate: interfaceLabel.refine((value) => value.includes("{label}"), "Measurement invalid error template must include {label}"),
      measurementRangeErrorTemplate, measurementConflictError: copy.min(1), measurementSubmitError: copy.min(1),
      measurementStatusLabels: z.object({
        needed: interfaceLabel, submitted: interfaceLabel, clarification_requested: interfaceLabel,
        confirmed: interfaceLabel, cancelled: interfaceLabel,
      }).strict(),
      atelierNoteLabel: interfaceLabel, productionExceptionLabel: interfaceLabel,
      unitLabel: interfaceLabel, unitsGroupAriaLabel: interfaceLabel,
      measurementFieldLabels: z.object({
        height: interfaceLabel, chest: interfaceLabel, waist: interfaceLabel, hips: interfaceLabel,
        shoulder: interfaceLabel, sleeve: interfaceLabel, garmentLength: interfaceLabel,
      }).strict(),
      lineLabel: interfaceLabel, baseSizeLabel: interfaceLabel, additionalNotesLabel: interfaceLabel,
      optionalLabel: interfaceLabel, centimetersUnitLabel: interfaceLabel, inchesUnitLabel: interfaceLabel,
      optionalContextPlaceholder: interfaceLabel, submittingMeasurementsLabel: interfaceLabel,
      submitMeasurementsLabel: interfaceLabel, updateMeasurementsLabel: interfaceLabel,
      returnBagCta: link, continueCta: link, retryCta: link, returnCheckoutCta: link,
    }).strict(),
    notFound: z.object({ seo, title: copy, body: copy, cta: link }).strict(),
  }).strict(),
  products: z.array(z.object({
    slug, name: copy, img: localPath, images: z.array(image).min(1),
    materialTurnSets: z.array(materialTurnSet).max(8).default([]),
    price: z.number().int().positive(), tag: copy, note: copy, category: copy, department,
    description: copy, sizes: z.array(z.string().min(1).max(40)).min(1),
    colour: copy.min(1),
    colourOptions: z.array(colourOption).min(1).max(16),
    allowCustomColour: z.boolean(),
    colourVisualizer: z.object({
      baseImageSrc: governedColourAssetPath,
      garmentMaskSrc: garmentMaskPath,
    }).strict().optional(),
    fabric: copy.min(1), fit: copy.min(1),
    searchableTerms: z.array(z.string().min(1).max(120)),
    merchandising: z.object({
      isNew: z.boolean(), label: copy.optional(), sortPriority: z.number().int(),
    }).strict(),
    standardEligible: z.boolean(), customEligible: z.boolean(),
    standardSizes: z.array(z.string().min(1).max(40)),
    readyNowSizes: z.array(z.string().min(1).max(40)),
    fulfilmentState: z.enum(["ready_now", "made_immediately", "unavailable"]),
    dispatchMessage: copy.min(1),
    unavailableMessage: copy.min(1).optional(),
    composition: copy.min(1).optional(),
    care: copy.min(1).optional(),
    delivery: copy.min(1).optional(),
    returns: copy.min(1).optional(),
    featured: z.boolean().optional(), relatedProductSlugs: z.array(slug).optional(),
    commerceProductId: z.string().uuid().optional(),
    commerceVariantIds: z.record(z.string(), z.string().uuid()).optional(),
  }).strict().superRefine((product, ctx) => {
    const reportDuplicates = (values: string[], path: string) => {
      const seen = new Set<string>();
      values.forEach((value, index) => {
        if (seen.has(value)) ctx.addIssue({ code: "custom", message: `Duplicate ${path} value: ${value}`, path: [path, index] });
        seen.add(value);
      });
    };
    reportDuplicates(product.sizes, "sizes");
    reportDuplicates(product.standardSizes, "standardSizes");
    reportDuplicates(product.readyNowSizes, "readyNowSizes");
    const turnSetIds = new Set<string>();
    const turnImageSources = new Set<string>();
    product.materialTurnSets.forEach((turnSet, turnSetIndex) => {
      if (turnSetIds.has(turnSet.id)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate material turn set ID: ${turnSet.id}`,
          path: ["materialTurnSets", turnSetIndex, "id"],
        });
      }
      turnSetIds.add(turnSet.id);
      (["front", "back"] as const).forEach((side) => {
        const source = turnSet[side].src;
        if (turnImageSources.has(source)) {
          ctx.addIssue({
            code: "custom",
            message: `Duplicate material turn image source: ${source}`,
            path: ["materialTurnSets", turnSetIndex, side, "src"],
          });
        }
        turnImageSources.add(source);
      });
      if (turnSet.front.src === turnSet.back.src) {
        ctx.addIssue({
          code: "custom",
          message: "Material turn set front and back image sources must be distinct",
          path: ["materialTurnSets", turnSetIndex, "back", "src"],
        });
      }
    });
    const colourIds = new Set<string>();
    const colourLabels = new Set<string>();
    const colourHexes = new Set<string>();
    product.colourOptions.forEach((option, index) => {
      const label = option.label.toLocaleLowerCase();
      const hex = option.hex.toUpperCase();
      if (colourIds.has(option.id)) ctx.addIssue({ code: "custom", message: `Duplicate colour option ID: ${option.id}`, path: ["colourOptions", index, "id"] });
      if (colourLabels.has(label)) ctx.addIssue({ code: "custom", message: `Duplicate colour option label: ${option.label}`, path: ["colourOptions", index, "label"] });
      if (colourHexes.has(hex)) ctx.addIssue({ code: "custom", message: `Duplicate colour option hex: ${option.hex}`, path: ["colourOptions", index, "hex"] });
      colourIds.add(option.id);
      colourLabels.add(label);
      colourHexes.add(hex);
    });
    const selectableSizes = new Set(product.sizes);
    product.standardSizes.forEach((size, index) => {
      if (!selectableSizes.has(size)) {
        ctx.addIssue({ code: "custom", message: "Standard sizes must be selectable sizes", path: ["standardSizes", index] });
      }
    });
    const customSizeIndex = product.sizes.findIndex((size) => size.toLocaleLowerCase() === "custom");
    if (product.department !== "men" && product.customEligible) {
      ctx.addIssue({ code: "custom", message: "Only Men products may offer Custom or made-to-measure sizing", path: ["customEligible"] });
    }
    if (product.department !== "men" && product.fulfilmentState !== "unavailable" && !product.standardEligible) {
      ctx.addIssue({ code: "custom", message: "Women and Accessories products must use Standard ready-to-wear sizing", path: ["standardEligible"] });
    }
    if (product.customEligible && customSizeIndex < 0) {
      ctx.addIssue({ code: "custom", message: "Custom eligibility requires a Custom selectable size", path: ["sizes"] });
    }
    if (!product.customEligible && customSizeIndex >= 0) {
      ctx.addIssue({ code: "custom", message: "Custom selectable size requires Custom eligibility", path: ["sizes", customSizeIndex] });
    }
    if (product.standardEligible && product.standardSizes.length === 0 && product.fulfilmentState !== "unavailable") {
      ctx.addIssue({ code: "custom", message: "Standard eligibility requires at least one Standard size", path: ["standardSizes"] });
    }
    if (product.fulfilmentState === "ready_now" && product.readyNowSizes.length === 0) {
      ctx.addIssue({ code: "custom", message: "Ready-now products require at least one ready-now size", path: ["readyNowSizes"] });
    }
    if (!product.standardEligible && product.standardSizes.length > 0) {
      ctx.addIssue({ code: "custom", message: "Standard sizes require Standard eligibility", path: ["standardSizes"] });
    }
    product.standardSizes.forEach((size, index) => {
      if (size.toLocaleLowerCase() === "custom") {
        ctx.addIssue({ code: "custom", message: "Custom must use Custom eligibility, not Standard sizes", path: ["standardSizes", index] });
      }
    });
    if (product.fulfilmentState !== "unavailable" && !product.standardEligible && !product.customEligible) {
      ctx.addIssue({ code: "custom", message: "Available products require Standard or Custom eligibility", path: ["standardEligible"] });
    }
    if (product.fulfilmentState === "unavailable") {
      if (product.readyNowSizes.length > 0) {
        ctx.addIssue({ code: "custom", message: "Unavailable products cannot advertise ready-now sizes", path: ["readyNowSizes"] });
      }
      if (!product.unavailableMessage) {
        ctx.addIssue({ code: "custom", message: "Unavailable products require an unavailable message", path: ["unavailableMessage"] });
      }
    } else if (product.unavailableMessage !== undefined) {
      ctx.addIssue({ code: "custom", message: "Only unavailable products may include an unavailable message", path: ["unavailableMessage"] });
    }
    const standards = new Set(product.standardSizes);
    product.readyNowSizes.forEach((size, index) => {
      if (!standards.has(size)) ctx.addIssue({ code: "custom", message: "Ready-now sizes must be Standard sizes", path: ["readyNowSizes", index] });
    });
    if (product.commerceVariantIds && !product.commerceProductId) {
      ctx.addIssue({ code: "custom", message: "Commerce variants require a commerce product ID", path: ["commerceProductId"] });
    }
    if (product.commerceVariantIds) {
      const allowedVariants = new Set([...product.standardSizes, ...(product.customEligible ? ["Custom"] : [])]);
      Object.keys(product.commerceVariantIds).forEach((size) => {
        if (!allowedVariants.has(size)) {
          ctx.addIssue({ code: "custom", message: `Commerce variant is configured for an ineligible size: ${size}`, path: ["commerceVariantIds", size] });
        }
      });
    }
    if (product.fulfilmentState !== "unavailable" && product.commerceProductId) {
      product.standardSizes.forEach((size) => {
        if (product.standardEligible && !product.commerceVariantIds?.[size]) {
          ctx.addIssue({ code: "custom", message: `Missing commerce variant for Standard size ${size}`, path: ["commerceVariantIds", size] });
        }
      });
      if (product.customEligible && !product.commerceVariantIds?.Custom) {
        ctx.addIssue({ code: "custom", message: "Custom eligibility requires a Custom commerce variant", path: ["commerceVariantIds", "Custom"] });
      }
    }
  })).min(1),
  collections: z.array(z.object({ slug, label: copy, category: copy, department, h1: copy, intro: copy, seo }).strict()).min(1),
  sizeGuide: z.object({
    title: copy, intro: copy, columns: z.array(copy).min(1),
    rows: z.array(z.object({ size: z.string().min(1), values: z.array(copy).min(1) }).strict()).min(1),
    customHelp: copy,
  }).strict(),
  productCopy: z.object({
    seoTitleSuffix: copy, seoDescriptionSuffix: copy, categorySuffix: copy,
    detailImageAltSuffix: copy.min(1), sizeGuideCloseLabel: copy.min(1),
    madeToOrderLabel: copy, sizeSelectorLabel: copy, sizePrompt: copy,
    customSizeHelp: copy, standardSizeHelp: copy,
    colourLabel: copy.min(1), fabricLabel: copy.min(1), fitLabel: copy.min(1),
    readyNowLabel: copy.min(1), madeImmediatelyLabel: copy.min(1), unavailableLabel: copy.min(1),
    dispatchLabel: copy.min(1), dispatchNotDeliveryMessage: copy.min(1),
    standardUnavailableMessage: copy.min(1), customUnavailableMessage: copy.min(1),
    sizeRequiredLabel: copy, mobileSizeRequiredLabel: copy, addToBagLabel: copy,
    newLabel: interfaceLabel, viewProductLabel: interfaceLabel, quickShopTitle: interfaceLabel, closeQuickShopLabel: interfaceLabel,
    customSizingLabel: interfaceLabel, selectedLabel: interfaceLabel, unmappedPurchaseMessage: interfaceLabel, onlinePurchaseUnavailableLabel: interfaceLabel,
    unavailableInSizeLabel: interfaceLabel, viewFullDetailsLabel: interfaceLabel, homeBreadcrumbLabel: interfaceLabel, shopBreadcrumbLabel: interfaceLabel,
    productUnmappedPurchaseMessage: interfaceLabel, addToBagPriceSeparator: interfaceLabel,
    breadcrumbAriaLabel: interfaceLabel, returnToResultsLabel: interfaceLabel, previousImageLabel: interfaceLabel, nextImageLabel: interfaceLabel,
    zoomInImageLabel: interfaceLabel, zoomOutImageLabel: interfaceLabel, imageCreditLabel: interfaceLabel, customLabel: interfaceLabel,
    compositionCareHeading: interfaceLabel, deliveryReturnsHeading: interfaceLabel,
    compositionLabel: interfaceLabel, careLabel: interfaceLabel, deliveryLabel: interfaceLabel, returnsLabel: interfaceLabel,
    trustItems: z.array(copyItem).min(1), marqueeText: copy, marqueeSymbol: copy,
    detailsEyebrow: copy, detailsHeading: copy, details: z.array(copyItem).min(1),
    assurancesEyebrow: copy, assurancesHeading: copy,
    assurances: z.array(copyItem).min(1), relatedHeading: copy,
    fitAssistant: z.object({
      title: copy, intro: copy,
      heightLabel: copy, weightLabel: copy, chestLabel: copy,
      preferredFitLabel: copy, preferredFitPlaceholder: copy,
      preferredFitOptions: z.array(z.object({ value: slug, label: copy }).strict()).min(1),
      occasionLabel: copy, occasionPlaceholder: copy, submitLabel: copy, submittedMessage: copy,
    }).strict(),
  }).strict(),
  supportCopy: z.object({
    stylistLabel: copy, stylistHelp: copy, productCtaLabel: copy,
    productHelp: copy, productDetailsCtaLabel: copy, fitCtaLabel: copy,
    stylistDialog: z.object({
      eyebrow: copy.min(1), title: copy.min(1), productPrompt: copy.min(1), generalPrompt: copy.min(1),
      checkoutReassurance: copy.min(1), closeLabel: copy.min(1),
      successTitle: copy.min(1), successBody: copy.min(1), backLabel: copy.min(1),
      nameLabel: copy.min(1), phoneLabel: copy.min(1), emailLabel: copy.min(1),
      optionalLabel: copy.min(1), questionLabel: copy.min(1), questionPlaceholder: copy.min(1),
      submitLabel: copy.min(1), pendingLabel: copy.min(1), failureMessage: copy.min(1),
    }).strict(),
  }).strict(),
  interfaceCopy: z.object({
    navigation: z.object({ shopAllLabel: interfaceLabel, featuredLabel: interfaceLabel }).strict(),
    search: z.object({ emptyResultsMessage: interfaceLabel, emptyResultsHelp: interfaceLabel, searchCatalogueLabel: interfaceLabel, productsHeading: interfaceLabel, collectionsHeading: interfaceLabel, viewAllLabel: interfaceLabel }).strict(),
  }).strict(),
}).strict().superRefine((content, ctx) => {
  const duplicateSlugs = (values: string[], path: string) => {
    const seen = new Set<string>();
    values.forEach((value, index) => {
      if (seen.has(value)) ctx.addIssue({ code: "custom", message: `Duplicate slug: ${value}`, path: [path, index, "slug"] });
      seen.add(value);
    });
  };
  duplicateSlugs(content.products.map((item) => item.slug), "products");
  duplicateSlugs(content.collections.map((item) => item.slug), "collections");
  const products = new Set(content.products.map((item) => item.slug));
  const productsBySlug = new Map(content.products.map((item) => [item.slug, item]));
  const collectionCategories = new Set(content.collections.map((item) => `${item.department}\0${item.category}`));
  const collectionSlugs = new Set(content.collections.map((item) => item.slug));
  content.products.forEach((product, index) => {
    if (!collectionCategories.has(`${product.department}\0${product.category}`)) {
      ctx.addIssue({ code: "custom", message: `Unknown ${product.department} product collection category: ${product.category}`, path: ["products", index, "category"] });
    }
    if (!product.images.some((item) => item.src === product.img)) {
      ctx.addIssue({ code: "custom", message: "Primary product image must be included in the approved images", path: ["products", index, "img"] });
    }
    const imageSources = new Set<string>();
    product.images.forEach((item, imageIndex) => {
      if (imageSources.has(item.src)) ctx.addIssue({ code: "custom", message: `Duplicate approved product image: ${item.src}`, path: ["products", index, "images", imageIndex, "src"] });
      imageSources.add(item.src);
    });
    const relationships = new Set<string>();
    product.relatedProductSlugs?.forEach((related, relatedIndex) => {
      if (!products.has(related) || related === product.slug) ctx.addIssue({ code: "custom", message: `Invalid related product: ${related}`, path: ["products", index, "relatedProductSlugs", relatedIndex] });
      if (relationships.has(related)) ctx.addIssue({ code: "custom", message: `Duplicate related product: ${related}`, path: ["products", index, "relatedProductSlugs", relatedIndex] });
      relationships.add(related);
    });
  });
  const isSafeStorefrontTarget = (target: string): boolean => {
    if (["/journal", "/faq", "/about", "/#whatsapp"].includes(target)) return true;
    try {
      const parsed = new URL(target, "https://soso.invalid");
      if (parsed.origin !== "https://soso.invalid") return parsed.protocol === "https:";
      if (parsed.pathname === "/shop") {
        const targetDepartment = parsed.searchParams.get("department");
        return !targetDepartment || department.options.includes(targetDepartment as typeof department.options[number]);
      }
    } catch {
      return false;
    }
    const productMatch = target.match(/^\/product\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);
    if (productMatch) return products.has(productMatch[1]!);
    const collectionMatch = target.match(/^\/collections\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);
    return Boolean(collectionMatch && collectionSlugs.has(collectionMatch[1]!));
  };
  const menuIds = new Set<string>();
  content.site.megaMenu.forEach((group, groupIndex) => {
    if (menuIds.has(group.id)) {
      ctx.addIssue({ code: "custom", message: `Duplicate mega-menu group ID: ${group.id}`, path: ["site", "megaMenu", groupIndex, "id"] });
    }
    menuIds.add(group.id);
    if (!isSafeStorefrontTarget(group.href)) {
      ctx.addIssue({ code: "custom", message: `Unsafe or unknown mega-menu target: ${group.href}`, path: ["site", "megaMenu", groupIndex, "href"] });
    }
    if (group.visible && group.department) {
      const liveProducts = content.products.filter((item) => item.department === group.department && item.fulfilmentState !== "unavailable");
      if (liveProducts.length === 0) {
        ctx.addIssue({ code: "custom", message: `Visible ${group.label} menu requires at least one available product`, path: ["site", "megaMenu", groupIndex, "visible"] });
      }
      if (group.featuredProductSlugs.length === 0) {
        ctx.addIssue({ code: "custom", message: `Visible ${group.label} menu requires at least one featured product image`, path: ["site", "megaMenu", groupIndex, "featuredProductSlugs"] });
      }
    }
    group.columns.forEach((column, columnIndex) => {
      column.links.forEach((item, linkIndex) => {
        if (!isSafeStorefrontTarget(item.href)) {
          ctx.addIssue({ code: "custom", message: `Unsafe or unknown mega-menu link: ${item.href}`, path: ["site", "megaMenu", groupIndex, "columns", columnIndex, "links", linkIndex, "href"] });
        }
      });
    });
    const featured = new Set<string>();
    group.featuredProductSlugs.forEach((productSlug, productIndex) => {
      const featuredProduct = productsBySlug.get(productSlug);
      if (!featuredProduct) {
        ctx.addIssue({ code: "custom", message: `Unknown mega-menu featured product: ${productSlug}`, path: ["site", "megaMenu", groupIndex, "featuredProductSlugs", productIndex] });
      } else if (group.department && featuredProduct.department !== group.department) {
        ctx.addIssue({ code: "custom", message: `Featured product ${productSlug} does not belong to ${group.department}`, path: ["site", "megaMenu", groupIndex, "featuredProductSlugs", productIndex] });
      }
      if (featured.has(productSlug)) {
        ctx.addIssue({ code: "custom", message: `Duplicate mega-menu featured product: ${productSlug}`, path: ["site", "megaMenu", groupIndex, "featuredProductSlugs", productIndex] });
      }
      featured.add(productSlug);
    });
  });
  const suggestions = new Set<string>();
  content.site.header.searchSuggestions.forEach((suggestion, index) => {
    if (suggestions.has(suggestion.href)) {
      ctx.addIssue({ code: "custom", message: `Duplicate search suggestion target: ${suggestion.href}`, path: ["site", "header", "searchSuggestions", index, "href"] });
    }
    suggestions.add(suggestion.href);
    let safe = suggestion.href === "/shop" || suggestion.href.startsWith("/shop?");
    const productMatch = suggestion.href.match(/^\/product\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);
    const collectionMatch = suggestion.href.match(/^\/collections\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);
    if (productMatch) safe = products.has(productMatch[1]!);
    if (collectionMatch) safe = collectionSlugs.has(collectionMatch[1]!);
    if (!safe) {
      ctx.addIssue({ code: "custom", message: `Unsafe or unknown search suggestion target: ${suggestion.href}`, path: ["site", "header", "searchSuggestions", index, "href"] });
    }
  });
  content.homepage.featured.productSlugs.forEach((value, index) => {
    if (!products.has(value)) ctx.addIssue({ code: "custom", message: `Unknown featured product: ${value}`, path: ["homepage", "featured", "productSlugs", index] });
  });
  const homepageFeatured = new Set<string>();
  content.homepage.featured.productSlugs.forEach((value, index) => {
    if (!content.homepage.featured.legacySparseCompatibility && homepageFeatured.has(value)) ctx.addIssue({ code: "custom", message: `Duplicate featured product: ${value}`, path: ["homepage", "featured", "productSlugs", index] });
    homepageFeatured.add(value);
  });
  if (content.homepage.featured.legacySparseCompatibility) {
    if (products.size < 1 || products.size >= 4) {
      ctx.addIssue({ code: "custom", message: "Legacy sparse featured compatibility is only valid for catalogues with one to three products", path: ["homepage", "featured", "legacySparseCompatibility"] });
    }
    const requiredUniqueSlots = Math.min(products.size, content.homepage.featured.productSlugs.length);
    const initialSlugs = content.homepage.featured.productSlugs.slice(0, requiredUniqueSlots);
    if (new Set(initialSlugs).size !== requiredUniqueSlots || initialSlugs.some((value) => !products.has(value)) || new Set(initialSlugs).size !== products.size) {
      ctx.addIssue({ code: "custom", message: "Legacy sparse featured compatibility must list every current product once before repeats", path: ["homepage", "featured", "productSlugs"] });
    }
    if (new Set(content.homepage.featured.productSlugs).size === content.homepage.featured.productSlugs.length) {
      ctx.addIssue({ code: "custom", message: "Legacy sparse featured compatibility requires repeated products", path: ["homepage", "featured", "legacySparseCompatibility"] });
    }
  }
  if (!products.has(content.homepage.newArrival.productSlug)) {
    ctx.addIssue({ code: "custom", message: `Unknown new-arrival product: ${content.homepage.newArrival.productSlug}`, path: ["homepage", "newArrival", "productSlug"] });
  }
  const categoryTargets = new Set<string>();
  const approvedCategoryTargets = ["/collections/kaftans", "/collections/agbadas", "/collections/shirts", "/collections/dashikis", "/collections/two-piece"];
  content.homepage.categories.items.forEach((item, index) => {
    if (item.active !== false && !approvedCategoryTargets.includes(item.href)) ctx.addIssue({ code: "custom", message: "Homepage category must lead to one of the five approved collections", path: ["homepage", "categories", "items", index, "href"] });
    if (item.active !== false && item.imageUrls && item.imageUrls.length > 4) ctx.addIssue({ code: "custom", message: "Active category image sets contain one to four images", path: ["homepage", "categories", "items", index, "imageUrls"] });
    if (categoryTargets.has(item.href)) ctx.addIssue({ code: "custom", message: `Duplicate homepage category target: ${item.href}`, path: ["homepage", "categories", "items", index, "href"] });
    categoryTargets.add(item.href);
    if (!isSafeStorefrontTarget(item.href)) ctx.addIssue({ code: "custom", message: `Unsafe or unknown homepage category target: ${item.href}`, path: ["homepage", "categories", "items", index, "href"] });
    const collectionSlug = item.href.replace("/collections/", "");
    const collection = content.collections.find((entry) => entry.slug === collectionSlug);
    if (item.active !== false && (!collection || !content.products.some((product) => product.department === collection.department && product.category === collection.category && product.fulfilmentState !== "unavailable"))) {
      ctx.addIssue({ code: "custom", message: "Active homepage categories require an authoritative collection with an available relevant product", path: ["homepage", "categories", "items", index, "href"] });
    }
  });
  const homepageLinks: Array<{ value: string; path: (string | number)[] }> = [
    { value: content.homepage.newArrival.link.href, path: ["homepage", "newArrival", "link", "href"] },
    { value: content.homepage.newArrival.editorial.link.href, path: ["homepage", "newArrival", "editorial", "link", "href"] },
    { value: content.homepage.featured.link.href, path: ["homepage", "featured", "link", "href"] },
    ...content.homepage.occasions.items.map((item, index) => ({ value: item.href, path: ["homepage", "occasions", "items", index, "href"] })),
    ...(content.homepage.hero.campaignCta ? [{ value: content.homepage.hero.campaignCta.href, path: ["homepage", "hero", "campaignCta", "href"] as (string | number)[] }] : []),
  ];
  homepageLinks.forEach((item) => {
    if (!isSafeStorefrontTarget(item.value)) ctx.addIssue({ code: "custom", message: `Unsafe or unknown homepage target: ${item.value}`, path: item.path });
  });
  const campaign = content.homepage.hero.campaignCta;
  if (campaign?.enabled && campaign.href.startsWith("/collections/")) {
    const target = campaign.href.slice("/collections/".length);
    const collection = content.collections.find((item) => item.slug === target);
    const useful = target === "new-arrivals"
      ? content.products.some((item) => item.fulfilmentState !== "unavailable" && item.merchandising.isNew)
      : collection && content.products.some((item) => item.department === collection.department && item.category === collection.category && item.fulfilmentState !== "unavailable");
    if (!useful) ctx.addIssue({ code: "custom", message: "Enabled campaign CTA collection requires an available relevant product", path: ["homepage", "hero", "campaignCta", "href"] });
  }
  content.sizeGuide.rows.forEach((row, index) => {
    if (row.values.length !== content.sizeGuide.columns.length) ctx.addIssue({ code: "custom", message: "Size guide values must match its columns", path: ["sizeGuide", "rows", index, "values"] });
  });
});

export type PlatformContent = z.infer<typeof PlatformContentSchema>;

const sizes = ["S", "M", "L", "XL", "XXL", "Custom"];
const standardSizes = ["S", "M", "L", "XL", "XXL"];
const suppliedImageProvenance = {
  source: "SOSO Africa supplied asset",
  rights: "Supplied by SOSO Africa for storefront publication",
};
const prominentSosoColours = [
  { id: "soso-black", label: "SOSO Black", hex: "#111111" },
  { id: "ivory", label: "Ivory", hex: "#F4EBDD" },
  { id: "wine", label: "Wine", hex: "#6F1D2A" },
  { id: "forest-green", label: "Forest Green", hex: "#183D2B" },
  { id: "midnight-navy", label: "Midnight Navy", hex: "#17233C" },
] as const;
const heritageDashikiImageSrc = "/images/soso/dashiki.jpg";
const retiredHeritageDashikiVisualizer = {
  baseImageSrc: heritageDashikiImageSrc,
  garmentMaskSrc: "/images/soso/dashiki-outer-mask.png",
} as const;
function legacyColourHex(label: string): string {
  const normalized = label.toLocaleLowerCase();
  if (normalized.includes("black")) return "#111111";
  if (normalized.includes("ivory") || normalized.includes("cream")) return "#F4EBDD";
  if (normalized.includes("wine") || normalized.includes("burgundy") || normalized.includes("red")) return "#6F1D2A";
  if (normalized.includes("green")) return "#183D2B";
  if (normalized.includes("navy") || normalized.includes("blue")) return "#17233C";
  if (normalized.includes("white")) return "#FAFAF8";
  if (normalized.includes("brown")) return "#684832";
  if (normalized.includes("grey") || normalized.includes("gray")) return "#777777";
  return "#B08D57";
}
function colourId(label: string): string {
  return label.toLocaleLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || "signature";
}
function defaultColourOptions(legacyColour: string) {
  const first = { id: colourId(legacyColour), label: legacyColour.trim() || "Signature", hex: legacyColourHex(legacyColour) };
  const seenIds = new Set([first.id]);
  const seenLabels = new Set([first.label.toLocaleLowerCase()]);
  const seenHexes = new Set([first.hex.toUpperCase()]);
  return [first, ...prominentSosoColours.filter((option) => {
    if (seenIds.has(option.id) || seenLabels.has(option.label.toLocaleLowerCase()) || seenHexes.has(option.hex)) return false;
    seenIds.add(option.id); seenLabels.add(option.label.toLocaleLowerCase()); seenHexes.add(option.hex);
    return true;
  })];
}
const hybridProductDefaults = {
  department: "men" as const,
  colour: "As shown",
  colourOptions: defaultColourOptions("As shown"),
  allowCustomColour: false,
  fabric: "Atelier-selected fabric",
  fit: "Regular",
  searchableTerms: [] as string[],
  merchandising: { isNew: false, sortPriority: 0 },
  standardEligible: true,
  customEligible: true,
  standardSizes,
  readyNowSizes: [] as string[],
  fulfilmentState: "made_immediately" as const,
  dispatchMessage: "Dispatch within five days",
};
const product = (slugValue: string, name: string, img: string, price: number, tag: string, note: string, category: string, description: string) => ({
  slug: slugValue, name, img, images: [{ src: img, alt: name, provenance: suppliedImageProvenance }],
  materialTurnSets: [],
  price, tag, note, category, description, sizes, ...hybridProductDefaults,
  searchableTerms: [name, category, tag],
  featured: true,
});
const womenImageProvenance = (sourceUrl: string) => ({
  source: "SOSO Africa catalogue on shopsoso.co",
  rights: "SOSO Africa approved this catalogue image for reuse on the SOSO storefront",
  sourceUrl,
});
const womenReadyToWearProduct = (input: {
  slug: string;
  name: string;
  img: string;
  sourceUrl: string;
  imageAlt: string;
  price: number;
  note: string;
  description: string;
  colour: string;
  fabric: string;
  fit: string;
  terms: string[];
  sortPriority: number;
  composition?: string;
  care?: string;
}): PlatformContent["products"][number] => ({
  slug: input.slug,
  name: input.name,
  img: input.img,
  images: [{
    src: input.img,
    alt: input.imageAlt,
    provenance: womenImageProvenance(input.sourceUrl),
  }],
  materialTurnSets: [],
  price: input.price,
  tag: "Women · Ready-to-wear",
  note: input.note,
  category: "Women's Ready-to-Wear",
  department: "women",
  description: input.description,
  sizes: standardSizes,
  colour: input.colour,
  colourOptions: defaultColourOptions(input.colour),
  allowCustomColour: false,
  fabric: input.fabric,
  fit: input.fit,
  searchableTerms: [input.name, "Women", "Ready-to-wear", ...input.terms],
  merchandising: { isNew: true, label: "Women", sortPriority: input.sortPriority },
  standardEligible: true,
  customEligible: false,
  standardSizes,
  readyNowSizes: [],
  fulfilmentState: "made_immediately",
  dispatchMessage: "Dispatch timing confirmed after order",
  composition: input.composition,
  care: input.care,
  delivery: "Tracked nationwide delivery is advertised as 2–4 days.",
  returns: "7-day exchange and fit adjustment, subject to the published SOSO policy.",
  featured: true,
});
const womenReadyToWearProducts: PlatformContent["products"] = [
  womenReadyToWearProduct({
    slug: "canvas",
    name: "Canvas",
    img: "/images/soso/women/canvas.jpg",
    sourceUrl: "https://shopsoso.co/product/soso-117/",
    imageAlt: "Woman wearing the ivory Canvas linen top with botanical embroidery",
    price: 130000,
    note: "Embroidered premium linen",
    description: "An ivory premium-linen longline top finished with red and green botanical embroidery. Canvas brings a light, breathable feel to warm days, gatherings, and elevated smart-casual occasions.",
    colour: "Ivory with botanical embroidery",
    fabric: "Premium linen",
    fit: "Relaxed longline",
    terms: ["linen", "embroidered", "ivory", "brunch", "resort", "smart casual"],
    sortPriority: 160,
    composition: "Premium linen with embroidery detailing.",
    care: "Hand-wash or machine wash cold on a gentle cycle with mild detergent. Do not bleach; hang or lay flat to dry and iron on medium heat.",
  }),
  womenReadyToWearProduct({
    slug: "varen",
    name: "Varen",
    img: "/images/soso/women/varen.jpg",
    sourceUrl: "https://shopsoso.co/product/soso-116/",
    imageAlt: "Woman wearing the black Varen tunic and trouser set",
    price: 130000,
    note: "Fluid Dubai silk two-piece",
    description: "A black Dubai-silk tunic and trouser set with a fluid drape and restrained red detailing. Varen is designed for refined everyday dressing, evenings out, and destination occasions.",
    colour: "Black with red trim",
    fabric: "Dubai silk",
    fit: "Relaxed two-piece",
    terms: ["silk", "black", "two-piece", "brunch", "evening", "resort"],
    sortPriority: 150,
    composition: "Dubai silk.",
  }),
  womenReadyToWearProduct({
    slug: "viren",
    name: "Viren",
    img: "/images/soso/women/viren.jpg",
    sourceUrl: "https://shopsoso.co/product/soso-112/",
    imageAlt: "Woman wearing the ivory Viren sleeveless tunic and trouser set",
    price: 150000,
    note: "Ivory Dubai silk two-piece",
    description: "An ivory Dubai-silk sleeveless tunic and trouser set with a graceful, elongated line. Viren balances ease and polish for celebrations, warm-weather events, and elevated everyday wear.",
    colour: "Ivory",
    fabric: "Dubai silk",
    fit: "Sleeveless two-piece",
    terms: ["silk", "ivory", "two-piece", "brunch", "evening", "resort"],
    sortPriority: 140,
    composition: "Dubai silk.",
  }),
  womenReadyToWearProduct({
    slug: "sovan",
    name: "Sovan",
    img: "/images/soso/women/sovan.jpg",
    sourceUrl: "https://shopsoso.co/product/the-dress-shirt-black/",
    imageAlt: "Woman wearing the black Sovan longline shirt",
    price: 100000,
    note: "Black longline dress shirt",
    description: "A black button-front longline shirt with a crisp collar and subtle SOSO mark. Sovan is an easy statement for casual days, evenings out, and layered dressing.",
    colour: "Black",
    fabric: "Atelier-selected fabric",
    fit: "Relaxed longline shirt",
    terms: ["black", "shirt", "casual", "dress shirt", "evening"],
    sortPriority: 130,
  }),
  womenReadyToWearProduct({
    slug: "aurel",
    name: "Aurel",
    img: "/images/soso/women/aurel.jpg",
    sourceUrl: "https://shopsoso.co/product/soso-79-2/",
    imageAlt: "Woman wearing the black Aurel top and wide-leg trouser set",
    price: 125000,
    note: "Business-casual two-piece",
    description: "A black short-sleeve top and wide-leg trouser set cut for clean, confident movement. Aurel offers a composed ready-to-wear option for meetings and business-casual settings.",
    colour: "Black",
    fabric: "Atelier-selected fabric",
    fit: "Relaxed two-piece",
    terms: ["black", "two-piece", "business casual", "meetings", "wide-leg"],
    sortPriority: 120,
  }),
  womenReadyToWearProduct({
    slug: "soven",
    name: "Soven",
    img: "/images/soso/women/soven.jpg",
    sourceUrl: "https://shopsoso.co/product/the-dress-shirt/",
    imageAlt: "Woman wearing the ivory Soven longline shirt",
    price: 100000,
    note: "Ivory longline dress shirt",
    description: "An ivory button-front longline shirt with a crisp collar and subtle SOSO mark. Soven brings a clean, versatile line to gatherings, occasion dressing, and everyday wardrobes.",
    colour: "Ivory",
    fabric: "Atelier-selected fabric",
    fit: "Relaxed longline shirt",
    terms: ["ivory", "shirt", "occasion", "traditional", "wedding guest"],
    sortPriority: 110,
  }),
];
const womenReadyToWearCollection: PlatformContent["collections"][number] = {
  slug: "women-ready-to-wear",
  label: "Women’s Ready-to-Wear",
  category: "Women's Ready-to-Wear",
  department: "women",
  h1: "Women’s Ready-to-Wear",
  intro: "Considered silhouettes for women in Standard sizes, drawn from SOSO’s published ready-to-wear catalogue.",
  seo: {
    title: "Women’s Ready-to-Wear | SOSO Africa",
    description: "Shop SOSO Africa women’s ready-to-wear in Standard sizes, including linen, silk, shirts, and refined two-piece sets.",
  },
};
export const DEFAULT_PLATFORM_CONTENT: PlatformContent = {
  contentVersion: 19,
  site: {
    name: "SOSO Africa", logoUrl: "/images/soso/logo.png", logoAlt: "SOSO Africa",
    announcement: "Ready now and made immediately · Dispatch within five days",
    announcementItems: [],
    hqAddress: "38 Agazi Street, Wuse, Abuja",
    socialLinks: { facebookUrl: "", twitterUrl: "", youtubeUrl: "", tiktokUrl: "", linkedinUrl: "" },
    skipLinkLabel: "Skip to content",
    contactEmail: "", contactPhone: "", instagramUrl: "https://instagram.com/sosoafrica", whatsappUrl: "/#whatsapp",
    navigation: [{ label: "Journal", href: "/journal" }],
    mobileNavigation: [{ label: "Journal", href: "/journal" }, { label: "FAQ", href: "/faq" }],
    megaMenu: [
      {
        id: "men", label: "Men", href: "/shop?department=men", department: "men", visible: true,
        columns: [
          { heading: "Shop", links: [{ label: "Shop all men", href: "/shop?department=men" }, { label: "New arrivals", href: "/shop?department=men&sort=newest" }, { label: "Ready now", href: "/shop?department=men&fulfilment=ready_now" }] },
          { heading: "Collections", links: [{ label: "Kaftans", href: "/collections/kaftans" }, { label: "Agbadas", href: "/collections/agbadas" }, { label: "Shirts", href: "/collections/shirts" }] },
          { heading: "Services", links: [{ label: "Made-to-measure", href: "/shop?department=men&size=Custom" }, { label: "Ask a stylist", href: "/#whatsapp" }] },
        ],
        featuredProductSlugs: ["sovereign-agbada", "vault"],
      },
      {
        id: "women", label: "Women", href: "/shop?department=women", department: "women", visible: true,
        columns: [
          { heading: "Shop", links: [{ label: "Shop all women", href: "/shop?department=women" }, { label: "New arrivals", href: "/shop?department=women&sort=newest" }] },
          { heading: "Collection", links: [{ label: "Ready-to-wear", href: "/collections/women-ready-to-wear" }] },
          { heading: "Support", links: [{ label: "Ask a stylist", href: "/#whatsapp" }] },
        ],
        featuredProductSlugs: ["canvas", "varen"],
      },
      {
        id: "accessories", label: "Accessories", href: "/shop?department=accessories", department: "accessories", visible: false,
        columns: [{ heading: "Shop", links: [{ label: "Accessories", href: "/shop?department=accessories" }] }],
        featuredProductSlugs: [],
      },
    ],
    platformState: { loadingMessage: "Loading the published storefront…", unavailableMessage: "Storefront content is not published or is temporarily unavailable." },
    header: {
      openMenuLabel: "Open menu", closeMenuLabel: "Close menu", mainNavigationLabel: "Main navigation",
      whatsappLabel: "Order via WhatsApp", cartLabel: "Cart", openCartLabel: "Open cart",
      mobileWhatsappLabel: "Chat with Specialist", searchLabel: "Search", searchPlaceholder: "Search pieces",
      closeSearchLabel: "Close search", clearSearchLabel: "Clear search", searchSuggestionsLabel: "Popular searches",
      searchSuggestions: [
        { label: "Shop all pieces", href: "/shop" },
        { label: "Kaftans", href: "/collections/kaftans" },
        { label: "Agbadas", href: "/collections/agbadas" },
        { label: "Shirts", href: "/collections/shirts" },
      ],
    },
    cart: { title: "Your Cart", closeLabel: "Close cart", emptyMessage: "Your cart is empty.", continueShoppingLabel: "Continue Shopping", sizeLabel: "Size:", removeLabel: "Remove", subtotalLabel: "Subtotal", helpText: "Shipping and taxes calculated at checkout. Need help first? Ask a stylist.", checkoutCta: { label: "Proceed to payment", href: "/checkout" }, stylistCta: { label: "Ask a stylist", href: "/#whatsapp" }, changeSizeLabel: "Change size for", unavailableSizeSuffix: "unavailable", readyNowLabel: "Ready now", madeImmediatelyLabel: "Made immediately", decreaseQuantityLabel: "Decrease quantity for", increaseQuantityLabel: "Increase quantity for", quantityLabel: "Quantity for" },
    floatingCta: { label: "Explore pieces", href: "/shop" },
    consent: { regionLabel: "Privacy choices", title: "Your privacy choices", body: "Necessary storage keeps your cart and privacy choice working. Optional measurement helps SOSO understand which pages are useful; marketing pixels stay off unless you grant marketing consent.", essentialLabel: "Necessary only", analyticsLabel: "Allow measurement", marketingLabel: "Allow marketing", manageLabel: "Manage preference cookies", necessaryDescription: "Necessary — cart, session, consent preference. Always active.", measurementDescription: "Measurement — anonymous page and product journey counts.", marketingDescription: "Marketing — retargeting pixels from configured advertising providers.", footerText: "You can change your choice at any time from the footer.", privacyLink: { label: "Privacy notice", href: "/privacy" } },
    footer: {
      description: "Premium African menswear from Abuja. Shop Standard sizes ready now or made immediately, or choose Custom.",
      columns: [
        { heading: "Shop", links: [{ label: "New Arrivals", href: "/collections/new-arrivals" }, { label: "Kaftans", href: "/collections/kaftans" }, { label: "Agbada", href: "/collections/agbadas" }, { label: "Shirts", href: "/collections/shirts" }, { label: "Dashiki", href: "/collections/dashikis" }, { label: "Two-Piece Sets", href: "/collections/two-piece" }, { label: "All Products", href: "/shop" }] },
        { heading: "About SOSO Africa", links: [{ label: "Our Story", href: "/about/our-story" }, { label: "The Architect of the Modern Man", href: "/about/the-architect-of-the-modern-man" }, { label: "The Client", href: "/about/the-client" }, { label: "Craftsmanship", href: "/about/craftsmanship" }, { label: "Legacy & Vision", href: "/about/legacy-vision" }, { label: "The SOSO Foundation", href: "/about/soso-foundation" }, { label: "Partner With Us", href: "/about/partner-with-us" }] },
        { heading: "Customer Care", links: [{ label: "Contact / Speak With a Stylist", href: "/faq" }, { label: "Size and Measurement Guide", href: "/faq#size" }, { label: "Delivery", href: "/delivery-returns#delivery" }, { label: "Returns and Exchanges", href: "/delivery-returns#returns" }, { label: "FAQs", href: "/faq" }, { label: "Track Order", href: "/delivery-returns#track-order" }, { label: "Payment Information", href: "/faq#payment" }] },
        { heading: "Journal", links: [{ label: "Journal Home", href: "/journal" }, { label: "Styling Traditional Outfits", href: "/journal/style-black-traditional-outfits-modern-occasions" }, { label: "Abuja Menswear", href: "/journal/abuja-modern-menswear-hub" }] },
      ],
      legalLinks: [{ label: "Privacy", href: "/privacy" }, { label: "Terms", href: "/terms" }, { label: "Staff login", href: "/sign-in" }],
      copyright: "© SOSO Africa. All rights reserved.", checkoutNote: "Secure hosted payment. Atelier confirmation follows payment.", instagramLabel: "Instagram", instagramAriaLabel: "SOSO Africa on Instagram", cookieChoicesLabel: "Cookie choices",
    },
    structuredData: {
      organizationDescription: "SOSO Africa is a bespoke menswear house based in Abuja, Nigeria, specialising in kaftans, agbadas, dashikis, and shirting made to order for the individual.",
      locality: "Abuja", country: "Nigeria", countryCode: "NG",
      websiteDescription: "Premium made-to-order African menswear from Abuja. Kaftans, agbadas, dashikis, and shirting — made for the individual.",
    },
  },
  homepage: {
    seo: { title: "SOSO Africa | Premium Nigerian Menswear", description: "Discover SOSO Africa's premium kaftans, agbadas, dashikis and shirts. Explore the collection, sizing help and a considered purchase journey." },
    hero: {
      eyebrow: "SOSO Africa · Abuja", title: "Made for", accent: "presence.", suffix: "",
      description: "Considered menswear from Abuja, available in Standard sizes or Custom.",
      mediaMode: "video",
      imageUrl: "/images/soso/vault-black.jpg",
      mobileImageUrl: "/images/soso/vault-black.jpg",
      imageAlt: "Black SOSO Africa kaftan",
      videoUrl: "/media/soso-craft-hero-desktop.webm",
      mobileVideoUrl: "/media/soso-craft-hero-mobile.webm",
      playLabel: "Play hero motion",
      pauseLabel: "Pause hero motion",
      primaryCta: { label: "Shop New Arrivals", href: "/collections/new-arrivals" }, stylistCtaLabel: "Ask a stylist",
      assurances: ["Standard and Custom purchase routes", "Dispatch within five days", "Optional stylist support"],
    },
    trustItems: [
      { title: "Delivery guidance", body: "Options are confirmed for your location" }, { title: "Sizing support", body: "Use the guide or speak with a stylist" },
      { title: "Made-to-measure", body: "Choose Custom for a fitting conversation" }, { title: "Thoughtful checkout", body: "Pay first, then the atelier confirms making details" },
    ],
    categories: {
      heading: "Shop SOSO categories", accessibleLabel: "Shop SOSO categories", ctaLabel: "Shop the collection",
      items: [
        { eyebrow: "SOSO collection", title: "Kaftan", description: "Considered kaftans cut for daily distinction and significant occasions.", imageUrl: "/images/soso/vault-black.jpg", imageUrls: ["/images/soso/vault-black.jpg", "/images/soso/categories/kaftan-01.jpg", "/images/soso/categories/kaftan-02.jpg"], imageAlt: "SOSO kaftan tailoring", href: "/collections/kaftans", active: true, imageMode: "crossfade", rotationMs: 5000 },
        { eyebrow: "SOSO collection", title: "Agbada", description: "Statement agbadas made for ceremonial presence.", imageUrl: "/images/soso/agbada.jpg", imageUrls: ["/images/soso/agbada.jpg", "/images/soso/categories/agbada-01.jpg", "/images/soso/categories/agbada-02.jpg"], imageAlt: "SOSO ceremonial agbada", href: "/collections/agbadas", active: true, imageMode: "crossfade", rotationMs: 5600 },
        { eyebrow: "SOSO collection", title: "Shirts", description: "Sharp shirting with a measured, modern finish.", imageUrl: "/images/soso/shirts.jpg", imageUrls: ["/images/soso/shirts.jpg", "/images/soso/categories/shirt-01.jpg", "/images/soso/categories/shirt-02.jpg"], imageAlt: "SOSO tailored shirting", href: "/collections/shirts", active: true, imageMode: "crossfade", rotationMs: 6200 },
        { eyebrow: "SOSO collection", title: "Dashiki", description: "Contemporary dashikis rooted in heritage craft.", imageUrl: "/images/soso/dashiki.jpg", imageUrls: ["/images/soso/dashiki.jpg", "/images/soso/categories/dashiki-01.jpg", "/images/soso/categories/dashiki-02.jpg"], imageAlt: "SOSO contemporary dashiki", href: "/collections/dashikis", active: true, imageMode: "crossfade", rotationMs: 6800 },
        { eyebrow: "SOSO collection", title: "Two-Piece Sets", description: "Coordinated sets that move easily between occasions.", imageUrl: "/images/soso/twopiece.jpg", imageUrls: ["/images/soso/twopiece.jpg", "/images/soso/categories/two-piece-01.jpg", "/images/soso/categories/two-piece-02.jpg"], imageAlt: "SOSO tailored two-piece set", href: "/collections/two-piece", active: true, imageMode: "crossfade", rotationMs: 7400 },
      ],
    },
    newArrival: {
      eyebrow: "Just in at SOSO", title: "New arrival", link: { label: "Shop all pieces", href: "/shop" }, productSlug: "vault",
      editorial: {
        imageUrl: "/images/soso/dashiki.jpg", imageAlt: "SOSO editorial tailoring",
        eyebrow: "The SOSO edit", title: "The Architect of the Modern Man.",
        body: "SOSO approaches menswear with proportion, restraint, and intent.",
        link: { label: "Discover the house", href: "/shop" },
      },
    },
    featured: { eyebrow: "Shop the current collection", title: "Ready for the occasion. Made the SOSO way.", link: { label: "Shop all pieces", href: "/shop" }, productSlugs: ["vault", "ivory-kaftan", "sovereign-agbada", "heritage-dashiki"] },
    occasions: {
      eyebrow: "Shop by occasion", title: "Where will they see you next?", items: [
        { title: "The Boardroom", body: "Shirts & sharp two-pieces", imageUrl: "/images/soso/shirts.jpg", imageAlt: "SOSO tailoring styled for the boardroom", href: "/shop", linkLabel: "Shop the look →" },
        { title: "The Wedding", body: "Agbadas & grand kaftans", imageUrl: "/images/soso/agbada.jpg", imageAlt: "SOSO agbada styled for a wedding", href: "/shop", linkLabel: "Shop the look →" },
      ],
    },
    fit: {
      eyebrow: "Fit support", title: "Choose Standard or Custom with confidence.", imageUrl: "/images/soso/kaftan-white.jpg", imageAlt: "Ivory kaftan fitting",
      steps: [{ title: "Choose your piece", body: "Pick from the collection and review the size guidance." }, { title: "Use fit support if needed", body: "A stylist can help with sizing, a custom request, or your occasion." }, { title: "Pay securely", body: "Complete payment for the piece you have chosen." }, { title: "Atelier follows up", body: "After payment, the atelier confirms making details and production next steps." }],
      ctaLabel: "Start Your Fitting",
    },
    confidence: {
      eyebrow: "The SOSO way", title: "A premium purchase should feel clear.",
      items: [{ title: "Choose with confidence", body: "Explore a considered collection and use product-specific sizing support." }, { title: "Pay first, atelier follows", body: "After payment, the atelier confirms your selected size, finish direction and production timing." }, { title: "Speak to a person", body: "A stylist is available for product, fitting and bespoke direction." }],
      marquee: ["Kaftans", "Agbadas", "Dashikis", "Refined tailoring", "Fit guidance", "Stylist support"],
    },
    story: { imageUrl: "/images/soso/dashiki.jpg", logoUrl: "/images/soso/logo.png", title: "The Architect of the Modern Man.", body: "SOSO approaches menswear with proportion, restraint, and intent. Each piece is considered for presence, with sizing support available when you need it.", link: { label: "Discover the house", href: "/shop" } },
    finalCta: { eyebrow: "Ready when you are", title: "Your next piece starts here.", body: "Shop Standard or Custom directly. A SOSO stylist is available if you would like fit or occasion guidance.", primaryCta: { label: "Shop the Collection", href: "/shop" }, stylistCtaLabel: "Ask a stylist", note: "Dispatch within five days is a dispatch estimate, not a delivery guarantee." },
  },
  pages: {
    shop: {
      seo: { title: "Shop premium menswear | SOSO Africa", description: "Browse SOSO Africa kaftans, agbadas, dashikis, two-piece sets and shirts in Standard sizes or Custom." },
      eyebrow: "Ready now · Made immediately · Custom", title: "Shop SOSO", intro: "Discover the current collection and refine by category, fit, colour, size, price or fulfilment.",
      allFilterLabel: "All", emptyMessage: "No pieces are published in this collection yet.", productCtaLabel: "View piece", collectionNotFoundTitle: "Collection not found",
      collectionNotFoundCta: { label: "View all pieces", href: "/shop" }, collectionEmptyMessage: "No pieces are published in this collection yet.", allCollectionsLabel: "All pieces",
      searchLabel: "Search the collection", searchPlaceholder: "Search by piece, colour, fabric or fit", noSearchResultsMessage: "No pieces match those refinements. Reset the filters to explore the full collection.",
      newLabel: "New", readyNowLabel: "Ready now", madeImmediatelyLabel: "Made immediately", unavailableLabel: "Unavailable",
      departmentLabels: { men: "Men", women: "Women", accessories: "Accessories" },
      departmentsAriaLabel: "Shop departments", controlsAriaLabel: "Catalogue controls",
      sizeFilterLabel: "Size", colourFilterLabel: "Colour", minimumPriceLabel: "Minimum price (₦)", maximumPriceLabel: "Maximum price (₦)",
      clearSearchLabel: "Clear catalogue search", sortLabel: "Sort products",
      sortOptions: { featured: "Featured", newest: "New arrivals", priceAscending: "Price: low to high", priceDescending: "Price: high to low" },
      refineLabel: "Refine", refineProductsTitle: "Refine products", closeFiltersLabel: "Close product filters",
      categoryLabel: "Category", fulfilmentLabel: "Fulfilment", activeFiltersLabel: "Active Filters:",
      searchFilterLabel: "Search:", removeSearchFilterLabel: "Remove search filter", removeCategoryFilterLabel: "Remove category filter",
      removeFulfilmentFilterLabel: "Remove fulfilment filter", removeSizeFilterLabel: "Remove size filter",
      removeColourFilterLabel: "Remove colour filter", removePriceFilterLabel: "Remove price filter",
      priceFilterLabel: "Price:", maximumPriceValueLabel: "Max", resultCountSingular: "piece", resultCountPlural: "pieces",
      clearAllLabel: "Clear all", resetFiltersLabel: "Reset filters", resetLabel: "Reset", viewResultsLabel: "View",
      departments: {
        men: {
          seo: { title: "Shop premium menswear | SOSO Africa", description: "Browse SOSO Africa kaftans, agbadas, dashikis, two-piece sets and shirts in Standard sizes or Custom." },
          eyebrow: "Men · Ready now · Made immediately · Custom", title: "Men at SOSO", intro: "Considered menswear for presence, with Standard and Custom routes where each piece allows.",
        },
        women: {
          seo: { title: "Women’s ready-to-wear | SOSO Africa", description: "Discover SOSO Africa women’s ready-to-wear, with considered silhouettes available in Standard sizes." },
          eyebrow: "Women · Ready-to-wear", title: "Women at SOSO", intro: "A curated ready-to-wear collection shaped with the same restraint, proportion, and presence.",
        },
        accessories: {
          seo: { title: "Accessories | SOSO Africa", description: "Discover SOSO Africa accessories when the first collection is ready." },
          eyebrow: "Accessories", title: "The finishing pieces", intro: "A considered accessories collection will be published when the first pieces are ready.",
        },
      },
    },
    faq: {
      seo: { title: "Frequently asked questions | SOSO Africa", description: "Answers about SOSO Africa ordering, sizing, care, delivery and secure payment." },
      eyebrow: "Support", title: "Frequently Asked Questions", intro: "Everything you need to choose your piece with confidence.", listAriaLabel: "Frequently asked questions",
      helpText: "Still have a question? Ask a SOSO stylist.", allFilterLabel: "All",
      shopCta: { label: "Browse the collection", href: "/shop" },
      policiesCta: { label: "View policies", href: "/policies" },
    },
    about: {
      seo: {
        title: "About SOSO Africa | Bespoke Menswear, Abuja",
        description: "SOSO Africa is a bespoke menswear house based in Abuja, Nigeria, specialising in kaftans, agbadas, dashikis, and shirting made to order for the individual.",
      },
      hero: {
        eyebrow: "The House", title: "SOSO Africa",
        body: "A bespoke menswear house, based in Abuja. Every garment is made for the person who orders it.",
      },
      whatWeMake: {
        heading: "What We Make",
        paragraphs: [
          "SOSO specialises in considered menswear for significant occasions and everyday presence — kaftans, agbadas, dashikis, two-piece sets, and refined shirts.",
          "The collection combines Standard sizing and Custom. Some Standard pieces are ready now; others are made immediately by the atelier after you order.",
        ],
      },
      howItWorks: {
        heading: "How It Works",
        steps: [
          "Browse the collection and select a piece.",
          "Choose a standard size or opt for Custom.",
          "Ask a SOSO stylist a question at any point — optional.",
          "Pay securely.",
          "The atelier contacts you to confirm making details.",
          "Your garment is made and fulfilled.",
        ],
      },
      location: {
        heading: "Abuja, Nigeria",
        columns: [
          [
            "SOSO is rooted in Abuja and in the broader tradition of West African menswear. The silhouettes, occasions, and cultural contexts that shape each piece are drawn from the world the wearer actually inhabits.",
            "The house makes garments for owambes, board meetings, weddings, and the days between them — without reducing any occasion to a category.",
          ],
          [
            "Sizing guidance and stylist support are part of the service — not an afterthought. You can ask a question at any point in the process, without creating an account or committing to a purchase.",
            "The Journal explores the ideas and contexts behind the collection — craft, occasion dressing, and the continuing narrative of African luxury menswear.",
          ],
        ],
      },
      primaryCta: { label: "Explore the collection", href: "/shop" },
      secondaryCta: { label: "Read the Journal", href: "/journal" },
      stylistCtaLabel: "Ask a stylist",
    },
    journal: { seo: { title: "The Journal | SOSO Africa", description: "Reflections on bespoke tailoring, cultural heritage, and the evolving narrative of African luxury from SOSO Africa." }, heading: "The Journal", intro: "Reflections on the craft of bespoke tailoring, cultural heritage, and the evolving narrative of African luxury.", loadingMessage: "Curating articles...", errorMessage: "Unable to load the journal at this time.", emptyMessage: "No articles published yet.", fallbackMark: "SOSO", readCtaLabel: "Read Article", loadingSeo: { title: "The Journal | SOSO Africa", description: "SOSO Africa Journal." }, notFoundSeo: { title: "Article not found | SOSO Africa", description: "The requested SOSO Africa Journal article is not available." }, notFoundTitle: "Article Not Found", notFoundMessage: "The requested journal entry could not be located.", backCta: { label: "Back to Journal", href: "/journal" }, updatedLabel: "Updated", byLabel: "By", writtenByLabel: "Written By", shareLabel: "Share article", copiedLabel: "Link copied", relatedProductsHeading: "Explore the pieces", relatedArticlesHeading: "Continue reading" },
    policies: {
      seo: { title: "Policies & support | SOSO Africa", description: "SOSO Africa customer policies and garment care information." },
      eyebrow: "Customer information",
      title: "Policies & support",
      intro: "Clear, consolidated information for a made-to-order SOSO purchase.",
      cardLabel: "Read policy",
      openLabel: "Open document →",
      emptyMessage: "No published policies are available at this time.", loadingMessage: "Loading the published policy…", unavailableMessage: "This policy has not been published or is temporarily unavailable.", approvedLabel: "Customer policy · approved version", effectiveMessage: "This is the current effective version approved for publication.", privacyRequest: { eyebrow: "Privacy request", title: "Request access or deletion", body: "Submit an access or deletion request below. We will verify your identity before taking action, to help protect personal information.", acceptedMessage: "Your request has been received for review. We will contact you to verify your identity before processing it.", anotherLabel: "Submit another request", requestTypeLabel: "Request type", accessLabel: "Access my personal data", deletionLabel: "Delete my personal data", emailLabel: "Email address", nameLabel: "Name", optionalLabel: "optional", submitLabel: "Submit privacy request", submittingLabel: "Submitting request…", invalidEmailMessage: "Enter a valid email address so we can contact you about this request.", submitError: "We could not submit your request right now. Please wait a moment and try again." },
    },
    checkout: { seo: { title: "Secure checkout | SOSO Africa", description: "Complete secure payment for your SOSO Africa order. Atelier making details are confirmed after payment." }, backCta: { label: "Continue shopping", href: "/shop" }, eyebrow: "Checkout", title: "Complete your order", intro: "Pay securely for your selected piece. After payment, the atelier confirms the selected size, fabric or finish direction, and production timing. Have a question first? Speak with a stylist.", emptyMessage: "Your cart is empty.", emptyCta: { label: "Explore the collection", href: "/shop" }, nameLabel: "Full name", phoneLabel: "Phone number", emailLabel: "Email", addressLabel: "Delivery address", notesLabel: "Delivery notes", optionalLabel: "optional", deliveryNote: "Delivery fees and final order totals are confirmed securely by JusticeSure before payment. Pickup will appear here when SOSO’s JusticeSure locations are published.", paymentUnavailableMessage: "We could not open secure payment. Please try again or speak with a SOSO stylist.", retryLabel: "Retry secure payment", returnToBagLabel: "Return to your cart", processingLabel: "Opening secure payment…", paymentLabel: "Continue to payment", secureNote: "Secure payment first · atelier confirmation follows.", legalLinks: [{ label: "Privacy & cookies", href: "/privacy" }, { label: "Terms", href: "/terms" }, { label: "Delivery, returns & refunds", href: "/delivery-returns" }], stylistLabel: "Ask a stylist", bagTitle: "Your cart", sizeQuantityLabel: "Size {size} · Qty {quantity}", subtotalLabel: "Subtotal", stylistCtaLabel: "Order with a stylist" },
    paymentReturn: { seo: { title: "Payment status | SOSO Africa", description: "Secure payment status for your SOSO Africa order." }, eyebrow: "Secure order update", missingAttemptMessage: "This payment return link is incomplete. No payment result can be confirmed here.", statusUnavailableMessage: "Payment status is unavailable.", paidTitle: "Payment confirmed", cancelledTitle: "Payment was not completed", pendingTitle: "Checking payment status", paidBody: "JusticeSure has confirmed your payment. The SOSO atelier will follow up with the next making details.", cancelledBody: "JusticeSure has not confirmed a payable order. You can return to your cart and try again when ready.", pendingBody: "A return from a payment provider is not confirmation by itself. We are waiting for JusticeSure’s verified order status.", orderReferenceLabel: "Order reference:", authoritativeTotalLabel: "Authoritative total:", errorSuffix: "No payment is confirmed by this page.", pendingNotice: "Please keep this page open while we check.", retryHelp: "Your local cart has not been changed. Return to it to review the exact piece and selected size before trying secure payment again.", reviewLabel: "Review", sizeLabel: "size", quantityLabel: "Qty", measurementSyncError: "Failed to sync atelier requirements.", noticeLabel: "Notice", measurementsTitle: "Atelier Measurements", requiredMeasurementsGuidance: "Please provide measurements for your Custom pieces. We begin production only after your measurements are confirmed.", optionalMeasurementsGuidance: "Your Custom measurements remain available here with their current atelier status.", measurementInvalidErrorTemplate: "Please provide a valid number for {label}", measurementRangeErrorTemplate: "{label} must be between {min} and {max} {unit}", measurementConflictError: "This measurement was updated elsewhere. Please refresh the page to see the latest version.", measurementSubmitError: "Failed to submit measurements.", measurementStatusLabels: { needed: "Measurements Needed", submitted: "Submitted (Awaiting Review)", clarification_requested: "Clarification Requested", confirmed: "Confirmed by Atelier", cancelled: "Cancelled" }, atelierNoteLabel: "Atelier Note", productionExceptionLabel: "Production Exception", unitLabel: "Unit:", unitsGroupAriaLabel: "Measurement units", measurementFieldLabels: { height: "Height", chest: "Chest", waist: "Waist", hips: "Hips", shoulder: "Shoulder", sleeve: "Sleeve", garmentLength: "Garment Length" }, lineLabel: "Line", baseSizeLabel: "Base size:", additionalNotesLabel: "Additional Notes for Atelier", optionalLabel: "Optional", centimetersUnitLabel: "CM", inchesUnitLabel: "IN", optionalContextPlaceholder: "Optional context about these measurements", submittingMeasurementsLabel: "Submitting...", submitMeasurementsLabel: "Submit Measurements", updateMeasurementsLabel: "Update Measurements", returnBagCta: { label: "Return to your cart", href: "/checkout" }, continueCta: { label: "Continue shopping", href: "/shop" }, retryCta: { label: "Retry checkout", href: "/checkout" }, returnCheckoutCta: { label: "Return to checkout", href: "/checkout" } },
    notFound: { seo: { title: "Page not found | SOSO Africa", description: "The SOSO Africa page you are looking for is not available." }, title: "This piece is not in the collection.", body: "Return to the collection to discover the SOSO pieces ready for your direction.", cta: { label: "Shop the collection", href: "/shop" } },
  },
  products: [
    product("vault", "Vault", "/images/soso/vault-black.jpg", 250000, "Signature", "A considered black kaftan", "Kaftans", "A signature SOSO kaftan with a clean, contemporary silhouette. Select a size for a ready-to-wear fit or choose Custom to begin a made-to-measure conversation."),
    product("ivory-kaftan", "Ivory Ascension Kaftan", "/images/soso/kaftan-white.jpg", 240000, "Collection", "Ivory for ceremonial occasions", "Kaftans", "An ivory kaftan designed for formal celebrations and important occasions. Speak with a SOSO stylist if you would like help choosing your fit."),
    product("sovereign-agbada", "The Sovereign Agbada", "/images/soso/agbada.jpg", 480000, "Occasion", "A three-piece agbada statement", "Agbadas", "A three-piece agbada for grand occasions. After payment, the atelier confirms requested finish and production timing."),
    {
      ...product("heritage-dashiki", "Heritage Dashiki", heritageDashikiImageSrc, 165000, "Collection", "Contemporary cut, heritage lines", "Dashikis", "A contemporary dashiki that brings a refined silhouette to everyday and celebratory dressing."),
      colourOptions: defaultColourOptions("As shown").map((option) => (
        option.id === "as-shown" ? { ...option, hex: "#111111" } : option
      )).filter((option) => option.id !== "soso-black"),
    },
    product("boardroom-shirt", "The Boardroom Shirt", "/images/soso/shirts.jpg", 150000, "Collection", "A sharp shirt for business days", "Shirts", "A refined shirt designed for business and formal settings. A SOSO stylist can help with sizing before you place an order."),
    product("twin-set", "Twin Set — Two Piece", "/images/soso/twopiece.jpg", 220000, "Collection", "Coordinated, relaxed tailoring", "Two-Piece", "A coordinated two-piece set with an easy, polished presence. Select your usual size or choose Custom for made-to-measure support."),
    ...womenReadyToWearProducts,
  ],
  collections: [
    { slug: "kaftans", label: "Kaftans", category: "Kaftans", department: "men", h1: "Kaftans", intro: "Considered kaftans for significant occasions and daily distinction. Each piece is made to order for the person who wears it.", seo: { title: "Bespoke Kaftans | SOSO Africa, Abuja", description: "Premium made-to-order kaftans from SOSO Africa. Contemporary silhouettes made for the individual in Abuja, Nigeria." } },
    { slug: "agbadas", label: "Agbadas", category: "Agbadas", department: "men", h1: "Agbadas", intro: "Statement three-piece agbadas for ceremonies, celebrations, and moments that require presence.", seo: { title: "Bespoke Agbadas | SOSO Africa, Abuja", description: "Made-to-order agbadas from SOSO Africa, Abuja. Generous three-piece sets for grand occasions." } },
    { slug: "dashikis", label: "Dashikis", category: "Dashikis", department: "men", h1: "Dashikis", intro: "Heritage craft in a contemporary silhouette — dashikis for celebration and the days in between.", seo: { title: "Modern Dashikis | SOSO Africa, Abuja", description: "Contemporary made-to-order dashikis from SOSO Africa." } },
    { slug: "two-piece", label: "Two-Piece Sets", category: "Two-Piece", department: "men", h1: "Two-Piece Sets", intro: "Coordinated and effortless — two-piece sets that move between occasions.", seo: { title: "Two-Piece Sets | SOSO Africa, Abuja", description: "Coordinated two-piece sets from SOSO Africa, made to order in Abuja." } },
    { slug: "shirts", label: "Shirts", category: "Shirts", department: "men", h1: "Shirts", intro: "Sharp, considered shirting for business settings and formal occasions.", seo: { title: "Premium Men's Shirts | SOSO Africa, Abuja", description: "Refined made-to-order shirts from SOSO Africa." } },
    { slug: "new-arrivals", label: "New Arrivals", category: "New Arrivals", department: "men", h1: "New Arrivals", intro: "The latest SOSO pieces, with online purchase shown only where an authoritative checkout mapping is available.", seo: { title: "New Arrivals | SOSO Africa", description: "Discover the latest SOSO Africa pieces." } },
    womenReadyToWearCollection,
  ],
  sizeGuide: {
    title: "Size guide", intro: "Use these finished-garment measurements as a starting point. Ask a stylist if you are between sizes.",
    columns: ["Chest", "Length", "Sleeve"], rows: [
      { size: "S", values: ["38–40", "44", "24.5"] }, { size: "M", values: ["41–43", "45", "25"] },
      { size: "L", values: ["44–46", "46", "25.5"] }, { size: "XL", values: ["47–49", "47", "26"] },
      { size: "XXL", values: ["50–52", "48", "26.5"] },
    ], customHelp: "Choose Custom and the atelier will collect the measurements required for your piece after payment.",
  },
  productCopy: {
    seoTitleSuffix: "SOSO Africa",
    seoDescriptionSuffix: "View current price and speak to a SOSO stylist for fit assistance.",
    categorySuffix: "Made in Abuja",
    detailImageAltSuffix: "detail", sizeGuideCloseLabel: "Close",
    madeToOrderLabel: "Made immediately", sizeSelectorLabel: "Standard sizes", sizePrompt: "View size guide",
    customSizeHelp: "The atelier will collect your measurements after payment.", standardSizeHelp: "Use the size guide or ask a stylist before ordering.",
    colourLabel: "Colour", fabricLabel: "Fabric", fitLabel: "Fit",
    readyNowLabel: "Ready now", madeImmediatelyLabel: "Made immediately", unavailableLabel: "Unavailable",
    dispatchLabel: "Dispatch estimate", dispatchNotDeliveryMessage: "This is a dispatch estimate, not a guarantee of delivery within five days.",
    standardUnavailableMessage: "Standard sizing is not available for this piece.",
    customUnavailableMessage: "Custom sizing is not available for this piece.",
    sizeRequiredLabel: "Select a size to continue", mobileSizeRequiredLabel: "Choose size", addToBagLabel: "Add to cart",
    newLabel: "New In", viewProductLabel: "View", quickShopTitle: "Quick Shop", closeQuickShopLabel: "Close quick shop",
    customSizingLabel: "Custom atelier sizing", selectedLabel: "Selected",
    unmappedPurchaseMessage: "Online purchase options are not mapped for this piece yet. View the full details for fit and stylist support.",
    onlinePurchaseUnavailableLabel: "Online purchase unavailable", unavailableInSizeLabel: "Unavailable in size", viewFullDetailsLabel: "View full details",
    productUnmappedPurchaseMessage: "Online purchase options are not mapped for this piece yet. Fit guidance and stylist support remain available.", addToBagPriceSeparator: "—",
    homeBreadcrumbLabel: "Home", shopBreadcrumbLabel: "Shop", breadcrumbAriaLabel: "Breadcrumb", returnToResultsLabel: "Return to results",
    previousImageLabel: "Previous image", nextImageLabel: "Next image", zoomInImageLabel: "Zoom in on product image", zoomOutImageLabel: "Zoom out of product image", imageCreditLabel: "Image:",
    customLabel: "Custom", compositionCareHeading: "Composition & Care", deliveryReturnsHeading: "Delivery & Returns",
    compositionLabel: "Composition", careLabel: "Care", deliveryLabel: "Delivery", returnsLabel: "Returns",
    trustItems: [
      { title: "Fit support", body: "Size guide and stylist help" },
      { title: "Made to order", body: "Atelier confirms making details after payment" },
      { title: "Order support", body: "Questions answered by a SOSO stylist" },
    ],
    marqueeText: "The Architect of the Modern Man", marqueeSymbol: "✦",
    detailsEyebrow: "Before you order",
    detailsHeading: "Details", details: [{ title: "Made for you", body: "Produced after payment for the person who orders it." }, { title: "Atelier confirmed", body: "Finish direction and production timing are confirmed after payment." }],
    assurancesEyebrow: "No surprises",
    assurancesHeading: "Buying premium online should feel safe. Here it is, in writing.",
    assurances: [{ title: "Sizing support", body: "Use the guide or speak with a stylist." }, { title: "Secure payment", body: "Card details are handled by the hosted payment provider." }, { title: "Delivery guidance", body: "Options are confirmed for your location." }],
    relatedHeading: "You may also consider",
    fitAssistant: {
      title: "Fit assistant",
      intro: "Share a few details to prepare for a stylist conversation. This is not a size recommendation and it will not select a size for you.",
      heightLabel: "Height", weightLabel: "Weight", chestLabel: "Chest",
      preferredFitLabel: "Preferred fit", preferredFitPlaceholder: "Select one",
      preferredFitOptions: [
        { value: "closer", label: "Closer" }, { value: "balanced", label: "Balanced" },
        { value: "relaxed", label: "Relaxed" }, { value: "unsure", label: "Not sure" },
      ],
      occasionLabel: "Occasion", occasionPlaceholder: "e.g. wedding or evening event",
      submitLabel: "Prepare details for a stylist",
      submittedMessage: "Your details are ready to discuss. No size recommendation has been made, and these details are not sent automatically. A stylist can help you decide before you add to cart.",
    },
  },
  supportCopy: {
    stylistLabel: "Ask a stylist",
    stylistHelp: "A SOSO stylist can help with sizing, product and occasion questions before checkout.",
    productCtaLabel: "Ask about this piece",
    productHelp: "Have a question before you pay? Speak to a stylist for fit or bespoke guidance.",
    productDetailsCtaLabel: "Ask a stylist about this piece",
    fitCtaLabel: "Ask a stylist about fit",
    stylistDialog: {
      eyebrow: "Optional fit support",
      title: "Ask a SOSO stylist",
      productPrompt: "Ask about {productName}, sizing, or your occasion.",
      generalPrompt: "Ask about sizing, an occasion, or a piece you have in mind.",
      checkoutReassurance: "This does not pause or replace secure checkout.",
      closeLabel: "Close stylist enquiry",
      successTitle: "Your question has been sent.",
      successBody: "A SOSO stylist can follow up using the details you shared. You can still continue to your cart whenever you are ready.",
      backLabel: "Back to the piece",
      nameLabel: "Name",
      phoneLabel: "Phone",
      emailLabel: "Email",
      optionalLabel: "optional",
      questionLabel: "Your question",
      questionPlaceholder: "Tell us what you would like to know.",
      submitLabel: "Send question",
      pendingLabel: "Sending…",
      failureMessage: "We could not send your question just now. Please try again shortly.",
    },
  },
  interfaceCopy: {
    navigation: { shopAllLabel: "Shop All", featuredLabel: "Featured" },
    search: {
      emptyResultsMessage: "No matches found for", emptyResultsHelp: "Try checking the spelling or use different keywords.",
      searchCatalogueLabel: "Search entire catalogue", productsHeading: "Products", collectionsHeading: "Collections", viewAllLabel: "View all",
    },
  },
};

export function platformContentHash(content: unknown): string {
  const canonicalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, entry]) => [key, canonicalize(entry)]),
      );
    }
    return value;
  };
  return createHash("sha256").update(JSON.stringify(canonicalize(content))).digest("hex");
}

export function isProductUnavailable(product: { fulfilmentState: "ready_now" | "made_immediately" | "unavailable" }): boolean {
  return product.fulfilmentState === "unavailable";
}

export function mergePlatformContentDefaults(current: unknown): unknown {
  const mergeMissing = (defaults: unknown, value: unknown): unknown => {
    if (Array.isArray(defaults)) return Array.isArray(value) ? value : structuredClone(defaults);
    if (defaults && typeof defaults === "object") {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return structuredClone(defaults);
      }
      const merged: Record<string, unknown> = { ...(value as Record<string, unknown>) };
      for (const [key, defaultValue] of Object.entries(defaults)) {
        merged[key] = mergeMissing(defaultValue, merged[key]);
      }
      return merged;
    }
    return value === undefined ? defaults : value;
  };

  const currentContentVersion = current && typeof current === "object" && !Array.isArray(current)
    && typeof (current as Record<string, unknown>).contentVersion === "number"
    ? (current as Record<string, unknown>).contentVersion as number
    : 1;
  const shouldApplyWomenLaunch = currentContentVersion < 2;
  const shouldApplySiteSettingsLaunch = currentContentVersion < 3;
  // Hero motion and structured merchandising were both developed from version 4.
  // Version 6 unifies those parallel version-5 migrations and safely upgrades
  // documents created by either branch.
  const shouldApplyHeroVideoLaunch = currentContentVersion < 6;
  const shouldApplyHomepageMerchandising = currentContentVersion < 6;
  const shouldRemoveDefaultAnnouncements = currentContentVersion < 7;
  const shouldApplyHomepageCategoryLaunch = currentContentVersion < 8;
  const shouldApplyHomepageCategoryFields = currentContentVersion < 10;
  const shouldApplyNewArrivalsCollection = currentContentVersion < 11;
  const shouldApplyColourOptions = currentContentVersion < 15;
  const shouldApplyMaterialTurnSets = currentContentVersion < 16;
  const shouldNormalizeHeritageDashikiPalette = currentContentVersion < 17;
  const shouldRepairPartialCategoryRotation = currentContentVersion >= 17 && currentContentVersion < 19;
  const shouldRetireShippedDashikiVisualizer = currentContentVersion < 19;
  let upgradeSource = current;
  if (current && typeof current === "object" && !Array.isArray(current)) {
    upgradeSource = structuredClone(current);
    const site = (upgradeSource as { site?: Record<string, unknown> }).site;
    if (shouldApplySiteSettingsLaunch && site && !Array.isArray(site.announcementItems)) {
      const currentAnnouncement = typeof site.announcement === "string" && site.announcement.trim()
        ? site.announcement.trim()
        : DEFAULT_PLATFORM_CONTENT.site.announcement;
      site.announcementItems = [
        currentAnnouncement,
        ...DEFAULT_PLATFORM_CONTENT.site.announcementItems.slice(1),
      ];
    }
    if (shouldRemoveDefaultAnnouncements && site && Array.isArray(site.announcementItems)) {
      const previousDefaults = [
        "Ready now and made immediately · Dispatch within five days",
        "Made in Abuja · Designed for presence",
        "Standard sizes or Custom · Choose your route",
      ];
      if (
        site.announcementItems.length === previousDefaults.length
        && site.announcementItems.every((item, index) => item === previousDefaults[index])
      ) {
        site.announcementItems = [];
      }
    }
    const hero = (upgradeSource as {
      homepage?: { hero?: Record<string, unknown> };
    }).homepage?.hero;
    if (hero && typeof hero.imageUrl === "string") {
      if (hero.mediaMode === undefined) hero.mediaMode = "image";
      if (hero.mobileImageUrl === undefined) hero.mobileImageUrl = hero.imageUrl;
      const isLegacyDefaultHero = shouldApplyHeroVideoLaunch
        && hero.mediaMode === "image"
        && hero.imageUrl === "/images/soso/vault-black.jpg"
        && hero.mobileImageUrl === "/images/soso/vault-black.jpg"
        && hero.videoUrl === undefined
        && hero.mobileVideoUrl === undefined;
      if (isLegacyDefaultHero) {
        hero.mediaMode = "video";
        hero.videoUrl = DEFAULT_PLATFORM_CONTENT.homepage.hero.videoUrl;
        hero.mobileVideoUrl = DEFAULT_PLATFORM_CONTENT.homepage.hero.mobileVideoUrl;
      }
    }
    if (shouldApplyHomepageMerchandising) {
      const homepage = (upgradeSource as { homepage?: Record<string, unknown> }).homepage;
      if (homepage) {
        const featured = homepage.featured as Record<string, unknown> | undefined;
        if (featured && Array.isArray(featured.productSlugs) && featured.productSlugs.length !== 4) {
          featured.productSlugs = featured.productSlugs.slice(0, 4);
        }
        const occasions = homepage.occasions as { items?: unknown[] } | undefined;
        if (occasions && Array.isArray(occasions.items)) {
          occasions.items = occasions.items.slice(0, 2).map((item, index) => {
            if (!item || typeof item !== "object" || Array.isArray(item) || "imageAlt" in item) return item;
            return { ...item, imageAlt: DEFAULT_PLATFORM_CONTENT.homepage.occasions.items[index]?.imageAlt };
          });
        }
      }
    }
    if (shouldApplyHomepageCategoryFields) {
      const homepage = (upgradeSource as { homepage?: { categories?: { items?: unknown[] }; occasions?: { items?: unknown[] } } }).homepage;
      if (homepage?.categories?.items && Array.isArray(homepage.categories.items)) {
        const normalized = homepage.categories.items.map((item, index) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return item;
          const authored = item as Record<string, unknown>;
          const defaults = typeof authored.href === "string"
            ? DEFAULT_PLATFORM_CONTENT.homepage.categories.items.find((candidate) => candidate.href === authored.href)
            : DEFAULT_PLATFORM_CONTENT.homepage.categories.items[index];
          return {
            ...item,
            // A noncanonical legacy target must never be surfaced as a category.
            // Its authored media/copy is retained through this normalization until
            // a required canonical slot deterministically replaces it below.
            description: "description" in item ? authored.description : defaults?.description ?? `Discover the ${typeof authored.title === "string" ? authored.title : "collection"}.`,
            active: defaults ? ("active" in item ? authored.active : defaults.active) : false,
            imageMode: "imageMode" in item ? authored.imageMode : defaults?.imageMode,
            rotationMs: "rotationMs" in item ? authored.rotationMs : defaults?.rotationMs,
          };
        });
        // Five fixed public slots are required. Keep each authored canonical tile
        // (including its edited copy and media), once, then supply defaults for
        // missing slots. Incompatible legacy records are retired/replaced only
        // because retaining them would make the exact five-slot public contract
        // impossible; no synthetic search or destination is invented.
        const canonicalTargets = new Set(DEFAULT_PLATFORM_CONTENT.homepage.categories.items.map((item) => item.href));
        const retainedCanonical: Record<string, unknown>[] = [];
        const seenTargets = new Set<string>();
        normalized.forEach((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return;
          const record = item as Record<string, unknown>;
          if (typeof record.href === "string" && canonicalTargets.has(record.href) && !seenTargets.has(record.href)) {
            retainedCanonical.push(record);
            seenTargets.add(record.href);
          }
        });
        homepage.categories.items = [
          ...retainedCanonical,
          ...DEFAULT_PLATFORM_CONTENT.homepage.categories.items
            .filter((defaults) => !seenTargets.has(defaults.href))
            .map((defaults) => structuredClone(defaults)),
        ];
      }
      // Replace only the former untouched seeded order; authored occasion copy
      // remains exactly as the merchant entered it.
      if (homepage?.occasions?.items && Array.isArray(homepage.occasions.items)
        && homepage.occasions.items.map((item) => item && typeof item === "object" ? (item as { title?: unknown }).title : undefined).join("|") === "The Wedding|The Boardroom") {
        homepage.occasions.items.reverse();
      }
    }
    if (shouldApplyNewArrivalsCollection) {
      const collections = (upgradeSource as { collections?: unknown[] }).collections;
      if (Array.isArray(collections) && !collections.some((item) =>
        item && typeof item === "object" && !Array.isArray(item) && (item as { slug?: unknown }).slug === "new-arrivals")) {
        const newArrivals = DEFAULT_PLATFORM_CONTENT.collections.find((item) => item.slug === "new-arrivals");
        if (newArrivals) collections.push(structuredClone(newArrivals));
      }
    }
    const categoryItems = (upgradeSource as {
      homepage?: { categories?: { items?: unknown[] } };
    }).homepage?.categories?.items;
    if (Array.isArray(categoryItems)) {
      const shippedImageByTarget = new Map([
        ["/collections/kaftans", "/images/soso/vault-black.jpg"],
        ["/collections/agbadas", "/images/soso/agbada.jpg"],
        ["/collections/shirts", "/images/soso/shirts.jpg"],
        ["/collections/dashikis", "/images/soso/dashiki.jpg"],
        ["/collections/two-piece", "/images/soso/twopiece.jpg"],
      ]);
      categoryItems.forEach((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return;
        const record = item as Record<string, unknown>;
        const target = typeof record.href === "string" ? record.href : "";
        const shippedImage = shippedImageByTarget.get(target);
        const currentImages = record.imageUrls;
        const hasMissingCrossfadeImages = shouldRepairPartialCategoryRotation
          && (currentImages === undefined || (Array.isArray(currentImages) && currentImages.length === 0))
          && record.imageMode === "crossfade";
        const hasOnlyShippedImage = currentImages === undefined
          || (Array.isArray(currentImages) && currentImages.length === 1 && currentImages[0] === shippedImage);
        const hasNoMobileSet = record.mobileImageUrls === undefined
          || (Array.isArray(record.mobileImageUrls) && record.mobileImageUrls.length === 0);
        const hasShippedMotion = (record.imageMode === undefined || record.imageMode === "static")
          && (record.rotationMs === undefined || record.rotationMs === 5000);
        if (!shippedImage || record.imageUrl !== shippedImage || !hasNoMobileSet) return;
        const defaults = DEFAULT_PLATFORM_CONTENT.homepage.categories.items.find((candidate) => candidate.href === target);
        if (!defaults) return;
        if (hasMissingCrossfadeImages) {
          record.imageUrls = structuredClone(defaults.imageUrls);
          record.rotationMs = defaults.rotationMs;
          return;
        }
        if (!hasOnlyShippedImage || !hasShippedMotion) return;
        record.imageUrls = structuredClone(defaults.imageUrls);
        record.imageMode = defaults.imageMode;
        record.rotationMs = defaults.rotationMs;
      });
    }
    if (site) {
      const footer = site.footer;
      if (footer && typeof footer === "object" && !Array.isArray(footer)) {
        const footerRecord = footer as Record<string, unknown>;
        const columns = footerRecord.columns;
        const shippedColumns = [
          { heading: "Explore", links: [{ label: "Shop", href: "/shop" }, { label: "Journal", href: "/journal" }, { label: "FAQ", href: "/faq" }] },
          { heading: "Collections", links: [{ label: "Kaftans", href: "/collections/kaftans" }, { label: "Agbadas", href: "/collections/agbadas" }, { label: "Shirts", href: "/collections/shirts" }] },
        ];
        if (platformContentHash(columns) === platformContentHash(shippedColumns)) {
          footerRecord.columns = structuredClone(DEFAULT_PLATFORM_CONTENT.site.footer.columns);
        }
        const legalLinks = footerRecord.legalLinks;
        const shippedLegalLinks = [{ label: "Privacy", href: "/policies/privacy" }, { label: "Terms", href: "/policies/terms" }];
        if (platformContentHash(legalLinks) === platformContentHash(shippedLegalLinks)) {
          footerRecord.legalLinks = structuredClone(DEFAULT_PLATFORM_CONTENT.site.footer.legalLinks);
        }
      }
    }
  }
  const merged = mergeMissing(DEFAULT_PLATFORM_CONTENT, upgradeSource);
  if (merged && typeof merged === "object") {
    const mergedHero = (merged as {
      homepage?: { hero?: Record<string, unknown> };
    }).homepage?.hero;
    if (mergedHero?.mediaMode === "image") {
      delete mergedHero.videoUrl;
      delete mergedHero.mobileVideoUrl;
    }
    if (shouldApplyHomepageMerchandising) {
      const document = merged as {
        products?: Array<{ slug?: unknown }>;
        collections?: Array<{ slug?: unknown }>;
        homepage?: {
          categories?: { items?: Array<Record<string, unknown>> };
          newArrival?: { productSlug?: unknown };
          featured?: { productSlugs?: unknown[]; legacySparseCompatibility?: unknown };
          occasions?: { items?: unknown[] };
        };
      };
      const availableSlugs = (document.products ?? []).flatMap((product) => typeof product.slug === "string" ? [product.slug] : []);
      const collectionSlugs = new Set((document.collections ?? []).flatMap((collection) => typeof collection.slug === "string" ? [collection.slug] : []));
      const isCurrentHomepageTarget = (target: unknown): target is string => {
        if (typeof target !== "string") return false;
        if (target.startsWith("https://")) return true;
        if (["/journal", "/faq", "/about", "/#whatsapp"].includes(target) || target === "/shop" || target.startsWith("/shop?")) return true;
        const productMatch = target.match(/^\/product\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);
        if (productMatch) return availableSlugs.includes(productMatch[1]!);
        const collectionMatch = target.match(/^\/collections\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);
        return Boolean(collectionMatch && collectionSlugs.has(collectionMatch[1]!));
      };
      const categories = document.homepage?.categories;
      if (categories) {
        const uniqueTargets = new Set<string>();
        const selected = (categories.items ?? []).filter((item) => {
          if (!isCurrentHomepageTarget(item.href) || uniqueTargets.has(item.href)) return false;
          uniqueTargets.add(item.href);
          return true;
        }).slice(0, 5);
        const fallbacks = DEFAULT_PLATFORM_CONTENT.homepage.categories.items.map((item, index) => {
          const collectionTarget = item.href.match(/^\/collections\/(.+)$/)?.[1];
          const target = collectionTarget && collectionSlugs.has(collectionTarget)
            ? item.href
            : `/shop?search=${encodeURIComponent(item.title)}&homeCategory=${index + 1}`;
          return { ...item, href: target, active: Boolean(collectionTarget && collectionSlugs.has(collectionTarget)) };
        });
        for (const fallback of fallbacks) {
          if (selected.length === 5) break;
          if (!uniqueTargets.has(fallback.href)) {
            selected.push(fallback);
            uniqueTargets.add(fallback.href);
          }
        }
        categories.items = selected;
      }
      const featured = document.homepage?.featured;
      if (featured) {
        const selected = Array.isArray(featured.productSlugs)
          ? featured.productSlugs.filter((value): value is string => typeof value === "string" && availableSlugs.includes(value))
          : [];
        const curated = [...new Set([...selected, ...availableSlugs])].slice(0, 4);
        // A sparse legacy catalogue cannot satisfy four distinct products without
        // resurrecting retired products. Repeat its first current product instead:
        // the exact-four layout remains available and new catalogues still reject duplicates.
        while (curated.length > 0 && curated.length < 4) curated.push(curated[0]!);
        featured.productSlugs = curated;
        if (availableSlugs.length > 0 && availableSlugs.length < 4) featured.legacySparseCompatibility = true;
        else delete featured.legacySparseCompatibility;
      }
      const newArrival = document.homepage?.newArrival;
      if (newArrival && (typeof newArrival.productSlug !== "string" || !availableSlugs.includes(newArrival.productSlug))) {
        newArrival.productSlug = availableSlugs[0];
      }
      const occasions = document.homepage?.occasions;
      if (occasions) {
        const currentItems = Array.isArray(occasions.items) ? occasions.items : [];
        occasions.items = [...currentItems, ...DEFAULT_PLATFORM_CONTENT.homepage.occasions.items].slice(0, 2);
      }
    }
    // Version 6 already materialized its complete category layout, including
    // safe search fallbacks for retired collections. Do not reinterpret those
    // generated fallback targets as missing v8 entries.
    if (shouldApplyHomepageCategoryLaunch && !shouldApplyHomepageMerchandising) {
      const categories = (merged as {
        homepage?: { categories?: { items?: unknown[] } };
      }).homepage?.categories;
      if (categories && Array.isArray(categories.items)) {
        // Category targets, rather than serialized tiles, identify the approved
        // entries: JSONB can reorder keys and merchants may edit any copy or
        // image field. Preserve authored order and append only the new targets.
        const approvedTargets = new Set(DEFAULT_PLATFORM_CONTENT.homepage.categories.items.map((item) => item.href));
        const existingTargets = new Set(categories.items.flatMap((item) =>
          item && typeof item === "object" && !Array.isArray(item)
          && typeof (item as Record<string, unknown>).href === "string"
          && approvedTargets.has((item as Record<string, unknown>).href as string)
            ? [(item as Record<string, unknown>).href as string]
            : []));
        for (const approved of DEFAULT_PLATFORM_CONTENT.homepage.categories.items) {
          if (!existingTargets.has(approved.href)) {
            categories.items.push(structuredClone(approved));
            existingTargets.add(approved.href);
          }
        }
      }
    }
    const setKnownCopy = (path: string[], previous: string, next: string) => {
      let target = merged as Record<string, unknown>;
      for (const segment of path.slice(0, -1)) {
        const child = target[segment];
        if (!child || typeof child !== "object") return;
        target = child as Record<string, unknown>;
      }
      const finalKey = path[path.length - 1]!;
      if (target[finalKey] === previous) target[finalKey] = next;
    };
    const knownCopyUpgrades: Array<[string[], string, string]> = [
      [["site", "announcement"], "Fit guidance if you need it · Atelier details confirmed after payment", DEFAULT_PLATFORM_CONTENT.site.announcement],
      [["site", "footer", "description"], "Bespoke menswear house, Abuja. Kaftans, agbadas, dashikis and shirting — made to order for the individual.", DEFAULT_PLATFORM_CONTENT.site.footer.description],
      [["homepage", "hero", "eyebrow"], "Bespoke Menswear · Abuja, Nigeria", DEFAULT_PLATFORM_CONTENT.homepage.hero.eyebrow],
      [["homepage", "hero", "eyebrow"], "New season · Ready now & made immediately", DEFAULT_PLATFORM_CONTENT.homepage.hero.eyebrow],
      [["homepage", "hero", "title"], "Dress like the man", DEFAULT_PLATFORM_CONTENT.homepage.hero.title],
      [["homepage", "hero", "suffix"], "for.", DEFAULT_PLATFORM_CONTENT.homepage.hero.suffix],
      [["homepage", "hero", "accent"], "make way", DEFAULT_PLATFORM_CONTENT.homepage.hero.accent],
      [["homepage", "hero", "description"], "Premium kaftans, agbadas and refined separates from SOSO Africa. Explore the collection, use the size guide, or speak with a stylist before you place your order.", DEFAULT_PLATFORM_CONTENT.homepage.hero.description],
      [["homepage", "hero", "description"], "Shop premium kaftans, agbadas and refined separates in Standard sizes or Custom. Buy directly, with fit guidance and optional stylist support when you want it.", DEFAULT_PLATFORM_CONTENT.homepage.hero.description],
      [["homepage", "hero", "videoUrl"], "/media/soso-black-hero-desktop.mp4", DEFAULT_PLATFORM_CONTENT.homepage.hero.videoUrl!],
      [["homepage", "hero", "mobileVideoUrl"], "/media/soso-black-hero-mobile.mp4", DEFAULT_PLATFORM_CONTENT.homepage.hero.mobileVideoUrl!],
      [["homepage", "hero", "videoUrl"], "/media/soso-black-hero-desktop.webm", DEFAULT_PLATFORM_CONTENT.homepage.hero.videoUrl!],
      [["homepage", "hero", "mobileVideoUrl"], "/media/soso-black-hero-mobile.webm", DEFAULT_PLATFORM_CONTENT.homepage.hero.mobileVideoUrl!],
      [["homepage", "hero", "primaryCta", "label"], "Shop the Collection", DEFAULT_PLATFORM_CONTENT.homepage.hero.primaryCta.label],
      [["homepage", "hero", "primaryCta", "label"], "Explore the collection", DEFAULT_PLATFORM_CONTENT.homepage.hero.primaryCta.label],
      [["homepage", "hero", "primaryCta", "href"], "/shop", DEFAULT_PLATFORM_CONTENT.homepage.hero.primaryCta.href],
      [["homepage", "featured", "eyebrow"], "The Collection", DEFAULT_PLATFORM_CONTENT.homepage.featured.eyebrow],
      [["homepage", "featured", "title"], "Built for the occasion. Cut for you.", DEFAULT_PLATFORM_CONTENT.homepage.featured.title],
      [["homepage", "fit", "title"], "Buying bespoke online should not be a gamble.", DEFAULT_PLATFORM_CONTENT.homepage.fit.title],
      [["homepage", "finalCta", "title"], "Your next event is coming. Your outfit should already be sewing.", DEFAULT_PLATFORM_CONTENT.homepage.finalCta.title],
      [["pages", "shop", "eyebrow"], "Made to order", DEFAULT_PLATFORM_CONTENT.pages.shop.eyebrow],
      [["pages", "shop", "title"], "The Collection", DEFAULT_PLATFORM_CONTENT.pages.shop.title],
      [["pages", "shop", "intro"], "Hand-finished in our Abuja atelier. Built for presence.", DEFAULT_PLATFORM_CONTENT.pages.shop.intro],
      [["pages", "about", "whatWeMake", "paragraphs", "1"], "Every piece is made to order. Nothing in the collection is taken from a production rack. When you order from SOSO, your garment is made for you.", DEFAULT_PLATFORM_CONTENT.pages.about.whatWeMake.paragraphs[1]!],
      [["site", "header", "cartLabel"], "Bag", DEFAULT_PLATFORM_CONTENT.site.header.cartLabel],
      [["site", "cart", "title"], "Your Bag", DEFAULT_PLATFORM_CONTENT.site.cart.title],
      [["site", "cart", "emptyMessage"], "Your bag is empty.", DEFAULT_PLATFORM_CONTENT.site.cart.emptyMessage],
      [["site", "consent", "body"], "Necessary storage keeps your bag and privacy choice working. Optional measurement helps SOSO understand which pages are useful; marketing pixels stay off unless you grant marketing consent.", DEFAULT_PLATFORM_CONTENT.site.consent.body],
      [["site", "consent", "necessaryDescription"], "Necessary — bag, session, consent preference. Always active.", DEFAULT_PLATFORM_CONTENT.site.consent.necessaryDescription],
      [["pages", "checkout", "emptyMessage"], "Your bag is empty.", DEFAULT_PLATFORM_CONTENT.pages.checkout.emptyMessage],
      [["pages", "checkout", "returnToBagLabel"], "Return to your bag", DEFAULT_PLATFORM_CONTENT.pages.checkout.returnToBagLabel],
      [["pages", "checkout", "bagTitle"], "Your bag", DEFAULT_PLATFORM_CONTENT.pages.checkout.bagTitle],
      [["pages", "paymentReturn", "cancelledBody"], "JusticeSure has not confirmed a payable order. You can return to your bag and try again when ready.", DEFAULT_PLATFORM_CONTENT.pages.paymentReturn.cancelledBody],
      [["pages", "paymentReturn", "retryHelp"], "Your local bag has not been changed. Return to it to review the exact piece and selected size before trying secure payment again.", DEFAULT_PLATFORM_CONTENT.pages.paymentReturn.retryHelp],
      [["pages", "paymentReturn", "returnBagCta", "label"], "Return to your bag", DEFAULT_PLATFORM_CONTENT.pages.paymentReturn.returnBagCta.label],
      [["productCopy", "sizeSelectorLabel"], "Select size", DEFAULT_PLATFORM_CONTENT.productCopy.sizeSelectorLabel],
      [["productCopy", "sizePrompt"], "Select a size", DEFAULT_PLATFORM_CONTENT.productCopy.sizePrompt],
      [["productCopy", "addToBagLabel"], "Add to bag", DEFAULT_PLATFORM_CONTENT.productCopy.addToBagLabel],
      [["productCopy", "fitAssistant", "submittedMessage"], "Your details are ready to discuss. No size recommendation has been made, and these details are not sent automatically. A stylist can help you decide before you add to bag.", DEFAULT_PLATFORM_CONTENT.productCopy.fitAssistant.submittedMessage],
      [["supportCopy", "stylistDialog", "successBody"], "A SOSO stylist can follow up using the details you shared. You can still continue to your bag whenever you are ready.", DEFAULT_PLATFORM_CONTENT.supportCopy.stylistDialog.successBody],
    ];
    knownCopyUpgrades.forEach(([path, previous, next]) => setKnownCopy(path, previous, next));
    const catalogue = (merged as { products?: unknown }).products;
    if (Array.isArray(catalogue)) {
      const upgradedProducts = catalogue.map((entry) => {
        const upgraded = mergeMissing(hybridProductDefaults, entry);
        if (!upgraded || typeof upgraded !== "object" || Array.isArray(upgraded)) return upgraded;
        const productRecord = upgraded as Record<string, unknown>;
        if (shouldApplyColourOptions && !Array.isArray((entry as Record<string, unknown> | null)?.colourOptions)) {
          const legacyColour = typeof productRecord.colour === "string" ? productRecord.colour : "As shown";
          productRecord.colourOptions = defaultColourOptions(legacyColour);
        }
        if (shouldApplyColourOptions && productRecord.allowCustomColour === undefined) {
          productRecord.allowCustomColour = false;
        }
        if (Array.isArray(productRecord.images)) {
          productRecord.images = productRecord.images.map((entryImage) =>
            mergeMissing({ provenance: suppliedImageProvenance }, entryImage));
        }
        if (shouldApplyMaterialTurnSets && !Array.isArray(productRecord.materialTurnSets)) {
          // Existing galleries are intentionally not interpreted as front/back pairs.
          productRecord.materialTurnSets = [];
        }
        if (
          shouldNormalizeHeritageDashikiPalette
          && productRecord.slug === "heritage-dashiki"
          && productRecord.img === heritageDashikiImageSrc
          && Array.isArray(productRecord.images)
          && productRecord.images.some((image) => (
            image && typeof image === "object" && !Array.isArray(image)
            && (image as Record<string, unknown>).src === heritageDashikiImageSrc
          ))
        ) {
          if (Array.isArray(productRecord.colourOptions)) {
            let correctedDefaultAsShown = false;
            productRecord.colourOptions = productRecord.colourOptions.map((option) => {
              if (!option || typeof option !== "object" || Array.isArray(option)) return option;
              const optionRecord = option as Record<string, unknown>;
              if (optionRecord.id === "as-shown"
                && optionRecord.label === "As shown"
                && optionRecord.hex === "#B08D57") {
                correctedDefaultAsShown = true;
                return { ...optionRecord, hex: "#111111" };
              }
              return option;
            }).filter((option) => !(
              correctedDefaultAsShown
              && option
              && typeof option === "object"
              && !Array.isArray(option)
              && (option as Record<string, unknown>).id === "soso-black"
              && (option as Record<string, unknown>).label === "SOSO Black"
              && (option as Record<string, unknown>).hex === "#111111"
            ));
          }
        }
        if (
          shouldRetireShippedDashikiVisualizer
          && productRecord.slug === "heritage-dashiki"
          && productRecord.colourVisualizer
          && typeof productRecord.colourVisualizer === "object"
          && !Array.isArray(productRecord.colourVisualizer)
          && (productRecord.colourVisualizer as Record<string, unknown>).baseImageSrc === retiredHeritageDashikiVisualizer.baseImageSrc
          && (productRecord.colourVisualizer as Record<string, unknown>).garmentMaskSrc === retiredHeritageDashikiVisualizer.garmentMaskSrc
        ) {
          delete productRecord.colourVisualizer;
        }
        return productRecord;
      });
      if (shouldApplyWomenLaunch) {
        const productSlugs = new Set(upgradedProducts.flatMap((entry) =>
          entry && typeof entry === "object" && !Array.isArray(entry) && typeof (entry as Record<string, unknown>).slug === "string"
            ? [(entry as Record<string, unknown>).slug as string]
            : []));
        womenReadyToWearProducts.forEach((entry) => {
          if (!productSlugs.has(entry.slug)) upgradedProducts.push(structuredClone(entry));
        });
      }
      (merged as { products: unknown[] }).products = upgradedProducts;
    }
    const collections = (merged as { collections?: unknown }).collections;
    if (Array.isArray(collections)) {
      const upgradedCollections = collections.map((entry) =>
        mergeMissing({ department: "men" }, entry));
      if (shouldApplyWomenLaunch) {
        const collectionSlugs = new Set(upgradedCollections.flatMap((entry) =>
          entry && typeof entry === "object" && !Array.isArray(entry) && typeof (entry as Record<string, unknown>).slug === "string"
            ? [(entry as Record<string, unknown>).slug as string]
            : []));
        if (!collectionSlugs.has(womenReadyToWearCollection.slug)) {
          upgradedCollections.push(structuredClone(womenReadyToWearCollection));
        }
      }
      (merged as { collections: unknown[] }).collections = upgradedCollections;
    }
    const megaMenu = (merged as { site?: { megaMenu?: unknown } }).site?.megaMenu;
    if (shouldApplyWomenLaunch && Array.isArray(megaMenu)) {
      const legacyWomenGroupIndex = megaMenu.findIndex((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
        const group = entry as Record<string, unknown>;
        const columns = group.columns;
        const onlyColumn = Array.isArray(columns) && columns.length === 1
          && columns[0] && typeof columns[0] === "object" && !Array.isArray(columns[0])
          ? columns[0] as Record<string, unknown>
          : null;
        const links = onlyColumn?.links;
        const onlyLink = Array.isArray(links) && links.length === 1
          && links[0] && typeof links[0] === "object" && !Array.isArray(links[0])
          ? links[0] as Record<string, unknown>
          : null;
        return group.id === "women"
          && group.label === "Women"
          && group.href === "/shop?department=women"
          && group.department === "women"
          && group.visible === false
          && Array.isArray(group.featuredProductSlugs)
          && group.featuredProductSlugs.length === 0
          && onlyColumn?.heading === "Shop"
          && onlyLink?.label === "Women’s collection"
          && onlyLink.href === "/shop?department=women";
      });
      if (legacyWomenGroupIndex >= 0) {
        const launchedWomenGroup = DEFAULT_PLATFORM_CONTENT.site.megaMenu.find((group) => group.id === "women");
        if (launchedWomenGroup) megaMenu[legacyWomenGroupIndex] = structuredClone(launchedWomenGroup);
      }
    }
    if (shouldApplySiteSettingsLaunch && Array.isArray(megaMenu)) {
      const menGroup = megaMenu.find((entry) =>
        entry && typeof entry === "object" && !Array.isArray(entry)
        && (entry as Record<string, unknown>).id === "men") as Record<string, unknown> | undefined;
      const columns = menGroup?.columns;
      const shopColumn = Array.isArray(columns)
        ? columns.find((entry) =>
          entry && typeof entry === "object" && !Array.isArray(entry)
          && (entry as Record<string, unknown>).heading === "Shop") as Record<string, unknown> | undefined
        : undefined;
      const links = shopColumn?.links;
      if (Array.isArray(links) && !links.some((entry) =>
        entry && typeof entry === "object" && !Array.isArray(entry)
        && (entry as Record<string, unknown>).href === "/shop?department=men&sort=newest")) {
        const newArrivals = { label: "New arrivals", href: "/shop?department=men&sort=newest" };
        const shopAllIndex = links.findIndex((entry) =>
          entry && typeof entry === "object" && !Array.isArray(entry)
          && (entry as Record<string, unknown>).href === "/shop?department=men");
        links.splice(shopAllIndex >= 0 ? shopAllIndex + 1 : links.length, 0, newArrivals);
      }
    }
    const consent = (merged as {
      site?: { consent?: { body?: unknown; marketingDescription?: unknown } };
    }).site?.consent;
    if (consent?.body === "Necessary storage keeps your bag and privacy choice working. Optional measurement helps SOSO understand which pages are useful; it stays off until you choose it.") {
      consent.body = DEFAULT_PLATFORM_CONTENT.site.consent.body;
    }
    if (consent?.marketingDescription === "Marketing — no marketing technology or pixels are currently active.") {
      consent.marketingDescription = DEFAULT_PLATFORM_CONTENT.site.consent.marketingDescription;
    }
    (merged as { contentVersion: number }).contentVersion = DEFAULT_PLATFORM_CONTENT.contentVersion;
  }
  return merged;
}

export function mergePublishedPlatformContentDefaults(current: unknown, publishedAt: Date | string | null): unknown {
  if (
    !publishedAt
    || !current
    || typeof current !== "object"
    || Array.isArray(current)
    || Object.keys(current).length === 0
  ) return current;
  return mergePlatformContentDefaults(current);
}

const LEGACY_FAQ_RECONCILIATION_ID = "platform-pages-faq-items-v1";
const LEGACY_FAQ_RECONCILIATION_ACTION = "faq.legacy_platform_items_reconciled";
const legacyFaqItemsSchema = z.array(z.object({
  id: slug,
  category: copy,
  question: copy,
  answer: copy,
}).strict());

export type LegacyFaqItem = z.infer<typeof legacyFaqItemsSchema>[number];

export function readLegacyPublishedFaqItems(content: unknown): LegacyFaqItem[] {
  if (!content || typeof content !== "object" || Array.isArray(content)) return [];
  const pages = (content as Record<string, unknown>).pages;
  if (!pages || typeof pages !== "object" || Array.isArray(pages)) return [];
  const faq = (pages as Record<string, unknown>).faq;
  if (!faq || typeof faq !== "object" || Array.isArray(faq)) return [];
  const parsed = legacyFaqItemsSchema.safeParse((faq as Record<string, unknown>).items);
  return parsed.success ? parsed.data : [];
}

const normalizeFaqQuestion = (question: string) => question.trim().toLocaleLowerCase();

/**
 * Moves the formerly embedded, published FAQ list into the managed FAQ table.
 * The audit event is the durable completion marker, so no schema change is
 * needed. Both the marker check and inserts share a transaction and advisory
 * lock. Existing questions always win, protecting staff changes made before
 * rollout; the marker also prevents deleted imports from being resurrected.
 */
export async function reconcileLegacyPublishedFaqItems(
  publishedContent: unknown,
): Promise<{ importedCount: number; skippedCount: number; alreadyReconciled: boolean }> {
  const legacyItems = readLegacyPublishedFaqItems(publishedContent);
  if (legacyItems.length === 0) {
    return { importedCount: 0, skippedCount: 0, alreadyReconciled: false };
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"soso:" + LEGACY_FAQ_RECONCILIATION_ID}))`);
    const [marker] = await tx.select({ id: auditLogsTable.id }).from(auditLogsTable).where(and(
      eq(auditLogsTable.action, LEGACY_FAQ_RECONCILIATION_ACTION),
      eq(auditLogsTable.entityType, "faq_reconciliation"),
      eq(auditLogsTable.entityId, LEGACY_FAQ_RECONCILIATION_ID),
    )).limit(1);
    if (marker) {
      return { importedCount: 0, skippedCount: 0, alreadyReconciled: true };
    }

    const existing = await tx.select({ question: faqItemsTable.question }).from(faqItemsTable);
    const knownQuestions = new Set(existing.map((item) => normalizeFaqQuestion(item.question)));
    const importedItemIds: string[] = [];
    const skippedSourceItemIds: string[] = [];

    for (const [sortOrder, item] of legacyItems.entries()) {
      const questionKey = normalizeFaqQuestion(item.question);
      if (knownQuestions.has(questionKey)) {
        skippedSourceItemIds.push(item.id);
        continue;
      }
      const [created] = await tx.insert(faqItemsTable).values({
        question: item.question.trim(),
        answer: item.answer.trim(),
        category: item.category.trim() || null,
        sortOrder,
        isPublished: true,
      }).returning({ id: faqItemsTable.id });
      importedItemIds.push(created!.id);
      knownQuestions.add(questionKey);
    }

    await tx.insert(auditLogsTable).values({
      actorClerkUserId: "system:faq-reconciliation",
      action: LEGACY_FAQ_RECONCILIATION_ACTION,
      entityType: "faq_reconciliation",
      entityId: LEGACY_FAQ_RECONCILIATION_ID,
      metadata: {
        sourceHash: platformContentHash(legacyItems),
        sourceItemIds: legacyItems.map((item) => item.id),
        importedItemIds,
        skippedSourceItemIds,
        importedCount: importedItemIds.length,
        skippedCount: skippedSourceItemIds.length,
      },
    });
    return {
      importedCount: importedItemIds.length,
      skippedCount: skippedSourceItemIds.length,
      alreadyReconciled: false,
    };
  });
}

export async function ensurePlatformContent() {
  const now = new Date();
  await db.insert(siteContentTable).values({
    key: "platform", draft: DEFAULT_PLATFORM_CONTENT, published: DEFAULT_PLATFORM_CONTENT,
    draftUpdatedAt: now, publishedAt: now,
    updatedByClerkUserId: "system:platform-seed-v2", publishedByClerkUserId: "system:platform-seed-v2",
  }).onConflictDoNothing({ target: siteContentTable.key });

  const [current] = await db.select().from(siteContentTable)
    .where(eq(siteContentTable.key, "platform")).limit(1);
  if (!current) return;

  // Reconcile before platform migrations can reshape the legacy document.
  // Only published items are imported: draft-only copy must never become public.
  await reconcileLegacyPublishedFaqItems(current.published);

  const updates: Partial<typeof siteContentTable.$inferInsert> = {};
  const mergedDraft = mergePlatformContentDefaults(current.draft);
  const parsedMergedDraft = PlatformContentSchema.safeParse(mergedDraft);
  if (
    parsedMergedDraft.success
    && platformContentHash(current.draft) !== platformContentHash(parsedMergedDraft.data)
  ) {
    updates.draft = parsedMergedDraft.data;
    updates.draftUpdatedAt = now;
  }

  const mergedPublished = mergePublishedPlatformContentDefaults(current.published, current.publishedAt);
  if (mergedPublished !== current.published) {
    const parsedMergedPublished = PlatformContentSchema.safeParse(mergedPublished);
    if (
      parsedMergedPublished.success
      && platformContentHash(current.published) !== platformContentHash(parsedMergedPublished.data)
    ) {
      updates.published = parsedMergedPublished.data;
    }
  }

  if (Object.keys(updates).length > 0) {
    await db.transaction(async (tx) => {
      await tx.update(siteContentTable).set(updates)
        .where(eq(siteContentTable.key, "platform"));
      const actor = "system:platform-content-migration";
      const migratedSnapshots = [
        updates.draft ? { target: "draft", snapshot: updates.draft } : null,
        updates.published ? { target: "published", snapshot: updates.published } : null,
      ].filter((entry): entry is { target: string; snapshot: NonNullable<typeof updates.draft> } => Boolean(entry));
      for (const migration of migratedSnapshots) {
        const hash = platformContentHash(migration.snapshot);
        const [revision] = await tx.insert(siteContentRevisionsTable).values({
          contentKey: "platform",
          event: "system_migrated",
          snapshot: migration.snapshot,
          contentHash: hash,
          createdByClerkUserId: actor,
        }).returning({ id: siteContentRevisionsTable.id });
        await tx.insert(auditLogsTable).values({
          actorClerkUserId: actor,
          action: "platform_content.system_migrated",
          entityType: "site_content",
          entityId: "platform",
          metadata: {
            target: migration.target,
            contentVersion: migration.snapshot.contentVersion,
            contentHash: hash,
            revisionId: revision!.id,
          },
        });
      }
    });
  }
}

export async function readPublishedPlatformContent(): Promise<PlatformContent | null> {
  const [row] = await db.select({ published: siteContentTable.published, publishedAt: siteContentTable.publishedAt })
    .from(siteContentTable).where(eq(siteContentTable.key, "platform")).limit(1);
  if (!row?.publishedAt) return null;
  const parsed = PlatformContentSchema.safeParse(row.published);
  return parsed.success ? parsed.data : null;
}
