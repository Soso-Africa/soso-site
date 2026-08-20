import type { CartItem } from "@/context/CartContext";
import type { CatalogProduct } from "@/data/products";

export type CommerceMode = "catalog-preview" | "justicesure-headless";

export type StockCheck = {
  lineId: string;
  available: boolean;
  reason?: string;
};

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
  validateCart(items: CartItem[]): Promise<StockCheck[]>;
  createOrder(request: CheckoutRequest): Promise<CheckoutResult>;
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
 * guessed URLs, request bodies, or fallback order behaviour.
 */
export class JusticeSureHeadlessGateway implements CommerceGateway {
  readonly mode = "justicesure-headless" as const;

  private unavailable(): never {
    throw new CommerceConfigurationError(
      "JusticeSure headless API details are required before live catalog, stock, or orders can be enabled.",
    );
  }

  async listProducts(): Promise<CatalogProduct[]> {
    return this.unavailable();
  }

  async getProduct(_slug: string): Promise<CatalogProduct | undefined> {
    return this.unavailable();
  }

  async validateCart(_items: CartItem[]): Promise<StockCheck[]> {
    return this.unavailable();
  }

  async createOrder(_request: CheckoutRequest): Promise<CheckoutResult> {
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
        async validateCart(items) {
          return items.map((item) => ({
            lineId: `${item.slug}-${item.size}`,
            available: false,
            reason: "Availability is confirmed when live commerce is connected.",
          }));
        },
        async createOrder() {
          throw new CommerceConfigurationError(
            "Online checkout is being connected. Please speak with a SOSO stylist to place your order.",
          );
        },
      };