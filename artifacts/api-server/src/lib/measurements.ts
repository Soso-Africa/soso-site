export const CUSTOM_DISPATCH_GUIDANCE =
  "Dispatch within five days after measurements are confirmed. This is a dispatch estimate, not a delivery guarantee." as const;

export const measurementFields = [
  "height",
  "chest",
  "waist",
  "hips",
  "shoulder",
  "sleeve",
  "garmentLength",
] as const;

export type MeasurementValues = Record<(typeof measurementFields)[number], number>;
export type MeasurementStatus = "needed" | "submitted" | "clarification_requested" | "confirmed" | "cancelled";
export type LocalOrderStatus =
  | "payment_pending"
  | "paid"
  | "atelier_confirmation"
  | "in_production"
  | "ready"
  | "fulfilled"
  | "cancelled"
  | "refunded";

export type CheckoutSelectionInput = {
  productId: string;
  variantId?: string;
  quantity: number;
  displaySlug?: string;
  selectedColourId: string;
  selectedColourLabel?: string;
  selectedColourHex?: string;
  customColour?: string;
};

export type AuthoritativeCatalogProduct = {
  id: string;
  name: string;
  amountKobo: number;
  inStock: boolean;
  variants: Array<{ id: string; label: string }>;
};

export type AuthoritativeCheckoutItem = CheckoutSelectionInput & {
  variantId: string;
  displayName: string;
  selectedSize: string;
  unitPriceKobo: number;
};

export type AuthoritativeStorefrontProduct = {
  slug: string;
  commerceProductId?: string;
  commerceVariantIds?: Record<string, string>;
  colourOptions: Array<{ id: string; label: string; hex: string }>;
  allowCustomColour: boolean;
};

const centimeterBounds: Record<keyof MeasurementValues, readonly [number, number]> = {
  height: [120, 230],
  chest: [50, 180],
  waist: [50, 180],
  hips: [50, 180],
  shoulder: [25, 70],
  sleeve: [35, 100],
  garmentLength: [40, 180],
};

export function selectionType(selectedSize: string | undefined | null): "standard" | "custom" {
  return selectedSize?.trim().toLowerCase() === "custom" ? "custom" : "standard";
}

export function shouldActivateMeasurements(status: string): boolean {
  return status === "paid" || status === "fulfilled";
}

export function reconciledOrderStatus(
  localStatus: LocalOrderStatus,
  remoteStatus: "payment_pending" | "paid" | "cancelled" | "refunded" | "fulfilled",
): LocalOrderStatus {
  if (localStatus === "refunded" || remoteStatus === "refunded") return "refunded";
  if (remoteStatus === "cancelled") return "cancelled";
  if (localStatus === "cancelled") return localStatus;
  if (localStatus === "fulfilled") return localStatus;
  if (remoteStatus === "fulfilled") return "fulfilled";
  if (localStatus === "payment_pending" && remoteStatus === "paid") return "paid";
  return localStatus;
}

export function resolveAuthoritativeCheckoutItems(
  items: CheckoutSelectionInput[],
  catalog: AuthoritativeCatalogProduct[],
  storefrontProducts?: AuthoritativeStorefrontProduct[],
): AuthoritativeCheckoutItem[] | null {
  const resolved: AuthoritativeCheckoutItem[] = [];
  for (const item of items) {
    const product = catalog.find(({ id }) => id === item.productId);
    const variant = product?.variants.find(({ id }) => id === item.variantId);
    if (!product?.inStock || !variant || !Number.isInteger(product.amountKobo) || product.amountKobo < 0) {
      return null;
    }
    const label = variant.label.trim();
    if (!label) return null;
    const storefrontProduct = storefrontProducts?.find(({ commerceProductId }) => commerceProductId === item.productId);
    if (storefrontProducts) {
      const mappedVariantId = storefrontProduct?.commerceVariantIds?.[label.toLowerCase() === "custom" ? "Custom" : label];
      const isCustom = item.selectedColourId === "custom";
      const selectedColour = storefrontProduct?.colourOptions.find(({ id }) => id === item.selectedColourId);
      const validColour = isCustom
        ? Boolean(storefrontProduct?.allowCustomColour && item.customColour?.trim())
        : Boolean(selectedColour && !item.customColour && selectedColour.label === item.selectedColourLabel
          && selectedColour.hex.toUpperCase() === item.selectedColourHex?.toUpperCase());
      if (!storefrontProduct || mappedVariantId !== variant.id || !validColour) {
        return null;
      }
    }
    resolved.push({
      ...item,
      ...(storefrontProduct ? { displaySlug: storefrontProduct.slug } : {}),
      variantId: variant.id,
      displayName: product.name,
      selectedSize: label.toLowerCase() === "custom" ? "Custom" : label,
      unitPriceKobo: product.amountKobo,
    });
  }
  return resolved;
}

export function validateMeasurementValues(unit: unknown, value: unknown): value is MeasurementValues {
  if (unit !== "cm" && unit !== "in") return false;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== measurementFields.length) return false;
  return measurementFields.every((field) => {
    const measurement = record[field];
    const [cmMin, cmMax] = centimeterBounds[field];
    const factor = unit === "in" ? 2.54 : 1;
    return typeof measurement === "number"
      && Number.isFinite(measurement)
      && measurement >= cmMin / factor
      && measurement <= cmMax / factor;
  });
}

export function customerCanSubmit(status: MeasurementStatus): boolean {
  return status === "needed" || status === "submitted" || status === "clarification_requested";
}

export function staffMeasurementActionAllowed(
  status: MeasurementStatus,
  action: "request_clarification" | "confirm" | "set_production_exception" | "clear_production_exception",
  hasException: boolean,
): boolean {
  if (status === "cancelled") return false;
  if (action === "request_clarification" || action === "confirm") return status === "submitted";
  if (action === "clear_production_exception") return hasException;
  return true;
}

export function isAtelierRole(role: string): boolean {
  return ["owner", "administrator", "operations", "stylist"].includes(role);
}