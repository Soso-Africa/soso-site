import type { CartItem } from "@/context/CartContext";
import type { CatalogProduct } from "@/data/products";

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
  notes?: string;
};

export type CheckoutResult = {
  attemptId: string;
  checkoutUrl: string;
};

export interface CommerceGateway {
  readonly mode: CommerceMode;
  listProducts(): Promise<CatalogProduct[]>;
  getProduct(slug: string): Promise<CatalogProduct | undefined>;
  createCheckoutSession(request: CheckoutRequest): Promise<CheckoutResult>;
}

export class CommerceConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommerceConfigurationError";
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

function toCatalogProduct(value: unknown): CatalogProduct {
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
    throw new CommerceConfigurationError("The live JusticeSure catalogue is incomplete. No payment has been taken.");
  }
  const labels = new Set<string>();
  const commerceVariantIds: Record<string, string> = {};
  for (const [index, value] of variants.entries()) {
    const variant = record(value);
    if (!variant || typeof variant.id !== "string" || typeof variant.label !== "string") {
      throw new CommerceConfigurationError("The live JusticeSure catalogue contains an invalid variant. No payment has been taken.");
    }
    const baseLabel = variant.label.trim() || `Option ${index + 1}`;
    const label = labels.has(baseLabel) ? `${baseLabel} (${index + 1})` : baseLabel;
    labels.add(label);
    commerceVariantIds[label] = variant.id;
  }
  const slugBase = product.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "product";
  const sizes = Object.keys(commerceVariantIds);
  return {
    slug: `${slugBase}-${product.id.slice(0, 8)}`,
    name: product.name,
    img: images[0] ?? "",
    price: price / 100,
    tag: product.inStock === false ? "Currently unavailable" : "JusticeSure collection",
    note: product.inStock === false ? "Currently unavailable for secure checkout" : "Live price and availability",
    category: "Online collection",
    description: typeof product.description === "string" ? product.description : "Published through JusticeSure.",
    sizes: sizes.length > 0 ? sizes : ["Standard"],
    commerceProductId: product.id,
    ...(sizes.length > 0 ? { commerceVariantIds } : {}),
  };
}

export class JusticeSureHeadlessGateway implements CommerceGateway {
  readonly mode = "justicesure-headless" as const;

  private async catalogue(): Promise<CatalogProduct[]> {
    const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";
    const response = await fetch(`${apiBase}/api/payment/catalog`, { credentials: "include" });
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as Record<string, string>;
      throw new CommerceConfigurationError(data.error ?? "The live JusticeSure catalogue is not available. No payment has been taken.");
    }
    const payload = await response.json() as { products?: CommerceCatalogProjection[] };
    if (!Array.isArray(payload.products)) {
      throw new CommerceConfigurationError("The live JusticeSure catalogue returned an invalid response. No payment has been taken.");
    }
    return payload.products.map(toCatalogProduct);
  }

  async listProducts(): Promise<CatalogProduct[]> {
    return this.catalogue();
  }

  async getProduct(slug: string): Promise<CatalogProduct | undefined> {
    return (await this.catalogue()).find((product) => product.slug === slug);
  }

  async createCheckoutSession(request: CheckoutRequest): Promise<CheckoutResult> {
    const operationKey = checkoutOperationKey(request);
    const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";
    const response = await fetch(`${apiBase}/api/payment/initiate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        checkoutOperationId: operationKey,
        customer: request.customer,
        fulfillment: request.fulfillment,
        notes: request.notes,
        items: request.items.map((item) => ({
          productId: item.commerceProductId,
          variantId: item.commerceVariantId,
          quantity: item.quantity,
          displayName: item.name,
          displaySlug: item.slug,
          selectedSize: item.size,
        })),
      }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as Record<string, string>;
      throw new CommerceConfigurationError(
        data.error ?? "Payment could not be started. No payment has been taken.",
      );
    }
    return response.json() as Promise<CheckoutResult>;
  }
}

const CHECKOUT_OPERATION_KEY = "soso-checkout-operation";
const PAYMENT_ATTEMPT_KEY = "soso-payment-attempt";

function checkoutOperationKey(request: CheckoutRequest): string {
  const signature = JSON.stringify({
    items: request.items.map((item) => [item.commerceProductId, item.commerceVariantId, item.quantity]),
    email: request.customer.email.trim().toLowerCase(),
    fulfillment: request.fulfillment,
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
  import.meta.env.VITE_COMMERCE_MODE === "justicesure-headless"
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
        async createCheckoutSession() {
          throw new CommerceConfigurationError(
            "Secure payment is being connected. If you have a question before paying, speak with a SOSO stylist.",
          );
        },
      };