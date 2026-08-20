import type { CartItem } from "@/context/CartContext";
import type { CatalogProduct } from "@/data/products";

export type CommerceMode = "catalog-preview" | "justicesure-headless";

export type CheckoutRequest = {
  customer: {
    name: string;
    email: string;
    phone: string;
    deliveryNote?: string;
  };
  items: CartItem[];
};

export type CheckoutResult = {
  orderId: string;
  checkoutUrl?: string;
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

/**
 * JusticeSure's team has confirmed a headless API will be available, but its
 * authenticated contract has not been supplied. This intentionally has no
 * guessed URLs, request bodies, or fallback payment behaviour. SOSO takes
 * payment first; the atelier confirms the making details after payment.
 */
export class JusticeSureHeadlessGateway implements CommerceGateway {
  readonly mode = "justicesure-headless" as const;

  private unavailable(): never {
    throw new CommerceConfigurationError(
      "JusticeSure headless API details are required before live catalog, production confirmation, or orders can be enabled.",
    );
  }

  async listProducts(): Promise<CatalogProduct[]> {
    return this.unavailable();
  }

  async getProduct(_slug: string): Promise<CatalogProduct | undefined> {
    return this.unavailable();
  }

  async createCheckoutSession(_request: CheckoutRequest): Promise<CheckoutResult> {
    return this.unavailable();
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