import type { CatalogProduct } from "../../../data/platformContent";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LOCAL_PATH_REGEX = /^\/(?!\/)/;

export function validateProduct(
  product: CatalogProduct,
  allProducts: Pick<CatalogProduct, "slug">[],
  collectionCategories: string[] = []
): string[] {
  const errors: string[] = [];

  // Base fields
  if (!product.slug) errors.push("Slug is required");
  else {
    if (!SLUG_REGEX.test(product.slug)) errors.push("Slug must use lowercase letters, numbers, and single hyphens");
    if (allProducts.filter((item) => item.slug === product.slug).length > 1) errors.push(`Duplicate product slug: ${product.slug}`);
  }
  if (!product.name) errors.push("Name is required");
  if (!product.price || product.price <= 0 || !Number.isInteger(product.price)) errors.push("Price must be a positive whole number");
  if (!product.category) errors.push("Category is required");
  else if (collectionCategories.length > 0 && !collectionCategories.includes(product.category)) {
    errors.push(`Category is not represented by a catalogue collection: ${product.category}`);
  }
  if (!product.colour) errors.push("Colour is required");
  if (!product.fabric) errors.push("Fabric is required");
  if (!product.fit) errors.push("Fit is required");
  if (!product.dispatchMessage) errors.push("Dispatch message is required");
  if (product.merchandising?.sortPriority == null) errors.push("Sort priority is required");

  // Arrays structure
  const sizes = product.sizes || [];
  const standardSizes = product.standardSizes || [];
  const readyNowSizes = product.readyNowSizes || [];
  
  // Set tracking for duplicates
  if (new Set(sizes).size !== sizes.length) errors.push("Duplicate sizes detected");
  if (sizes.length === 0) errors.push("At least one selectable size is required");
  if (new Set(standardSizes).size !== standardSizes.length) errors.push("Duplicate standard sizes detected");
  if (new Set(readyNowSizes).size !== readyNowSizes.length) errors.push("Duplicate ready-now sizes detected");

  // Relationships
  const selectableSizes = new Set(sizes);
  standardSizes.forEach(size => {
    if (!selectableSizes.has(size)) {
      errors.push(`Standard size ${size} is not a selectable size`);
    }
    if (size.toLowerCase() === "custom") {
      errors.push("Custom must use Custom eligibility, not Standard sizes");
    }
  });

  const hasCustomSize = sizes.some((size) => size.toLowerCase() === "custom");
  if (product.customEligible && !hasCustomSize) {
    errors.push("Custom eligibility requires a Custom selectable size");
  }
  if (!product.customEligible && hasCustomSize) {
    errors.push("Custom selectable size requires Custom eligibility");
  }

  if (product.standardEligible && standardSizes.length === 0 && product.fulfilmentState !== "unavailable") {
    errors.push("Standard eligibility requires at least one Standard size");
  }
  
  if (!product.standardEligible && standardSizes.length > 0) {
    errors.push("Standard sizes require Standard eligibility");
  }

  const standardSet = new Set(standardSizes);
  readyNowSizes.forEach(size => {
    if (!standardSet.has(size)) {
      errors.push(`Ready-now size ${size} must be a Standard size`);
    }
  });

  // Fulfilment State
  if (product.fulfilmentState !== "unavailable" && !product.standardEligible && !product.customEligible) {
    errors.push("Available products require Standard or Custom eligibility");
  }
  
  if (product.fulfilmentState === "ready_now" && readyNowSizes.length === 0) {
    errors.push("Ready-now products require at least one ready-now size");
  }

  if (product.fulfilmentState === "unavailable") {
    if (readyNowSizes.length > 0) {
      errors.push("Unavailable products cannot advertise ready-now sizes");
    }
    if (!product.unavailableMessage) {
      errors.push("Unavailable products require an unavailable message");
    }
  } else if (product.unavailableMessage) {
    errors.push("Only unavailable products may include an unavailable message");
  }

  // Commerce variants
  if (product.commerceVariantIds && Object.keys(product.commerceVariantIds).length > 0 && !product.commerceProductId) {
    errors.push("Commerce variants require a commerce product ID");
  }
  if (product.commerceProductId && !UUID_REGEX.test(product.commerceProductId)) {
    errors.push("Commerce Product ID must be a valid UUID");
  }

  if (product.commerceVariantIds) {
    const allowedVariants = new Set([...standardSizes, ...(product.customEligible ? ["Custom"] : [])]);
    Object.entries(product.commerceVariantIds).forEach(([size, uuid]) => {
      if (!allowedVariants.has(size)) {
        errors.push(`Commerce variant is configured for an ineligible size: ${size}`);
      }
      if (!UUID_REGEX.test(uuid)) {
        errors.push(`Commerce variant ID for ${size} is not a valid UUID`);
      }
    });
  }

  if (product.fulfilmentState !== "unavailable" && product.commerceProductId) {
    standardSizes.forEach(size => {
      if (product.standardEligible && !product.commerceVariantIds?.[size]) {
        errors.push(`Missing commerce variant for Standard size: ${size}`);
      }
    });
    if (product.customEligible && !product.commerceVariantIds?.Custom) {
      errors.push("Custom eligibility requires a Custom commerce variant");
    }
  }

  // Images
  const imgs = product.images || [];
  if (imgs.length === 0) {
    errors.push("Product must have at least one image");
  } else {
    const srcSet = new Set();
    let hasImg = false;
    imgs.forEach((img, i) => {
      if (!img.src) errors.push(`Image ${i + 1} is missing a source path`);
      else {
        if (!LOCAL_PATH_REGEX.test(img.src)) errors.push(`Image ${i + 1} must use a local SOSO path`);
        if (srcSet.has(img.src)) errors.push(`Duplicate image path: ${img.src}`);
        srcSet.add(img.src);
        if (img.src === product.img) hasImg = true;
      }
      if (!img.alt) errors.push(`Image ${i + 1} is missing alt text`);
      if (!img.provenance?.source) errors.push(`Image ${i + 1} is missing provenance source`);
      if (!img.provenance?.rights) errors.push(`Image ${i + 1} is missing provenance rights`);
      if (img.provenance?.sourceUrl) {
        const sourceUrl = img.provenance.sourceUrl;
        let validSourceUrl = LOCAL_PATH_REGEX.test(sourceUrl);
        if (!validSourceUrl) {
          try {
            validSourceUrl = new URL(sourceUrl).protocol === "https:";
          } catch {
            validSourceUrl = false;
          }
        }
        if (!validSourceUrl) {
          errors.push(`Image ${i + 1} provenance source URL must be an internal path or HTTPS URL`);
        }
      }
    });
    if (!product.img) {
      errors.push("Choose a primary image");
    } else if (!hasImg) {
      errors.push("Primary image (img) must be one of the approved images");
    }
  }

  // Related products
  if (product.relatedProductSlugs && product.relatedProductSlugs.length > 0) {
    const relatedSet = new Set<string>();
    product.relatedProductSlugs.forEach(slug => {
      if (slug === product.slug) errors.push("Related products cannot include self");
      if (relatedSet.has(slug)) errors.push(`Duplicate related product: ${slug}`);
      relatedSet.add(slug);
      const exists = allProducts.some(p => p.slug === slug);
      if (!exists) errors.push(`Unknown related product slug: ${slug}`);
    });
  }

  return errors;
}