export type MarketingEventName = "page_view" | "product_view" | "add_to_bag" | "checkout_started";

export type MarketingProviderName = "meta" | "googleAds" | "x" | "tiktok";

export type MarketingPixelConfig = {
  schemaVersion: 1;
  revision: number;
  providers: Record<MarketingProviderName, { pixelId: string; conversionLabel?: string; purchaseEventId?: string } | null>;
};

export type MarketingPayload = {
  itemIds?: string[];
  value?: number;
  currency?: string;
  quantity?: number;
  itemCount?: number;
};

export type ProviderEvent = {
  name: MarketingEventName;
  payload: MarketingPayload;
};

function finiteNonNegative(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function stableId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const id = value.trim().slice(0, 160);
  return id || undefined;
}

/**
 * This is the sole vendor-data boundary. It intentionally reads individual
 * commerce fields instead of copying arbitrary analytics properties.
 */
export function mapMarketingEvent(
  eventName: string,
  properties?: Record<string, unknown>,
): ProviderEvent | null {
  if (!["page_view", "product_view", "add_to_bag", "checkout_started"].includes(eventName)) return null;
  const source = properties ?? {};
  const directId = stableId(source.commerceProductId) ?? stableId(source.productSlug);
  const suppliedIds = Array.isArray(source.itemIds)
    ? source.itemIds.map(stableId).filter((id): id is string => Boolean(id)).slice(0, 100)
    : [];
  const itemIds = suppliedIds.length ? suppliedIds : directId ? [directId] : undefined;
  const currency = source.currency === "NGN" ? "NGN" : undefined;
  const payload: MarketingPayload = {
    ...(itemIds ? { itemIds } : {}),
    ...(finiteNonNegative(source.value) !== undefined ? { value: finiteNonNegative(source.value) } : {}),
    ...(currency ? { currency } : {}),
    ...(positiveInteger(source.quantity) !== undefined ? { quantity: positiveInteger(source.quantity) } : {}),
    ...(positiveInteger(source.itemCount) !== undefined ? { itemCount: positiveInteger(source.itemCount) } : {}),
  };
  return { name: eventName as MarketingEventName, payload };
}

export type MarketingProvider = {
  name: MarketingProviderName;
  activate(pixelId: string): void;
  resume(pixelId: string): void;
  send(event: ProviderEvent): void;
  purchase?(receipt: PurchaseReceipt, config: NonNullable<MarketingPixelConfig["providers"][MarketingProviderName]>): void;
  revoke(): void;
};

export type PurchaseReceipt = { eventId: string; value: number; currency: "NGN" };

export function purchaseReceipt(value: unknown): PurchaseReceipt | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (typeof input.eventId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.eventId)
    || typeof input.value !== "number" || !Number.isFinite(input.value) || input.value <= 0
    || input.currency !== "NGN") return null;
  return { eventId: input.eventId, value: input.value, currency: input.currency };
}