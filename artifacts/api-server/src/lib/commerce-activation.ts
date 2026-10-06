import { eq } from "drizzle-orm";
import { db, siteContentTable } from "@workspace/db";
import {
  catalogueProductHash,
  localMappingHash,
  variantMatchesChoice,
} from "./catalogue-mapping";
import {
  isJusticeSureCommerceReady,
  JusticeSureCommerceClient,
  justiceSureConfig,
  type JusticeSureCatalogProduct,
} from "./justicesureCommerce";
import { readPublishedPlatformContent } from "./platform-content";

export const COMMERCE_ACTIVATION_KEY = "commerce_activation";

export function isNigerianCountry(value: unknown): boolean {
  return typeof value === "string" && ["NG", "NIGERIA"].includes(value.trim().toUpperCase());
}

export function matchesPlatformPrice(platformPrice: number, amountKobo: number): boolean {
  const expectedKobo = Math.round(platformPrice * 100);
  return Number.isFinite(platformPrice) && Number.isSafeInteger(expectedKobo)
    && Number.isSafeInteger(amountKobo) && amountKobo === expectedKobo;
}

export function activationEnabledValue(hasActivationRow: boolean, storedValue: unknown): boolean {
  return hasActivationRow ? storedValue === true : true;
}

export type CommerceActivationStatus = {
  enabled: boolean;
  effectiveEnabled: boolean;
  runtimeReady: boolean;
  canActivate: boolean;
  blockers: string[];
  updatedAt: string | null;
  provider?: string;
  fulfillmentOptions?: string[];
};

function validCatalogProduct(product: JusticeSureCatalogProduct | undefined): product is JusticeSureCatalogProduct {
  return Boolean(product && product.inStock && product.currency === "NGN"
    && Number.isSafeInteger(product.amountKobo) && product.amountKobo > 0);
}

