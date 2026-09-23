import type { CartItem } from "@/context/CartContext";
import type { CatalogProduct } from "@/data/platformContent";

const runtimeEnv = import.meta.env as Record<string, string | undefined> | undefined;

export type CommerceMode = "catalog-preview" | "justicesure-headless";

export type CheckoutRequest = {
  customer: {
    name: string;
    email: string;
    phone: string;
  };
  items: CartItem[];
  fulfillment: {
    type: "delivery";
    address: string;
  };
  quoteId: string;
  displayCurrency: string;
  paymentProvider: "paystack" | "flutterwave" | "stripe" | "paypal" | "hydrogen";
  paymentMethod: "card" | "bank_transfer" | "wallet" | "paypal" | "virtual_account";
  notes?: string;
};

export type CheckoutResult = {
  attemptId: string;
  checkoutUrl: string;
};

export type CommerceDiscovery = {
  currencies: Array<{ code: string; name: string; symbol: string; minorUnitExponent: number; displaySupported: boolean; chargeSupported: boolean; settlementSupported: boolean }>;
  paymentMethods: { providers: Array<{ provider: CheckoutRequest["paymentProvider"]; eligible: boolean; methods: CheckoutRequest["paymentMethod"][]; chargeCurrencies: string[]; settlementCurrencies: string[]; reasonCode: string | null }>; country: string | null; currency: string | null };
  corridors: Array<{ id: string; carrier: string; service: string; originCountry: string; destinationCountry: string; revision: number; importerOfRecord: string | null }>;
};
export interface CommerceGateway {
  readonly mode: CommerceMode;
  listProducts(): Promise<CatalogProduct[]>;
  getProduct(slug: string): Promise<CatalogProduct | undefined>;
  discover(country?: string, currency?: string): Promise<CommerceDiscovery>;
  createQuote(request: Omit<CheckoutRequest, "quoteId">): Promise<CommerceQuote>;
  createCheckoutSession(request: CheckoutRequest): Promise<CheckoutResult>;
}

export class CommerceConfigurationError extends Error {
  constructor(code: string) {
    super(code);
    this.name = "CommerceConfigurationError";
  }
}

