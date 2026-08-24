export type JusticeSureProvider = "paystack" | "flutterwave";

export type JusticeSureLineItem = {
  productId: string;
  variantId?: string;
  quantity: number;
};

export type JusticeSureFulfillment = {
  type: "pickup" | "delivery";
  locationId?: string;
  address?: string;
  deliveryQuoteToken?: string;
};

export type JusticeSureOrder = {
  id: string;
  number: string;
  status: string;
  currency: "NGN";
  amounts: {
    subtotalKobo: number;
    deliveryKobo: number;
    totalKobo: number;
    paidKobo?: number;
    refundedKobo?: number;
  };
  payment: Record<string, unknown>;
  fulfillment: Record<string, unknown>;
  items: unknown[];
};

export type JusticeSureDeliveryQuote = {
  currency: "NGN";
  cartSubtotalKobo: number;
  feeKobo: number;
  distanceKm?: number;
  quoteToken: string;
  expiresInSeconds: number;
};

export type JusticeSurePaymentSession = {
  provider: JusticeSureProvider;
  reference: string;
  checkoutUrl: string;
  accessCode?: string;
  replayed: boolean;
};

export type JusticeSureCatalogVariant = {
  id: string;
  label: string;
};

export type JusticeSureCatalogProduct = {
  id: string;
  name: string;
  description: string | null;
  images: string[];
  amountKobo: number;
  inStock: boolean;
  variants: JusticeSureCatalogVariant[];
};

export type JusticeSureConfig = {
  baseUrl?: string;
  apiKey?: string;
  webhookSecret?: string;
  paymentProvider?: JusticeSureProvider;
  paymentReturnUrl?: string;
  runtimeReady: boolean;
};

export class JusticeSureConfigurationError extends Error {}

export class JusticeSureRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly requestId?: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "JusticeSureRequestError";
  }
}

function configuredProvider(value: string | undefined): JusticeSureProvider | undefined {
  return value === "paystack" || value === "flutterwave" ? value : undefined;
}

function isHttpsUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function justiceSureConfig(): JusticeSureConfig {
  const baseUrl = process.env.JUSTICESURE_COMMERCE_BASE_URL?.replace(/\/+$/, "");
  const paymentReturnUrl = process.env.SOSO_PAYMENT_RETURN_URL;
  return {
    baseUrl: isHttpsUrl(baseUrl) ? baseUrl : undefined,
    apiKey: process.env.JUSTICESURE_COMMERCE_API_KEY,
    webhookSecret: process.env.JUSTICESURE_COMMERCE_WEBHOOK_SECRET,
    paymentProvider: configuredProvider(process.env.JUSTICESURE_PAYMENT_PROVIDER),
    paymentReturnUrl: isHttpsUrl(paymentReturnUrl) ? paymentReturnUrl : undefined,
    runtimeReady: process.env.JUSTICESURE_COMMERCE_RUNTIME_READY === "true",
  };
}

export function isJusticeSureCommerceReady(config = justiceSureConfig()): boolean {
  return Boolean(
    config.runtimeReady
      && config.baseUrl
      && config.apiKey
      && config.webhookSecret
      && config.paymentProvider
      && (config.paymentProvider !== "flutterwave" || config.paymentReturnUrl),
  );
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new JusticeSureRequestError(`JusticeSure returned an invalid ${label} response.`, 502);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new JusticeSureRequestError(`JusticeSure returned an invalid ${label}.`, 502);
  }
  return value;
}

function integer(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new JusticeSureRequestError(`JusticeSure returned an invalid ${label}.`, 502);
  }
  return value;
}

function uuid(value: unknown, label: string): string {
  const parsed = text(value, label);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed)) {
    throw new JusticeSureRequestError(`JusticeSure returned an invalid ${label}.`, 502);
  }
  return parsed;
}

function responseData(value: unknown): Record<string, unknown> {
  return record(record(value, "Commerce API").data, "Commerce API data");
}

function responseList(value: unknown): unknown[] {
  const data = record(value, "Commerce API").data;
  if (Array.isArray(data)) return data;
  const projection = record(data, "Commerce API list data");
  if (Array.isArray(projection.items)) return projection.items;
  if (Array.isArray(projection.products)) return projection.products;
  if (Array.isArray(projection.locations)) return projection.locations;
  throw new JusticeSureRequestError("JusticeSure returned an invalid Commerce list response.", 502);
}