export async function inspectCommerceActivation(): Promise<CommerceActivationStatus> {
  const [activationRow] = await db.select({
    draft: siteContentTable.draft,
    updatedAt: siteContentTable.draftUpdatedAt,
  }).from(siteContentTable).where(eq(siteContentTable.key, COMMERCE_ACTIVATION_KEY)).limit(1);
  const enabled = activationEnabledValue(Boolean(activationRow), activationRow?.draft.enabled);
  const config = justiceSureConfig();
  const runtimeReady = isJusticeSureCommerceReady(config);
  const blockers: string[] = [];
  let pickupAvailable = false;
  let deliveryAvailable = false;
  let provider: string | undefined;

  if (!config.runtimeReady) blockers.push("Set JUSTICESURE_COMMERCE_RUNTIME_READY=true after production runtime verification.");
  if (!config.baseUrl) blockers.push("Configure the secure JusticeSure API base URL.");
  if (!config.apiKey || !/^jsk_.{8,}$/.test(config.apiKey)) blockers.push("Configure a valid production JusticeSure signing key.");
  if (!config.webhookSecret) blockers.push("Configure the JusticeSure webhook signing secret.");
  if (!config.paymentReturnUrl) blockers.push("Configure SOSO_PAYMENT_RETURN_URL as a valid HTTPS return URL.");

  try {
    // This read-only mode intentionally permits a readiness check when the
    // write-enabling runtime flag is still off.
    const client = new JusticeSureCommerceClient(config, true);
    const [catalog, published, readiness, options, locations] = await Promise.all([
      client.listProducts(),
      readPublishedPlatformContent(),
      client.listPaymentMethods("NG", "NGN"),
      client.listStoreFulfillmentOptions(),
      client.listLocations(),
    ]);

    const paystack = readiness.providers.find((item) => item.provider === "paystack");
    const paystackReady = Boolean(paystack?.eligible && paystack.methods.includes("card")
      && paystack.chargeCurrencies.includes("NGN") && paystack.settlementCurrencies.includes("NGN"));
    if (paystackReady) provider = "paystack";
    else blockers.push("JusticeSure discovery must confirm eligible Paystack card payments charged and settled in NGN for Nigeria.");

    deliveryAvailable = options.includes("delivery");
    if (!options.includes("pickup") && !deliveryAvailable) blockers.push("Enable collection or domestic delivery in the current JusticeSure store fulfillment options.");
    const shops = locations.filter((value) => value && typeof value === "object"
      && !Array.isArray(value) && (value as Record<string, unknown>).type === "shop");
    const validPickup = shops.filter((value) => {
      const location = value as Record<string, unknown>;
      return typeof location.id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(location.id)
        && typeof location.name === "string" && Boolean(location.name.trim())
        && typeof location.address === "string" && Boolean(location.address.trim())
        && typeof location.city === "string" && Boolean(location.city.trim())
        && isNigerianCountry(location.country);
    });
    pickupAvailable = options.includes("pickup") && validPickup.length === 1;
    if (!pickupAvailable && !deliveryAvailable) blockers.push("Configure exactly one valid Nigerian SOSO HQ shop location for collection or enable domestic delivery.");

    if (!published) blockers.push("Publish valid platform content before activating checkout.");
    else {
      const liveProducts = published.products.filter((product) => product.fulfilmentState !== "unavailable");
      if (liveProducts.length === 0) blockers.push("Publish at least one available product before activating checkout.");
      const byId = new Map(catalog.map((product) => [product.id, product]));
      for (const product of liveProducts) {
        const label = `Published product “${product.name}” (${product.slug})`;
        const mappedProduct = product.commerceProductId ? byId.get(product.commerceProductId) : undefined;
        const confirmation = product.commerceMappingConfirmation;
        const localHash = localMappingHash({
          slug: product.slug,
          name: product.name,
          price: product.price,
          eligibility: { standard: product.standardEligible, custom: product.customEligible },
          standardSizes: product.standardEligible ? product.standardSizes : [],
          commerceProductId: product.commerceProductId,
          commerceVariantIds: product.commerceVariantIds,
        });
        if (!product.commerceProductId || !product.commerceVariantIds || !confirmation
          || confirmation.confidence < 95 || confirmation.localHash !== localHash
          || !mappedProduct || confirmation.productHash !== catalogueProductHash(mappedProduct)) {
          blockers.push(`${label} needs a current confirmed JusticeSure product and variant mapping.`);
          continue;
        }
        if (!validCatalogProduct(mappedProduct) || !matchesPlatformPrice(product.price, mappedProduct.amountKobo)) {
          blockers.push(`${label} is not currently in stock at its published NGN price in JusticeSure.`);
          continue;
        }
        const requiredChoices = [
          ...(product.standardEligible ? product.standardSizes : []),
          ...(product.customEligible ? ["Custom"] : []),
        ];
        for (const choice of requiredChoices) {
          const variantId = product.commerceVariantIds[choice];
          const variant = variantId ? mappedProduct.variants.find((candidate) => candidate.id === variantId) : undefined;
          if (!variant || !variantMatchesChoice(variant, choice) || !variant.inStock
            || !matchesPlatformPrice(product.price, variant.amountKobo)) {
            blockers.push(`${label}: ${choice} needs a mapped, in-stock JusticeSure variant with a valid positive NGN price.`);
          }
        }
      }
    }
  } catch (error) {
    blockers.push(`Readiness checks could not be completed: ${error instanceof Error ? error.message : "JusticeSure or published catalogue is unavailable."}`);
  }

  const uniqueBlockers = [...new Set(blockers)];
  return {
    enabled,
    effectiveEnabled: enabled && runtimeReady,
    runtimeReady,
    canActivate: uniqueBlockers.length === 0,
    blockers: uniqueBlockers,
    updatedAt: activationRow?.updatedAt?.toISOString() ?? null,
    ...(provider ? { provider } : {}),
    fulfillmentOptions: [...(pickupAvailable ? ["pickup"] : []), ...(deliveryAvailable ? ["delivery"] : [])],
  };
}

export async function commerceActivationEnabled(): Promise<boolean> {
  const [row] = await db.select({ draft: siteContentTable.draft })
    .from(siteContentTable).where(eq(siteContentTable.key, COMMERCE_ACTIVATION_KEY)).limit(1);
  const enabled = activationEnabledValue(Boolean(row), row?.draft.enabled);
  return enabled && isJusticeSureCommerceReady();
}