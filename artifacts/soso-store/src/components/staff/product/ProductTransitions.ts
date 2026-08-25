import type { CatalogProduct } from "../../../data/platformContent";

export function handleToggleCustomEligible(
  product: CatalogProduct,
  checked: boolean,
  confirm: (msg: string) => boolean
): CatalogProduct | null {
  if (!checked) {
    const hasData = product.commerceVariantIds?.["Custom"];
    if (hasData) {
      if (!confirm("Disabling Custom eligibility will clear its mapped commerce variant. Continue?")) {
        return null;
      }
    }
  }

  const sizes = new Set(product.sizes || []);
  if (checked) sizes.add("Custom");
  else sizes.delete("Custom");
  
  const newVariants = { ...(product.commerceVariantIds || {}) };
  if (!checked) {
    delete newVariants["Custom"];
  }

  return {
    ...product,
    customEligible: checked,
    sizes: Array.from(sizes),
    commerceVariantIds: Object.keys(newVariants).length > 0 ? newVariants : undefined
  };
}

export function handleToggleStandardEligible(
  product: CatalogProduct,
  checked: boolean,
  confirm: (msg: string) => boolean
): CatalogProduct | null {
  if (!checked) {
    const stdSizes = product.standardSizes || [];
    if (stdSizes.length > 0) {
      if (!confirm("Disabling Standard eligibility will clear all its standard size variants and ready-now configurations. Continue?")) {
        return null;
      }
    }
  }

  let newVariants = { ...(product.commerceVariantIds || {}) };
  if (!checked) {
    (product.standardSizes || []).forEach(size => {
      delete newVariants[size];
    });
  }

  return {
    ...product,
    standardEligible: checked,
    standardSizes: checked ? product.standardSizes : [],
    readyNowSizes: checked ? product.readyNowSizes : [],
    commerceVariantIds: Object.keys(newVariants).length > 0 ? newVariants : undefined
  };
}

export function handleUpdateFulfilmentState(
  product: CatalogProduct,
  state: CatalogProduct["fulfilmentState"],
  confirm: (msg: string) => boolean
): CatalogProduct | null {
  if (state === "unavailable" && (product.readyNowSizes?.length || 0) > 0) {
    if (!confirm("Marking this product unavailable will clear its ready-now size selections. Continue?")) {
      return null;
    }
  }
  if (state !== "unavailable" && product.fulfilmentState === "unavailable" && product.unavailableMessage) {
    if (!confirm("Making this product available will clear its unavailable message. Continue?")) {
      return null;
    }
  }

  return {
    ...product,
    fulfilmentState: state,
    readyNowSizes: state === "unavailable" ? [] : product.readyNowSizes,
    unavailableMessage: state === "unavailable" ? product.unavailableMessage : undefined,
  };
}

export function handleUpdateAvailableSizes(
  product: CatalogProduct,
  newSizesWithoutCustom: string[],
  confirm: (msg: string) => boolean
): CatalogProduct | null {
  const currentWithoutCustom = (product.sizes || []).filter(s => s !== "Custom");
  const removedSizes = currentWithoutCustom.filter(s => !newSizesWithoutCustom.includes(s));

  if (removedSizes.length > 0) {
    const hasData = removedSizes.some(s => 
      product.commerceVariantIds?.[s] || 
      product.standardSizes?.includes(s) || 
      product.readyNowSizes?.includes(s)
    );
    if (hasData) {
      if (!confirm(`Removing sizes (${removedSizes.join(", ")}) will clear their configurations (Standard selection, Ready-now, Commerce mapping). Continue?`)) {
        return null;
      }
    }
  }

  const hasCustom = product.sizes?.includes("Custom");
  const finalSizes = [...newSizesWithoutCustom];
  if (hasCustom) finalSizes.push("Custom");

  const newStandardSizes = (product.standardSizes || []).filter(s => newSizesWithoutCustom.includes(s));
  const newReadyNowSizes = (product.readyNowSizes || []).filter(s => newSizesWithoutCustom.includes(s));
  
  const newVariants = { ...(product.commerceVariantIds || {}) };
  removedSizes.forEach(s => delete newVariants[s]);

  return {
    ...product,
    sizes: finalSizes,
    standardSizes: newStandardSizes,
    readyNowSizes: newReadyNowSizes,
    commerceVariantIds: Object.keys(newVariants).length > 0 ? newVariants : undefined
  };
}

export function handleUpdateStandardSizes(
  product: CatalogProduct,
  size: string,
  checked: boolean,
  confirm: (msg: string) => boolean
): CatalogProduct | null {
  if (!checked) {
    const hasData = product.commerceVariantIds?.[size] || product.readyNowSizes?.includes(size);
    if (hasData) {
      if (!confirm(`Unselecting Standard size '${size}' will clear its commerce mapping and ready-now configuration. Continue?`)) {
        return null;
      }
    }
  }

  const stdSizes = new Set(product.standardSizes || []);
  if (checked) stdSizes.add(size);
  else stdSizes.delete(size);

  const newReadyNow = (product.readyNowSizes || []).filter(s => s !== size || checked);
  const newVariants = { ...(product.commerceVariantIds || {}) };
  if (!checked) {
    delete newVariants[size];
  }

  return {
    ...product,
    standardSizes: Array.from(stdSizes),
    readyNowSizes: newReadyNow,
    commerceVariantIds: Object.keys(newVariants).length > 0 ? newVariants : undefined
  };
}