function parseCatalogProduct(value: unknown): JusticeSureCatalogProduct {
  const product = record(value, "catalog product");
  const price = record(product.price, "catalog price");
  const availability = record(product.availability, "catalog availability");
  const images = Array.isArray(product.images)
    ? product.images.filter((image): image is string => typeof image === "string" && image.length > 0)
    : [];
  if (images.length === 0) {
    throw new JusticeSureRequestError("JusticeSure returned a catalog product without a usable image.", 502);
  }
  if (typeof availability.inStock !== "boolean") {
    throw new JusticeSureRequestError("JusticeSure returned an invalid catalog availability value.", 502);
  }
  if (!Array.isArray(product.variants)) {
    throw new JusticeSureRequestError("JusticeSure returned invalid catalog variants.", 502);
  }
  const variants = product.variants.map((value, index) => {
    const variant = record(value, "catalog variant");
    return {
      id: uuid(variant.id, "catalog variant id"),
      label: typeof variant.label === "string" && variant.label.trim()
        ? variant.label.trim()
        : `Option ${index + 1}`,
    };
  });
  return {
    id: uuid(product.id, "catalog product id"),
    name: text(product.name, "catalog product name"),
    description: typeof product.description === "string" ? product.description : null,
    images,
    amountKobo: integer(price.amountKobo, "catalog price"),
    inStock: availability.inStock,
    variants,
  };
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseError(body: unknown): { message: string; code?: string; requestId?: string } {
  const outer = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const nested = outer.error && typeof outer.error === "object" ? outer.error as Record<string, unknown> : {};
  return {
    message: typeof nested.message === "string"
      ? nested.message
      : typeof outer.error === "string"
        ? outer.error
        : "JusticeSure could not complete this request.",
    code: typeof nested.code === "string" ? nested.code : typeof outer.code === "string" ? outer.code : undefined,
    requestId: typeof outer.requestId === "string" ? outer.requestId : undefined,
  };
}

function parseOrder(value: unknown): JusticeSureOrder {
  const data = responseData(value);
  const amounts = record(data.amounts, "order amounts");
  return {
    id: text(data.id, "order id"),
    number: text(data.number, "order number"),
    status: text(data.status, "order status"),
    currency: data.currency === "NGN" ? "NGN" : (() => { throw new JusticeSureRequestError("JusticeSure returned an unsupported order currency.", 502); })(),
    amounts: {
      subtotalKobo: integer(amounts.subtotalKobo, "subtotal amount"),
      deliveryKobo: integer(amounts.deliveryKobo, "delivery amount"),
      totalKobo: integer(amounts.totalKobo, "total amount"),
      paidKobo: typeof amounts.paidKobo === "number" ? integer(amounts.paidKobo, "paid amount") : undefined,
      refundedKobo: typeof amounts.refundedKobo === "number" ? integer(amounts.refundedKobo, "refunded amount") : undefined,
    },
    payment: record(data.payment, "order payment"),
    fulfillment: record(data.fulfillment, "order fulfillment"),
    items: Array.isArray(data.items) ? data.items : [],
  };
}

export class JusticeSureCommerceClient {
  constructor(private readonly config = justiceSureConfig()) {
    if (!isJusticeSureCommerceReady(config)) {
      throw new JusticeSureConfigurationError(
        "Secure payment is not available while the JusticeSure v1 runtime and staging configuration are being verified. No payment has been taken.",
      );
    }
  }

  private async request(path: string, options: RequestInit & { idempotencyKey?: string } = {}): Promise<{ body: unknown; headers: Headers }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(`${this.config.baseUrl}${path}`, {
        ...options,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
          ...options.headers,
        },
        signal: controller.signal,
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const error = parseError(body);
        throw new JusticeSureRequestError(
          error.message,
          response.status,
          error.code,
          error.requestId,
          parseRetryAfter(response.headers.get("retry-after")),
        );
      }
      return { body, headers: response.headers };
    } catch (error) {
      if (error instanceof JusticeSureRequestError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new JusticeSureRequestError("JusticeSure did not respond in time. It is safe to retry this checkout.", 504);
      }
      throw new JusticeSureRequestError("JusticeSure could not be reached. No payment has been taken.", 503);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async idempotentRequest(path: string, options: RequestInit & { idempotencyKey: string }): Promise<{ body: unknown; headers: Headers }> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.request(path, options);
      } catch (error) {
        const retryable = error instanceof JusticeSureRequestError
          && (error.status === 429 || error.status >= 500);
        if (!retryable || attempt === 1) throw error;
        const retryAfterMs = Math.min((error.retryAfterSeconds ?? 1) * 1_000, 3_000);
        await new Promise<void>((resolve) => setTimeout(resolve, retryAfterMs));
      }
    }
    throw new JusticeSureRequestError("JusticeSure did not complete the idempotent request.", 503);
  }

  async listProducts(): Promise<JusticeSureCatalogProduct[]> {
    const { body } = await this.request("/products");
    return responseList(body).map(parseCatalogProduct);
  }

  async listLocations(): Promise<unknown[]> {
    const { body } = await this.request("/locations");
    return responseList(body);
  }

  async createDeliveryQuote(items: JusticeSureLineItem[], address: string, locationId?: string): Promise<JusticeSureDeliveryQuote> {
    const { body } = await this.request("/delivery-quotes", {
      method: "POST",
      body: JSON.stringify({ items, address, ...(locationId ? { locationId } : {}) }),
    });
    const data = responseData(body);
    return {
      currency: data.currency === "NGN" ? "NGN" : (() => { throw new JusticeSureRequestError("JusticeSure returned an unsupported quote currency.", 502); })(),
      cartSubtotalKobo: integer(data.cartSubtotalKobo, "quote subtotal"),
      feeKobo: integer(data.feeKobo, "quote fee"),
      distanceKm: typeof data.distanceKm === "number" ? data.distanceKm : undefined,
      quoteToken: text(data.quoteToken, "delivery quote token"),
      expiresInSeconds: integer(data.expiresInSeconds, "delivery quote expiry"),
    };
  }

  async createOrder(input: {
    customer: { name: string; email: string; phone: string };
    items: JusticeSureLineItem[];
    fulfillment: JusticeSureFulfillment;
    paymentMethod: JusticeSureProvider;
    notes?: string;
    idempotencyKey: string;
  }): Promise<JusticeSureOrder> {
    const { body } = await this.idempotentRequest("/orders", {
      method: "POST",
      idempotencyKey: input.idempotencyKey,
      body: JSON.stringify({
        customer: input.customer,
        items: input.items,
        fulfillment: input.fulfillment,
        paymentMethod: input.paymentMethod,
        ...(input.notes ? { notes: input.notes } : {}),
      }),
    });
    return parseOrder(body);
  }

  async createPaymentSession(input: {
    orderId: string;
    checkoutAttemptId: string;
    provider: JusticeSureProvider;
    email: string;
    idempotencyKey: string;
  }): Promise<JusticeSurePaymentSession> {
    const redirectUrl = this.config.paymentReturnUrl
      ? (() => {
          const url = new URL(this.config.paymentReturnUrl);
          url.searchParams.set("attempt", input.checkoutAttemptId);
          return url.toString();
        })()
      : undefined;
    const payload = {
      provider: input.provider,
      email: input.email,
      ...(input.provider === "flutterwave" ? { redirectUrl } : {}),
    };
    if (input.provider === "flutterwave" && !this.config.paymentReturnUrl) {
      throw new JusticeSureConfigurationError("The approved SOSO payment return URL is required before Flutterwave checkout can be enabled.");
    }
    const { body, headers } = await this.idempotentRequest(`/orders/${encodeURIComponent(input.orderId)}/payment-sessions`, {
      method: "POST",
      idempotencyKey: input.idempotencyKey,
      body: JSON.stringify(payload),
    });
    const data = responseData(body);
    const checkoutUrl = text(data.checkoutUrl, "hosted checkout URL");
    if (!isHttpsUrl(checkoutUrl)) {
      throw new JusticeSureRequestError("JusticeSure returned a non-HTTPS hosted checkout URL.", 502);
    }
    const provider = data.provider === "paystack" || data.provider === "flutterwave"
      ? data.provider
      : (() => { throw new JusticeSureRequestError("JusticeSure returned an unsupported payment provider.", 502); })();
    return {
      provider,
      reference: text(data.reference, "payment reference"),
      checkoutUrl,
      accessCode: typeof data.accessCode === "string" ? data.accessCode : undefined,
      replayed: headers.get("idempotency-replayed") === "true",
    };
  }

  async getOrder(orderId: string): Promise<JusticeSureOrder> {
    const { body } = await this.request(`/orders/${encodeURIComponent(orderId)}`);
    return parseOrder(body);
  }
}
