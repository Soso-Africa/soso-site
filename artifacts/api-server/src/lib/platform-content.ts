import { createHash } from "node:crypto";
import { db, siteContentTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160);
const localPath = z.string().startsWith("/").max(512).refine((value) => !value.startsWith("//"));
const href = z.string().max(1024).refine((value) => {
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}, "Must be an internal path or HTTPS URL");
const copy = z.string().max(10_000);
const seo = z.object({ title: z.string().min(1).max(160), description: z.string().min(1).max(320) }).strict();
const link = z.object({ label: z.string().min(1).max(120), href, external: z.boolean().optional() }).strict();
const copyItem = z.object({
  title: copy, body: copy, imageUrl: localPath.optional(), href: localPath.optional(), linkLabel: copy.optional(),
}).strict();
const image = z.object({ src: localPath, alt: z.string().min(1).max(300) }).strict();

export const PlatformContentSchema = z.object({
  site: z.object({
    name: copy, logoUrl: localPath, logoAlt: z.string().min(1), announcement: copy, skipLinkLabel: copy.min(1),
    contactEmail: z.union([z.literal(""), z.string().email()]), contactPhone: z.string().max(40),
    instagramUrl: href, whatsappUrl: href,
    navigation: z.array(link).min(1), mobileNavigation: z.array(link).min(1),
    platformState: z.object({ loadingMessage: copy.min(1), unavailableMessage: copy.min(1) }).strict(),
    header: z.object({ openMenuLabel: copy, closeMenuLabel: copy, mainNavigationLabel: copy, whatsappLabel: copy, cartLabel: copy, openCartLabel: copy, mobileWhatsappLabel: copy }).strict(),
    cart: z.object({ title: copy, closeLabel: copy, emptyMessage: copy, continueShoppingLabel: copy, sizeLabel: copy, removeLabel: copy, subtotalLabel: copy, helpText: copy, checkoutCta: link, stylistCta: link }).strict(),
    floatingCta: link,
    consent: z.object({ regionLabel: copy, title: copy, body: copy, essentialLabel: copy, analyticsLabel: copy, manageLabel: copy, necessaryDescription: copy, measurementDescription: copy, marketingDescription: copy, footerText: copy, privacyLink: link }).strict(),
    footer: z.object({
      description: copy,
      columns: z.array(z.object({ heading: copy, links: z.array(link).min(1) }).strict()).min(1),
      legalLinks: z.array(link).min(1), copyright: copy, checkoutNote: copy, instagramLabel: copy, instagramAriaLabel: copy, cookieChoicesLabel: copy,
    }).strict(),
  }).strict(),
  homepage: z.object({
    seo,
    hero: z.object({
      eyebrow: copy, title: copy, accent: copy, suffix: copy, description: copy,
      imageUrl: localPath, imageAlt: z.string().min(1), primaryCta: link,
      stylistCtaLabel: copy, assurances: z.array(copy).min(1),
    }).strict(),
    trustItems: z.array(copyItem).min(1),
    featured: z.object({ eyebrow: copy, title: copy, link, productSlugs: z.array(slug).min(1) }).strict(),
    occasions: z.object({ eyebrow: copy, title: copy, items: z.array(copyItem).min(1) }).strict(),
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
    shop: z.object({ seo, eyebrow: copy, title: copy, intro: copy, allFilterLabel: copy, emptyMessage: copy, productCtaLabel: copy, collectionNotFoundTitle: copy, collectionNotFoundCta: link, collectionEmptyMessage: copy, allCollectionsLabel: copy }).strict(),
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
      returnBagCta: link, continueCta: link, retryCta: link, returnCheckoutCta: link,
    }).strict(),
    notFound: z.object({ seo, title: copy, body: copy, cta: link }).strict(),
  }).strict(),
  products: z.array(z.object({
    slug, name: copy, img: localPath, images: z.array(image).min(1),
    price: z.number().int().positive(), tag: copy, note: copy, category: copy,
    description: copy, sizes: z.array(z.string().min(1).max(40)).min(1),
    featured: z.boolean().optional(), relatedProductSlugs: z.array(slug).optional(),
    commerceProductId: z.string().uuid().optional(),
    commerceVariantIds: z.record(z.string(), z.string().uuid()).optional(),
  }).strict()).min(1),
  collections: z.array(z.object({ slug, label: copy, category: copy, h1: copy, intro: copy, seo }).strict()).min(1),
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
    sizeRequiredLabel: copy, mobileSizeRequiredLabel: copy, addToBagLabel: copy,
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
  const collectionCategories = new Set(content.collections.map((item) => item.category));
  content.products.forEach((product, index) => {
    if (!collectionCategories.has(product.category)) ctx.addIssue({ code: "custom", message: `Unknown product collection category: ${product.category}`, path: ["products", index, "category"] });
    product.relatedProductSlugs?.forEach((related, relatedIndex) => {
      if (!products.has(related) || related === product.slug) ctx.addIssue({ code: "custom", message: `Invalid related product: ${related}`, path: ["products", index, "relatedProductSlugs", relatedIndex] });
    });
  });
  content.homepage.featured.productSlugs.forEach((value, index) => {
    if (!products.has(value)) ctx.addIssue({ code: "custom", message: `Unknown featured product: ${value}`, path: ["homepage", "featured", "productSlugs", index] });
  });
  content.sizeGuide.rows.forEach((row, index) => {
    if (row.values.length !== content.sizeGuide.columns.length) ctx.addIssue({ code: "custom", message: "Size guide values must match its columns", path: ["sizeGuide", "rows", index, "values"] });
  });
});

