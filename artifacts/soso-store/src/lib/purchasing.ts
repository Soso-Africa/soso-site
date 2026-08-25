import type { CatalogProduct } from "@/data/platformContent";

export function mappedPurchaseChoices(product: CatalogProduct): string[] {
  if (product.fulfilmentState === "unavailable" || !product.commerceProductId) return [];

  const eligibleChoices = [
    ...(product.standardEligible ? product.standardSizes : []),
    ...(product.customEligible ? ["Custom"] : []),
  ];

  return eligibleChoices.filter((choice) => Boolean(product.commerceVariantIds?.[choice]));
}

export function isMappedPurchaseChoice(product: CatalogProduct, choice: string | null): choice is string {
  return Boolean(
    choice
    && product.fulfilmentState !== "unavailable"
    && product.commerceProductId
    && product.commerceVariantIds?.[choice],
  );
}

type CartLineSelection = {
  slug: string;
  size: string;
  quantity: number;
  commerceProductId?: string;
  commerceVariantId?: string;
};

export function changeCartLineSelection<T extends CartLineSelection>(
  items: T[],
  slug: string,
  oldSize: string,
  newSize: string,
  newCommerceVariantId?: string,
): T[] {
  if (oldSize === newSize || !newCommerceVariantId) return items;

  const source = items.find((item) => item.slug === slug && item.size === oldSize);
  if (!source?.commerceProductId) return items;

  const target = items.find((item) => item.slug === slug && item.size === newSize);
  if (target) {
    return items
      .filter((item) => item !== source)
      .map((item) => item === target
        ? {
            ...item,
            quantity: item.quantity + source.quantity,
            commerceVariantId: newCommerceVariantId,
          }
        : item);
  }

  return items.map((item) => item === source
    ? { ...item, size: newSize, commerceVariantId: newCommerceVariantId }
    : item);
}