export class CommerceRemoteError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
    this.name = "CommerceRemoteError";
  }
}
type CommerceCatalogProjection = {
  id: string;
  name: string;
  description: string | null;
  images: string[];
  amountKobo: number;
  inStock: boolean;
  variants: Array<{ id: string; label: string }>;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function projectCommerceCatalogProduct(value: unknown): CatalogProduct {
  const product = record(value);
  const price = product?.amountKobo;
  const images = product?.images;
  const variants = product?.variants;
  if (
    !product
    || typeof product.id !== "string"
    || typeof product.name !== "string"
    || typeof price !== "number"
    || !Array.isArray(images)
    || !images.every((image) => typeof image === "string")
    || !Array.isArray(variants)
  ) {
    throw new CommerceConfigurationError("catalogue_incomplete");
  }
  const labels = new Set<string>();
  const commerceVariantIds: Record<string, string> = {};
  for (const [index, value] of variants.entries()) {
    const variant = record(value);
    if (!variant || typeof variant.id !== "string" || typeof variant.label !== "string") {
      throw new CommerceConfigurationError("catalogue_invalid_variant");
    }
    const providedLabel = variant.label.trim() || `Option ${index + 1}`;
    const baseLabel = providedLabel.toLocaleLowerCase() === "custom" ? "Custom" : providedLabel;
    const label = labels.has(baseLabel) ? `${baseLabel} (${index + 1})` : baseLabel;
    labels.add(label);
    commerceVariantIds[label] = variant.id;
  }
  const slugBase = product.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "product";
  // JusticeSure permits products without variants. "Standard" is a local
  // shopper choice only; no provider variant ID is invented or transmitted.
  const sizes = variants.length === 0 ? ["Standard"] : Object.keys(commerceVariantIds);
  const standardSizes = sizes.filter((label) => label.toLocaleLowerCase() !== "custom");
  const customLabel = sizes.find((label) => label.toLocaleLowerCase() === "custom");
  return {
    slug: `${slugBase}-${product.id.slice(0, 8)}`,
    name: product.name,
    img: images[0] ?? "",
    images: images.map((src, index) => ({
      src,
      alt: `${product.name} ${index + 1}`,
      provenance: {
        source: "JusticeSure Commerce catalogue",
        rights: "Supplied for SOSO storefront use",
      },
    })),
    price: price / 100,
    tag: product.inStock === false ? "Currently unavailable" : "JusticeSure collection",
    note: product.inStock === false ? "Currently unavailable for secure checkout" : "Live price and availability",
    category: "Online collection",
    department: "men",
    releaseState: "approved",
    description: typeof product.description === "string" ? product.description : "Published through JusticeSure.",
    sizes,
    commerceProductId: product.id,
    commerceVariantIds,
    colour: "Not specified",
    colourOptions: [{ id: "not-specified", label: "Not specified", hex: "#777777" }],
    allowCustomColour: false,
    fabric: "Not specified",
    fit: "Standard",
    searchableTerms: [],
    merchandising: { isNew: false, sortPriority: 0 },
    standardEligible: standardSizes.length > 0,
    customEligible: Boolean(customLabel),
    standardSizes,
    readyNowSizes: [],
    fulfilmentState: product.inStock === false ? "unavailable" : "made_immediately",
    dispatchMessage: "Standard fulfillment",
    unavailableMessage: "Currently unavailable for secure checkout",
  };
}

export class JusticeSureHeadlessGateway implements CommerceGateway {
  readonly mode = "justicesure-headless" as const;

  private async catalogue(): Promise<CatalogProduct[]> {
    const apiBase = runtimeEnv?.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";
    const response = await fetch(`${apiBase}/api/payment/catalog`, { credentials: "include" });
    if (!response.ok) {
      throw new CommerceConfigurationError("catalogue_unavailable");
    }
    const payload = await response.json() as { products?: CommerceCatalogProjection[] };
    if (!Array.isArray(payload.products)) {
      throw new CommerceConfigurationError("catalogue_invalid_response");
    }
    return payload.products.map(projectCommerceCatalogProduct);
  }

  async listProducts(): Promise<CatalogProduct[]> {
    return this.catalogue();
  }

  async getProduct(slug: string): Promise<CatalogProduct | undefined> {
    return (await this.catalogue()).find((product) => product.slug === slug);
  }
  async discover(country?: string, currency?: string): Promise<CommerceDiscovery> {
    const apiBase = runtimeEnv?.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";
    const query = new URLSearchParams();
    if (country) query.set("country", country);
    if (currency) query.set("currency", currency);
    const response = await fetch(`${apiBase}/api/payment/discovery${query.size ? `?${query}` : ""}`, { credentials: "include" });
    if (!response.ok) throw new CommerceConfigurationError("payment_discovery_unavailable");
    return response.json() as Promise<CommerceDiscovery>;
  }
  async createQuote(request: Omit<CheckoutRequest, "quoteId">): Promise<CommerceQuote> {
    if (request.items.some((item) => !item.commerceProductId)) throw new CommerceConfigurationError("catalogue_mapping_missing");
    const apiBase = runtimeEnv?.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";
    const response = await fetch(`${apiBase}/api/payment/quote`, {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify(checkoutPayload(request)),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { code?: unknown } | null;
      throw new CommerceRemoteError(
        typeof payload?.code === "string" ? payload.code : "quote_unavailable",
        response.status,
      );
    }
    return response.json() as Promise<CommerceQuote>;
  }

  async createCheckoutSession(request: CheckoutRequest): Promise<CheckoutResult> {
    if (request.items.some((item) => !item.commerceProductId)) {
      throw new CommerceConfigurationError(
        "catalogue_mapping_missing",
      );
    }
    const operationKey = checkoutOperationKey(request);
    const apiBase = runtimeEnv?.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";
    const response = await fetch(`${apiBase}/api/payment/initiate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(checkoutPayload(request, operationKey)),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { code?: unknown } | null;
      throw new CommerceRemoteError(typeof payload?.code === "string" ? payload.code : "checkout_unavailable", response.status);
    }
    return response.json() as Promise<CheckoutResult>;
  }
}

function checkoutPayload(request: Omit<CheckoutRequest, "quoteId"> | CheckoutRequest, operationKey = checkoutOperationKey(request)): Record<string, unknown> {
  return {
    checkoutOperationId: operationKey,
    customer: request.customer,
    fulfillment: request.fulfillment,
    ...(request.notes ? { notes: request.notes } : {}),
    ...("quoteId" in request ? { quoteId: request.quoteId } : {}),
    displayCurrency: request.displayCurrency,
    paymentProvider: request.paymentProvider,
    paymentMethod: request.paymentMethod,
    items: request.items.map((item) => ({
          productId: item.commerceProductId,
          variantId: item.commerceVariantId,
          quantity: item.quantity,
          displayName: item.name,
          displaySlug: item.slug,
          selectedSize: item.size,
          selectedColourId: item.selectedColourId,
          selectedColourLabel: item.selectedColourLabel,
          selectedColourHex: item.selectedColourHex,
          customColour: item.customColour,
    })),
  };
}
const CHECKOUT_OPERATION_KEY = "soso-checkout-operation";
const PAYMENT_ATTEMPT_KEY = "soso-payment-attempt";

function checkoutOperationKey(request: Omit<CheckoutRequest, "quoteId"> | CheckoutRequest): string {
  const signature = JSON.stringify({
    items: request.items.map((item) => [
      item.commerceProductId, item.commerceVariantId, item.quantity,
      item.selectedColourId, item.selectedColourHex, item.customColour ?? "",
    ]),
    customer: [request.customer.name.trim(), request.customer.email.trim().toLowerCase(), request.customer.phone.trim()],
    fulfillment: request.fulfillment,
    notes: request.notes ?? "",
    displayCurrency: request.displayCurrency,
    paymentProvider: request.paymentProvider,
    paymentMethod: request.paymentMethod,
    quoteId: "quoteId" in request ? request.quoteId : "",
  });
  try {
    const previous = JSON.parse(sessionStorage.getItem(CHECKOUT_OPERATION_KEY) ?? "null") as { signature?: string; id?: string } | null;
    if (previous?.signature === signature && typeof previous.id === "string") return previous.id;
    const id = crypto.randomUUID();
    sessionStorage.setItem(CHECKOUT_OPERATION_KEY, JSON.stringify({ signature, id }));
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function clearCheckoutOperation(): void {
  try {
    sessionStorage.removeItem(CHECKOUT_OPERATION_KEY);
    sessionStorage.removeItem(PAYMENT_ATTEMPT_KEY);
  } catch {
    // Session storage is optional; server-side idempotency remains authoritative.
  }
}

export function savePaymentAttempt(attemptId: string): void {
  try {
    sessionStorage.setItem(PAYMENT_ATTEMPT_KEY, attemptId);
  } catch {
    // The server-owned attempt and its HttpOnly ownership cookie remain authoritative.
  }
}

export function pendingPaymentAttempt(): string | null {
  try {
    const value = sessionStorage.getItem(PAYMENT_ATTEMPT_KEY);
    return value && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
  } catch {
    return null;
  }
}

export const commerceMode: CommerceMode =
  runtimeEnv?.VITE_COMMERCE_MODE === "justicesure-headless"
    ? "justicesure-headless"
    : "catalog-preview";

export const commerceGateway: CommerceGateway =
  commerceMode === "justicesure-headless"
    ? new JusticeSureHeadlessGateway()
    : {
        mode: "catalog-preview",
        async listProducts() {
          return [];
        },
        async getProduct() {
          return undefined;
        },
        async discover() {
          throw new CommerceConfigurationError("commerce_disabled");
        },
        async createQuote() {
          throw new CommerceConfigurationError("commerce_disabled");
        },
        async createCheckoutSession() {
          throw new CommerceConfigurationError(
            "commerce_disabled",
          );
        },
      };

export type CommerceQuote = {
  id: string; expiresAt: string; currency: "NGN"; displayCurrency: string; chargeCurrency: string; settlementCurrency: string;
  amounts: Record<string, string>;
  currencyMinorUnitExponents?: Record<string, number>;
  payment: { provider: CheckoutRequest["paymentProvider"]; method: CheckoutRequest["paymentMethod"]; chargeCurrency: string; settlementCurrency: string };
};