export type PlatformContent = z.infer<typeof PlatformContentSchema>;

const sizes = ["S", "M", "L", "XL", "XXL", "Custom"];
const product = (slugValue: string, name: string, img: string, price: number, tag: string, note: string, category: string, description: string) => ({
  slug: slugValue, name, img, images: [{ src: img, alt: name }], price, tag, note, category, description, sizes,
  featured: true,
});
export const DEFAULT_PLATFORM_CONTENT: PlatformContent = {
  site: {
    name: "SOSO Africa", logoUrl: "/images/soso/logo.png", logoAlt: "SOSO Africa",
    announcement: "Fit guidance if you need it · Atelier details confirmed after payment", skipLinkLabel: "Skip to content",
    contactEmail: "", contactPhone: "", instagramUrl: "https://instagram.com/sosoafrica", whatsappUrl: "/#whatsapp",
    navigation: [{ label: "Shop", href: "/shop" }, { label: "Kaftans", href: "/collections/kaftans" }, { label: "Agbadas", href: "/collections/agbadas" }, { label: "Shirts", href: "/collections/shirts" }, { label: "Journal", href: "/journal" }],
    mobileNavigation: [{ label: "Shop", href: "/shop" }, { label: "Kaftans", href: "/collections/kaftans" }, { label: "Agbadas", href: "/collections/agbadas" }, { label: "Shirts", href: "/collections/shirts" }, { label: "FAQ", href: "/faq" }],
    platformState: { loadingMessage: "Loading the published storefront…", unavailableMessage: "Storefront content is not published or is temporarily unavailable." },
    header: { openMenuLabel: "Open menu", closeMenuLabel: "Close menu", mainNavigationLabel: "Main navigation", whatsappLabel: "Order via WhatsApp", cartLabel: "Bag", openCartLabel: "Open cart", mobileWhatsappLabel: "Chat with Specialist" },
    cart: { title: "Your Bag", closeLabel: "Close cart", emptyMessage: "Your bag is empty.", continueShoppingLabel: "Continue Shopping", sizeLabel: "Size:", removeLabel: "Remove", subtotalLabel: "Subtotal", helpText: "Shipping and taxes calculated at checkout. Need help first? Ask a stylist.", checkoutCta: { label: "Proceed to payment", href: "/checkout" }, stylistCta: { label: "Ask a stylist", href: "/#whatsapp" } },
    floatingCta: { label: "Explore pieces", href: "/shop" },
    consent: { regionLabel: "Privacy choices", title: "Your privacy choices", body: "Necessary storage keeps your bag and privacy choice working. Optional measurement helps SOSO understand which pages are useful; it stays off until you choose it.", essentialLabel: "Necessary only", analyticsLabel: "Allow measurement", manageLabel: "Manage preference cookies", necessaryDescription: "Necessary — bag, session, consent preference. Always active.", measurementDescription: "Measurement — anonymous page and product journey counts.", marketingDescription: "Marketing — no marketing technology or pixels are currently active.", footerText: "You can change your choice at any time from the footer.", privacyLink: { label: "Privacy notice", href: "/privacy" } },
    footer: {
      description: "Bespoke menswear house, Abuja. Kaftans, agbadas, dashikis and shirting — made to order for the individual.",
      columns: [
        { heading: "Explore", links: [{ label: "Shop", href: "/shop" }, { label: "Journal", href: "/journal" }, { label: "FAQ", href: "/faq" }] },
        { heading: "Collections", links: [{ label: "Kaftans", href: "/collections/kaftans" }, { label: "Agbadas", href: "/collections/agbadas" }, { label: "Shirts", href: "/collections/shirts" }] },
      ],
      legalLinks: [{ label: "Privacy", href: "/policies/privacy" }, { label: "Terms", href: "/policies/terms" }],
      copyright: "© SOSO Africa. All rights reserved.", checkoutNote: "Secure hosted payment. Atelier confirmation follows payment.", instagramLabel: "Instagram", instagramAriaLabel: "SOSO Africa on Instagram", cookieChoicesLabel: "Cookie choices",
    },
  },
  homepage: {
    seo: { title: "SOSO Africa | Premium Nigerian Menswear", description: "Discover SOSO Africa's premium kaftans, agbadas, dashikis and shirts. Explore the collection, sizing help and a considered purchase journey." },
    hero: {
      eyebrow: "Bespoke Menswear · Abuja, Nigeria", title: "Dress like the man", accent: "make way", suffix: "for.",
      description: "Premium kaftans, agbadas and refined separates from SOSO Africa. Explore the collection, use the size guide, or speak with a stylist before you place your order.",
      imageUrl: "/images/soso/vault-black.jpg", imageAlt: "Black SOSO Africa kaftan",
      primaryCta: { label: "Shop the Collection", href: "/shop" }, stylistCtaLabel: "Ask a stylist",
      assurances: ["Size guidance before you buy", "Atelier details confirmed after payment", "Stylist support for considered purchases"],
    },
    trustItems: [
      { title: "Delivery guidance", body: "Options are confirmed for your location" }, { title: "Sizing support", body: "Use the guide or speak with a stylist" },
      { title: "Made-to-measure", body: "Choose Custom for a fitting conversation" }, { title: "Thoughtful checkout", body: "Pay first, then the atelier confirms making details" },
    ],
    featured: { eyebrow: "The Collection", title: "Built for the occasion. Cut for you.", link: { label: "View all pieces", href: "/shop" }, productSlugs: ["vault", "ivory-kaftan", "sovereign-agbada", "heritage-dashiki", "boardroom-shirt", "twin-set"] },
    occasions: {
      eyebrow: "Shop by occasion", title: "Where will they see you next?", items: [
        { title: "The Wedding", body: "Agbadas & grand kaftans", imageUrl: "/images/soso/agbada.jpg", href: "/shop", linkLabel: "Shop the look →" },
        { title: "The Boardroom", body: "Shirts & sharp two-pieces", imageUrl: "/images/soso/shirts.jpg", href: "/shop", linkLabel: "Shop the look →" },
        { title: "Sunday Service", body: "Ivory & ceremonial kaftans", imageUrl: "/images/soso/kaftan-white.jpg", href: "/shop", linkLabel: "Shop the look →" },
        { title: "The Owambe", body: "Statement dashikis & sets", imageUrl: "/images/soso/twopiece.jpg", href: "/shop", linkLabel: "Shop the look →" },
      ],
    },
    fit: {
      eyebrow: "Fit support", title: "Buying bespoke online should not be a gamble.", imageUrl: "/images/soso/kaftan-white.jpg", imageAlt: "Ivory kaftan fitting",
      steps: [{ title: "Choose your piece", body: "Pick from the collection and review the size guidance." }, { title: "Use fit support if needed", body: "A stylist can help with sizing, a custom request, or your occasion." }, { title: "Pay securely", body: "Complete payment for the piece you have chosen." }, { title: "Atelier follows up", body: "After payment, the atelier confirms making details and production next steps." }],
      ctaLabel: "Start Your Fitting",
    },
    confidence: {
      eyebrow: "The SOSO way", title: "A premium purchase should feel clear.",
      items: [{ title: "Choose with confidence", body: "Explore a considered collection and use product-specific sizing support." }, { title: "Pay first, atelier follows", body: "After payment, the atelier confirms your selected size, finish direction and production timing." }, { title: "Speak to a person", body: "A stylist is available for product, fitting and bespoke direction." }],
      marquee: ["Kaftans", "Agbadas", "Dashikis", "Refined tailoring", "Fit guidance", "Stylist support"],
    },
    story: { imageUrl: "/images/soso/dashiki.jpg", logoUrl: "/images/soso/logo.png", title: "The Architect of the Modern Man.", body: "SOSO approaches menswear with proportion, restraint, and intent. Each piece is considered for presence, with sizing support available when you need it.", link: { label: "Discover the house", href: "/shop" } },
    finalCta: { eyebrow: "Ready when you are", title: "Your next event is coming. Your outfit should already be sewing.", body: "Tell us what you are dressing for and a SOSO stylist will guide the right next step.", primaryCta: { label: "Shop the Collection", href: "/shop" }, stylistCtaLabel: "Ask a stylist", note: "Payment comes first; the atelier follows up next to confirm making details and available delivery guidance." },
  },
  pages: {
    shop: { seo: { title: "Shop premium menswear | SOSO Africa", description: "Browse SOSO Africa kaftans, agbadas, dashikis, two-piece sets and shirts. Pay securely, with optional stylist help before you order." }, eyebrow: "Made to order", title: "The Collection", intro: "Hand-finished in our Abuja atelier. Built for presence.", allFilterLabel: "All", emptyMessage: "No pieces in this collection yet.", productCtaLabel: "View Details", collectionNotFoundTitle: "Collection not found", collectionNotFoundCta: { label: "View all pieces", href: "/shop" }, collectionEmptyMessage: "No pieces in this collection yet.", allCollectionsLabel: "All pieces" },
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
          "Every piece is made to order. Nothing in the collection is taken from a production rack. When you order from SOSO, your garment is made for you.",
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
    checkout: { seo: { title: "Secure checkout | SOSO Africa", description: "Complete secure payment for your SOSO Africa order. Atelier making details are confirmed after payment." }, backCta: { label: "Continue shopping", href: "/shop" }, eyebrow: "Checkout", title: "Complete your order", intro: "Pay securely for your selected piece. After payment, the atelier confirms the selected size, fabric or finish direction, and production timing. Have a question first? Speak with a stylist.", emptyMessage: "Your bag is empty.", emptyCta: { label: "Explore the collection", href: "/shop" }, nameLabel: "Full name", phoneLabel: "Phone number", emailLabel: "Email", addressLabel: "Delivery address", notesLabel: "Delivery notes", optionalLabel: "optional", deliveryNote: "Delivery fees and final order totals are confirmed securely by JusticeSure before payment. Pickup will appear here when SOSO’s JusticeSure locations are published.", paymentUnavailableMessage: "We could not open secure payment. Please try again or speak with a SOSO stylist.", retryLabel: "Retry secure payment", returnToBagLabel: "Return to your bag", processingLabel: "Opening secure payment…", paymentLabel: "Continue to payment", secureNote: "Secure payment first · atelier confirmation follows.", legalLinks: [{ label: "Privacy & cookies", href: "/privacy" }, { label: "Terms", href: "/terms" }, { label: "Delivery, returns & refunds", href: "/delivery-returns" }], stylistLabel: "Ask a stylist", bagTitle: "Your bag", sizeQuantityLabel: "Size {size} · Qty {quantity}", subtotalLabel: "Subtotal", stylistCtaLabel: "Order with a stylist" },
    paymentReturn: { seo: { title: "Payment status | SOSO Africa", description: "Secure payment status for your SOSO Africa order." }, eyebrow: "Secure order update", missingAttemptMessage: "This payment return link is incomplete. No payment result can be confirmed here.", statusUnavailableMessage: "Payment status is unavailable.", paidTitle: "Payment confirmed", cancelledTitle: "Payment was not completed", pendingTitle: "Checking payment status", paidBody: "JusticeSure has confirmed your payment. The SOSO atelier will follow up with the next making details.", cancelledBody: "JusticeSure has not confirmed a payable order. You can return to your bag and try again when ready.", pendingBody: "A return from a payment provider is not confirmation by itself. We are waiting for JusticeSure’s verified order status.", orderReferenceLabel: "Order reference:", authoritativeTotalLabel: "Authoritative total:", errorSuffix: "No payment is confirmed by this page.", pendingNotice: "Please keep this page open while we check.", retryHelp: "Your local bag has not been changed. Return to it to review the exact piece and selected size before trying secure payment again.", reviewLabel: "Review", sizeLabel: "size", quantityLabel: "Qty", returnBagCta: { label: "Return to your bag", href: "/checkout" }, continueCta: { label: "Continue shopping", href: "/shop" }, retryCta: { label: "Retry checkout", href: "/checkout" }, returnCheckoutCta: { label: "Return to checkout", href: "/checkout" } },
    notFound: { seo: { title: "Page not found | SOSO Africa", description: "The SOSO Africa page you are looking for is not available." }, title: "This piece is not in the collection.", body: "Return to the collection to discover the SOSO pieces ready for your direction.", cta: { label: "Shop the collection", href: "/shop" } },
  },
  products: [
    product("vault", "Vault", "/images/soso/vault-black.jpg", 250000, "Signature", "A considered black kaftan", "Kaftans", "A signature SOSO kaftan with a clean, contemporary silhouette. Select a size for a ready-to-wear fit or choose Custom to begin a made-to-measure conversation."),
    product("ivory-kaftan", "Ivory Ascension Kaftan", "/images/soso/kaftan-white.jpg", 240000, "Collection", "Ivory for ceremonial occasions", "Kaftans", "An ivory kaftan designed for formal celebrations and important occasions. Speak with a SOSO stylist if you would like help choosing your fit."),
    product("sovereign-agbada", "The Sovereign Agbada", "/images/soso/agbada.jpg", 480000, "Occasion", "A three-piece agbada statement", "Agbadas", "A three-piece agbada for grand occasions. After payment, the atelier confirms requested finish and production timing."),
    product("heritage-dashiki", "Heritage Dashiki", "/images/soso/dashiki.jpg", 165000, "Collection", "Contemporary cut, heritage lines", "Dashikis", "A contemporary dashiki that brings a refined silhouette to everyday and celebratory dressing."),
    product("boardroom-shirt", "The Boardroom Shirt", "/images/soso/shirts.jpg", 150000, "Collection", "A sharp shirt for business days", "Shirts", "A refined shirt designed for business and formal settings. A SOSO stylist can help with sizing before you place an order."),
    product("twin-set", "Twin Set — Two Piece", "/images/soso/twopiece.jpg", 220000, "Collection", "Coordinated, relaxed tailoring", "Two-Piece", "A coordinated two-piece set with an easy, polished presence. Select your usual size or choose Custom for made-to-measure support."),
  ],
  collections: [
    { slug: "kaftans", label: "Kaftans", category: "Kaftans", h1: "Kaftans", intro: "Considered kaftans for significant occasions and daily distinction. Each piece is made to order for the person who wears it.", seo: { title: "Bespoke Kaftans | SOSO Africa, Abuja", description: "Premium made-to-order kaftans from SOSO Africa. Contemporary silhouettes made for the individual in Abuja, Nigeria." } },
    { slug: "agbadas", label: "Agbadas", category: "Agbadas", h1: "Agbadas", intro: "Statement three-piece agbadas for ceremonies, celebrations, and moments that require presence.", seo: { title: "Bespoke Agbadas | SOSO Africa, Abuja", description: "Made-to-order agbadas from SOSO Africa, Abuja. Generous three-piece sets for grand occasions." } },
    { slug: "dashikis", label: "Dashikis", category: "Dashikis", h1: "Dashikis", intro: "Heritage craft in a contemporary silhouette — dashikis for celebration and the days in between.", seo: { title: "Modern Dashikis | SOSO Africa, Abuja", description: "Contemporary made-to-order dashikis from SOSO Africa." } },
    { slug: "two-piece", label: "Two-Piece Sets", category: "Two-Piece", h1: "Two-Piece Sets", intro: "Coordinated and effortless — two-piece sets that move between occasions.", seo: { title: "Two-Piece Sets | SOSO Africa, Abuja", description: "Coordinated two-piece sets from SOSO Africa, made to order in Abuja." } },
    { slug: "shirts", label: "Shirts", category: "Shirts", h1: "Shirts", intro: "Sharp, considered shirting for business settings and formal occasions.", seo: { title: "Premium Men's Shirts | SOSO Africa, Abuja", description: "Refined made-to-order shirts from SOSO Africa." } },
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
    madeToOrderLabel: "Made to order", sizeSelectorLabel: "Select size", sizePrompt: "Select a size",
    customSizeHelp: "The atelier will collect your measurements after payment.", standardSizeHelp: "Use the size guide or ask a stylist before ordering.",
    sizeRequiredLabel: "Select a size to continue", mobileSizeRequiredLabel: "Choose size", addToBagLabel: "Add to bag",
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
      submittedMessage: "Your details are ready to discuss. No size recommendation has been made, and these details are not sent automatically. A stylist can help you decide before you add to bag.",
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
      successBody: "A SOSO stylist can follow up using the details you shared. You can still continue to your bag whenever you are ready.",
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
};

export function platformContentHash(content: unknown): string {
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
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

  return mergeMissing(DEFAULT_PLATFORM_CONTENT, current);
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

  const updates: Partial<typeof siteContentTable.$inferInsert> = {};
  const mergedDraft = mergePlatformContentDefaults(current.draft);
  const parsedMergedDraft = PlatformContentSchema.safeParse(mergedDraft);
  if (
    !PlatformContentSchema.safeParse(current.draft).success
    && parsedMergedDraft.success
  ) {
    updates.draft = parsedMergedDraft.data;
    updates.draftUpdatedAt = now;
  }

  if (current.publishedAt && Object.keys(current.published).length > 0) {
    const mergedPublished = mergePlatformContentDefaults(current.published);
    const parsedMergedPublished = PlatformContentSchema.safeParse(mergedPublished);
    if (
      !PlatformContentSchema.safeParse(current.published).success
      && parsedMergedPublished.success
    ) {
      updates.published = parsedMergedPublished.data;
      updates.publishedAt = now;
    }
  }

  if (Object.keys(updates).length > 0) {
    await db.update(siteContentTable).set(updates)
      .where(eq(siteContentTable.key, "platform"));
  }
}