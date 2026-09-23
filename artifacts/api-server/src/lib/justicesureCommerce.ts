/**
 * Server-only adapter for the JusticeSure Headless Commerce v1 contract.
 * Keep the public routes deliberately narrower than the upstream contract:
 * private merchant-account and provider data never cross this boundary.
 */
export type JusticeSureProvider = "paystack" | "flutterwave" | "stripe" | "paypal" | "hydrogen";
export type JusticeSureSessionProvider = JusticeSureProvider | "simulated";
export type JusticeSurePaymentMethod = "card" | "bank_transfer" | "wallet" | "paypal" | "virtual_account";

export type JusticeSureLineItem = { productId: string; variantId?: string; quantity: number };
export type JusticeSureFulfillment = {
  type: "pickup" | "delivery";
  locationId?: string;
  address?: string;
  destinationCountry?: string;
  shippingAddress?: {
    country: string; region: string; city: string; postalCode: string; addressLines: string[];
    recipientName: string; recipientPhone: string; deliveryInstructions?: string;
  };
  package?: { weightGrams: number; lengthMm: number; widthMm: number; heightMm: number; restrictedGoods: boolean };
};

export type JusticeSureCatalogVariant = {
  id: string;
  name: string;
  label: string;
  attributes: Record<string, string | number | boolean>;
  amountKobo: number;
  inStock: boolean;
};
export type JusticeSureCatalogProduct = {
  id: string; name: string; description: string | null; images: string[]; amountKobo: number;
  inStock: boolean; variants: JusticeSureCatalogVariant[];
};
export type JusticeSureCurrency = {
  code: string; name: string; symbol: string; minorUnitExponent: number;
  displaySupported: boolean; chargeSupported: boolean; settlementSupported: boolean;
};
export type JusticeSurePaymentReadiness = {
  provider: JusticeSureProvider; eligible: boolean; methods: JusticeSurePaymentMethod[];
  chargeCurrencies: string[]; settlementCurrencies: string[]; reasonCode: string | null;
};
export type JusticeSurePaymentMethods = {
  providers: JusticeSurePaymentReadiness[]; country: string | null; currency: string | null;
};
export type JusticeSureCorridor = {
  id: string; carrier: string; service: string; originCountry: string; destinationCountry: string;
  revision: number; importerOfRecord: string | null; publicSummary?: Record<string, unknown>;
};
export type JusticeSureQuote = {
  id: string; expiresAt: string; currency: "NGN"; displayCurrency: string; chargeCurrency: string;
  settlementCurrency: string; amounts: Record<string, string>; fxSnapshotId: string | null;
  payment?: { provider: JusticeSureProvider; method: JusticeSurePaymentMethod; chargeCurrency: string; settlementCurrency: string };
  lines?: JusticeSureQuoteLine[]; fulfillment?: JusticeSureQuoteFulfillment;
};
export type JusticeSureQuoteLine = {
  inventoryItemId: string; variantId: string | null; name: string; quantity: number; unitPrice: number; unitPriceKobo: string;
};
export type JusticeSureQuoteFulfillment = {
  type: "pickup" | "delivery"; locationId: string | null; address: string | null; destinationCountry: string;
  shippingAddress: Record<string, unknown> | null; corridor?: Record<string, unknown>;
};
export type JusticeSureOrderRequestBody = {
  customer: { name: string; email: string; phone?: string };
  items: JusticeSureLineItem[];
  fulfillment: JusticeSureFulfillment;
  paymentMethod: JusticeSureProvider;
  quoteId: string;
  displayCurrency: string;
  notes?: string;
};
export type JusticeSurePaymentSessionRequestBody = {
  provider: JusticeSureProvider;
  email?: string;
  redirectUrl?: string;
};
export type JusticeSureOrder = {
  id: string; number: string | null; status: string; currency: "NGN";
  amounts: {
    subtotalKobo: number; discountKobo: number; taxKobo: number; deliveryKobo: number; totalKobo: number;
    paidKobo: number; outstandingKobo: number; refundedKobo: number;
  };
  payment: { method: string | null; status: string | null; reference: string | null };
  delivery: { fulfillmentType: "pickup" | "delivery"; address: string | null; status: string; partner: string | null; trackingReference: string | null };
  fulfillment: { status: string }; items: unknown[];
};
export type JusticeSurePaymentSession = {
  provider: JusticeSureSessionProvider; reference: string; checkoutUrl: string; accessCode?: string;
  attemptId?: string; paymentIntentId?: string; originalCharge?: Record<string, unknown>; replayed: boolean;
};
export type JusticeSurePaymentAttemptLifecycle = {
  attemptId: string; status: "pending" | "authorized" | "succeeded" | "failed" | "cancelled"; paymentStatus: string;
};
export type JusticeSureConfig = {
  baseUrl?: string; apiKey?: string; webhookSecret?: string; paymentReturnUrl?: string; runtimeReady: boolean;
};

export class JusticeSureConfigurationError extends Error {}
export class JusticeSureRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string, readonly requestId?: string, readonly retryAfterSeconds?: number) {
    super(message); this.name = "JusticeSureRequestError";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROVIDERS = new Set<JusticeSureProvider>(["paystack", "flutterwave", "stripe", "paypal", "hydrogen"]);
const SESSION_PROVIDERS = new Set<JusticeSureSessionProvider>([...PROVIDERS, "simulated"]);
const METHODS = new Set<JusticeSurePaymentMethod>(["card", "bank_transfer", "wallet", "paypal", "virtual_account"]);
const CODE = /^[A-Z]{3}$/;
const COUNTRY = /^[A-Z]{2}$/;

function httpsUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) return undefined;
    return parsed.toString().replace(/\/+$/, "");
  } catch { return undefined; }
}
export function justiceSureConfig(): JusticeSureConfig {
  const development = process.env.NODE_ENV !== "production";
  return {
    baseUrl: httpsUrl(process.env.JUSTICESURE_COMMERCE_API_BASE_URL ?? process.env.JUSTICESURE_COMMERCE_BASE_URL),
    apiKey: development
      ? process.env.JUSTICESURE_COMMERCE_TEST_API_KEY ?? process.env.JUSTICESURE_COMMERCE_API_KEY
      : process.env.JUSTICESURE_COMMERCE_API_KEY,
    webhookSecret: development
      ? process.env.JUSTICESURE_COMMERCE_TEST_WEBHOOK_SECRET ?? process.env.JUSTICESURE_COMMERCE_WEBHOOK_SECRET
      : process.env.JUSTICESURE_COMMERCE_WEBHOOK_SECRET,
    paymentReturnUrl: httpsUrl(process.env.SOSO_PAYMENT_RETURN_URL),
    runtimeReady: process.env.JUSTICESURE_COMMERCE_RUNTIME_READY === "true",
  };
}
export function isJusticeSureCommerceReady(config = justiceSureConfig()): boolean {
  return Boolean(config.runtimeReady && config.baseUrl && /^jsk_.{8,}$/.test(config.apiKey ?? "") && config.webhookSecret && config.paymentReturnUrl);
}
export function isJusticeSureTestMode(config = justiceSureConfig()): boolean {
  return process.env.NODE_ENV !== "production" && /^jsk_test_.{8,}$/.test(config.apiKey ?? "");
}
function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new JusticeSureRequestError(`JusticeSure returned an invalid ${label} response.`, 502);
  return value as Record<string, unknown>;
}
function data(value: unknown): Record<string, unknown> { return object(object(value, "Commerce API").data, "Commerce API data"); }
function nonempty(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new JusticeSureRequestError(`JusticeSure returned an invalid ${label}.`, 502);
  return value;
}
function uuid(value: unknown, label: string): string {
  const parsed = nonempty(value, label);
  if (!UUID.test(parsed)) throw new JusticeSureRequestError(`JusticeSure returned an invalid ${label}.`, 502);
  return parsed;
}
function integer(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new JusticeSureRequestError(`JusticeSure returned an invalid ${label}.`, 502);
  return value as number;
}
function code(value: unknown, label: string): string {
  const parsed = nonempty(value, label).toUpperCase();
  if (!CODE.test(parsed)) throw new JusticeSureRequestError(`JusticeSure returned an invalid ${label}.`, 502);
  return parsed;
}
function optionalText(value: unknown): string | null { return typeof value === "string" ? value : value === null ? null : null; }
function responseList(value: unknown): unknown[] {
  const result = object(value, "Commerce API").data;
  if (Array.isArray(result)) return result;
  throw new JusticeSureRequestError("JusticeSure returned an invalid Commerce list response.", 502);
}
function responsePage(value: unknown): { rows: unknown[]; hasMore: boolean } {
  const envelope = object(value, "Commerce API");
  if (!Array.isArray(envelope.data)) {
    throw new JusticeSureRequestError("JusticeSure returned an invalid Commerce list response.", 502);
  }
  if (envelope.meta === undefined) return { rows: envelope.data, hasMore: false };
  const meta = object(envelope.meta, "Commerce pagination");
  if (typeof meta.hasMore !== "boolean") {
    throw new JusticeSureRequestError("JusticeSure returned invalid Commerce pagination.", 502);
  }
  return { rows: envelope.data, hasMore: meta.hasMore };
}
function parseError(body: unknown): { message: string; code?: string; requestId?: string } {
  const outer = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const nested = outer.error && typeof outer.error === "object" ? outer.error as Record<string, unknown> : {};
  return {
    message: typeof nested.message === "string" ? nested.message : typeof outer.error === "string" ? outer.error : "JusticeSure could not complete this request.",
    code: typeof nested.code === "string" ? nested.code : typeof outer.code === "string" ? outer.code : undefined,
    requestId: typeof outer.requestId === "string" ? outer.requestId : undefined,
  };
}
function retryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(1, Math.min(30, Math.ceil(seconds)));
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(1, Math.min(30, Math.ceil((date - Date.now()) / 1_000))) : undefined;
}
function idempotencyReplayed(headers: Headers, status: number, allowMissingTestReplay = false): boolean {
  const replayed = headers.get("idempotency-replayed");
  if (replayed === "true") return true;
  if (replayed === "false" || (replayed === null && status === 201)) return false;
  if (replayed === null && status === 200 && allowMissingTestReplay) return true;
  throw new JusticeSureRequestError("JusticeSure did not return required idempotency replay metadata.", 502);
}
function parseCatalogProduct(value: unknown): JusticeSureCatalogProduct {
  const product = object(value, "catalog product");
  const price = object(product.price, "catalog price");
  const availability = object(product.availability, "catalog availability");
  const variants = Array.isArray(product.variants) ? product.variants.map((entry, index) => {
    const variant = object(entry, "catalog variant");
    const variantPrice = object(variant.price, "catalog variant price");
    const variantAvailability = object(variant.availability, "catalog variant availability");
    const rawAttributes = object(variant.attributes, "catalog variant attributes");
    const attributes = Object.fromEntries(Object.entries(rawAttributes).map(([key, attribute]) => {
      if (typeof attribute !== "string" && typeof attribute !== "number" && typeof attribute !== "boolean") {
        throw new JusticeSureRequestError("JusticeSure returned invalid catalog variant attributes.", 502);
      }
      return [key, attribute];
    }));
    if (typeof variantAvailability.inStock !== "boolean") {
      throw new JusticeSureRequestError("JusticeSure returned invalid catalog variant availability.", 502);
    }
    const name = nonempty(variant.name, "catalog variant name");
    const attributeLabel = Object.values(attributes)
      .filter((attribute): attribute is string | number => typeof attribute === "string" || typeof attribute === "number")
      .map(String)
      .filter(Boolean)
      .join(" / ");
    return {
      id: uuid(variant.id, "catalog variant id"),
      name,
      label: attributeLabel || name || `Option ${index + 1}`,
      attributes,
      amountKobo: integer(variantPrice.amountKobo, "catalog variant price"),
      inStock: variantAvailability.inStock,
    };
  }) : (() => { throw new JusticeSureRequestError("JusticeSure returned invalid catalog variants.", 502); })();
  const images = Array.isArray(product.images) ? product.images.filter((image): image is string => typeof image === "string" && image.length > 0) : [];
  if (typeof availability.inStock !== "boolean") throw new JusticeSureRequestError("JusticeSure returned invalid catalog availability.", 502);
  return { id: uuid(product.id, "catalog product id"), name: nonempty(product.name, "catalog product name"), description: optionalText(product.description), images, amountKobo: integer(price.amountKobo, "catalog price"), inStock: availability.inStock, variants };
}
function parseOrder(value: unknown): JusticeSureOrder {
  const order = data(value); const amounts = object(order.amounts, "order amounts"); const payment = object(order.payment, "order payment");
  const delivery = object(order.delivery, "order delivery"); const fulfillment = object(order.fulfillment, "order fulfillment");
  if (order.currency !== "NGN" || (order.number !== null && typeof order.number !== "string") || typeof order.status !== "string" || !Array.isArray(order.items)
    || (payment.method !== null && typeof payment.method !== "string") || (payment.status !== null && typeof payment.status !== "string") || (payment.reference !== null && typeof payment.reference !== "string")
    || (delivery.fulfillmentType !== "pickup" && delivery.fulfillmentType !== "delivery") || typeof delivery.status !== "string" || typeof fulfillment.status !== "string") throw new JusticeSureRequestError("JusticeSure returned an invalid order.", 502);
  return {
    id: uuid(order.id, "order id"), number: order.number, status: order.status, currency: "NGN",
    amounts: { subtotalKobo: integer(amounts.subtotalKobo, "subtotal amount"), discountKobo: integer(amounts.discountKobo, "discount amount"), taxKobo: integer(amounts.taxKobo, "tax amount"), deliveryKobo: integer(amounts.deliveryKobo, "delivery amount"), totalKobo: integer(amounts.totalKobo, "total amount"), paidKobo: integer(amounts.paidKobo, "paid amount"), outstandingKobo: integer(amounts.outstandingKobo, "outstanding amount"), refundedKobo: integer(amounts.refundedKobo, "refunded amount") },
    payment: { method: payment.method, status: payment.status, reference: payment.reference },
    delivery: { fulfillmentType: delivery.fulfillmentType, address: optionalText(delivery.address), status: delivery.status, partner: optionalText(delivery.partner), trackingReference: optionalText(delivery.trackingReference) },
    fulfillment: { status: fulfillment.status }, items: order.items,
  };
}

export class JusticeSureCommerceClient {
  constructor(private readonly config = justiceSureConfig()) {
    if (!isJusticeSureCommerceReady(config)) throw new JusticeSureConfigurationError("Secure payment is not available while the JusticeSure v1 runtime and staging configuration are being verified. No payment has been taken.");
  }
  private async request(path: string, options: RequestInit & { idempotencyKey?: string } = {}): Promise<{ body: unknown; headers: Headers; status: number }> {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(`${this.config.baseUrl}${path}`, { ...options, headers: { Accept: "application/json", Authorization: `Bearer ${this.config.apiKey}`, ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}), ...options.headers }, signal: controller.signal });
      const body = await response.json().catch(() => null);
      if (!response.ok) { const error = parseError(body); throw new JusticeSureRequestError(error.message, response.status, error.code, error.requestId, retryAfter(response.headers.get("retry-after"))); }
      return { body, headers: response.headers, status: response.status };
    } catch (error) {
      if (error instanceof JusticeSureRequestError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") throw new JusticeSureRequestError("JusticeSure did not respond in time. It is safe to retry this checkout.", 504);
      throw new JusticeSureRequestError("JusticeSure could not be reached. No payment has been taken.", 503);
    } finally { clearTimeout(timer); }
  }
  private async idempotent(path: string, options: RequestInit & { idempotencyKey: string }) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try { return await this.request(path, options); } catch (error) {
        if (!(error instanceof JusticeSureRequestError) || (error.status !== 429 && error.status < 500) || attempt) throw error;
        await new Promise<void>((resolve) => setTimeout(resolve, Math.min((error.retryAfterSeconds ?? 1) * 1_000, 3_000)));
      }
    }
    throw new JusticeSureRequestError("JusticeSure did not complete the idempotent request.", 503);
  }
  async listProducts(): Promise<JusticeSureCatalogProduct[]> {
    const products: JusticeSureCatalogProduct[] = [];
    let offset = 0;
    for (;;) {
      const { body } = await this.request(`/products?limit=100&offset=${offset}`);
      const page = responsePage(body);
      products.push(...page.rows.map(parseCatalogProduct));
      if (!page.hasMore) return products;
      if (page.rows.length === 0 || products.length > 10_000) {
        throw new JusticeSureRequestError("JusticeSure returned invalid Commerce pagination.", 502);
      }
      offset += page.rows.length;
    }
  }
  async listLocations(): Promise<unknown[]> { const { body } = await this.request("/locations"); return responseList(body); }
  async listCurrencies(): Promise<JusticeSureCurrency[]> {
    const { body } = await this.request("/currencies");
    return responseList(body).map((value) => { const row = object(value, "currency"); if (typeof row.displaySupported !== "boolean" || typeof row.chargeSupported !== "boolean" || typeof row.settlementSupported !== "boolean") throw new JusticeSureRequestError("JusticeSure returned invalid currency metadata.", 502); return { code: code(row.code, "currency code"), name: nonempty(row.name, "currency name"), symbol: nonempty(row.symbol, "currency symbol"), minorUnitExponent: integer(row.minorUnitExponent, "currency minor unit exponent"), displaySupported: row.displaySupported, chargeSupported: row.chargeSupported, settlementSupported: row.settlementSupported }; });
  }
  async listPaymentMethods(country?: string, currency?: string): Promise<JusticeSurePaymentMethods> {
    const query = new URLSearchParams(); if (country) query.set("country", country); if (currency) query.set("currency", currency);
    const { body } = await this.request(`/payment-methods${query.size ? `?${query}` : ""}`); const result = data(body);
    if (!Array.isArray(result.providers) || (result.country !== null && typeof result.country !== "string") || (result.currency !== null && typeof result.currency !== "string")) throw new JusticeSureRequestError("JusticeSure returned invalid payment readiness.", 502);
    return { country: result.country, currency: result.currency, providers: result.providers.map((value) => { const row = object(value, "payment readiness"); if (!PROVIDERS.has(row.provider as JusticeSureProvider) || typeof row.eligible !== "boolean" || !Array.isArray(row.methods) || !row.methods.every((method) => METHODS.has(method as JusticeSurePaymentMethod)) || !Array.isArray(row.chargeCurrencies) || !Array.isArray(row.settlementCurrencies) || (row.reasonCode !== null && typeof row.reasonCode !== "string")) throw new JusticeSureRequestError("JusticeSure returned invalid payment readiness.", 502); return { provider: row.provider as JusticeSureProvider, eligible: row.eligible, methods: row.methods as JusticeSurePaymentMethod[], chargeCurrencies: row.chargeCurrencies.map((item) => code(item, "charge currency")), settlementCurrencies: row.settlementCurrencies.map((item) => code(item, "settlement currency")), reasonCode: row.reasonCode as string | null }; }) };
  }
  async listFulfillmentCorridors(): Promise<JusticeSureCorridor[]> {
    const { body } = await this.request("/fulfillment-corridors");
    return responseList(body).map((value) => { const row = object(value, "fulfillment corridor"); const originCountry = nonempty(row.originCountry, "origin country").toUpperCase(); const destinationCountry = nonempty(row.destinationCountry, "destination country").toUpperCase(); if (typeof row.carrier !== "string" || typeof row.service !== "string" || !Number.isSafeInteger(row.revision) || !COUNTRY.test(originCountry) || !COUNTRY.test(destinationCountry) || (row.importerOfRecord !== null && typeof row.importerOfRecord !== "string")) throw new JusticeSureRequestError("JusticeSure returned invalid fulfillment corridor.", 502); return { id: uuid(row.id, "corridor id"), carrier: row.carrier, service: row.service, originCountry, destinationCountry, revision: row.revision as number, importerOfRecord: row.importerOfRecord as string | null, ...(row.publicSummary && typeof row.publicSummary === "object" && !Array.isArray(row.publicSummary) ? { publicSummary: row.publicSummary as Record<string, unknown> } : {}) }; });
  }
  async createPriceQuote(input: { items: JusticeSureLineItem[]; fulfillment: JusticeSureFulfillment; displayCurrency?: string; paymentMethod?: JusticeSurePaymentMethod; provider?: JusticeSureProvider; customerCountry?: string }): Promise<JusticeSureQuote> {
    const { body } = await this.request("/price-quotes", { method: "POST", body: JSON.stringify(input) }); return this.parseQuote(data(body), true);
  }
  async getPriceQuote(quoteId: string): Promise<JusticeSureQuote> {
    const { body } = await this.request(`/price-quotes/${encodeURIComponent(uuid(quoteId, "quote id"))}`); return this.parseQuote(data(body), false);
  }
  private parseQuote(quote: Record<string, unknown>, created: boolean): JusticeSureQuote {
    const amounts = object(quote.amounts, "quote amounts");
    const fields = ["subtotalMinor", "discountMinor", "taxMinor", "shippingMinor", "insuranceMinor", "dutyMinor", "brokerageMinor", "roundingMinor", "totalMinor"];
    if (!fields.every((field) => typeof amounts[field] === "string" && /^-?\d+$/.test(amounts[field] as string)) || quote.currency !== "NGN" || (quote.fxSnapshotId !== null && !UUID.test(quote.fxSnapshotId as string))) throw new JusticeSureRequestError("JusticeSure returned invalid quote amounts.", 502);
    const expiresAt = nonempty(quote.expiresAt, "quote expiry");
    if (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now()) {
      throw new JusticeSureRequestError("JusticeSure returned an expired or invalid quote.", 410, "QUOTE_EXPIRED_REQUOTE_REQUIRED");
    }
    const result: JusticeSureQuote = { id: uuid(quote.id, "quote id"), expiresAt, currency: "NGN", displayCurrency: code(quote.displayCurrency, "display currency"), chargeCurrency: created ? "" : code(quote.chargeCurrency, "charge currency"), settlementCurrency: created ? "" : code(quote.settlementCurrency, "settlement currency"), amounts: amounts as Record<string, string>, fxSnapshotId: quote.fxSnapshotId as string | null };
    if (created) { const payment = object(quote.payment, "quote payment"); if (!PROVIDERS.has(payment.provider as JusticeSureProvider) || !METHODS.has(payment.method as JusticeSurePaymentMethod)) throw new JusticeSureRequestError("JusticeSure returned invalid quote payment authority.", 502); result.payment = { provider: payment.provider as JusticeSureProvider, method: payment.method as JusticeSurePaymentMethod, chargeCurrency: code(payment.chargeCurrency, "quote charge currency"), settlementCurrency: code(payment.settlementCurrency, "quote settlement currency") }; result.chargeCurrency = result.payment.chargeCurrency; result.settlementCurrency = result.payment.settlementCurrency; }
    else {
      if (!Array.isArray(quote.lines)) throw new JusticeSureRequestError("JusticeSure returned invalid quote lines.", 502);
      result.lines = quote.lines.map((value) => {
        const line = object(value, "quote line");
        if ((line.variantId !== null && line.variantId !== undefined && !UUID.test(line.variantId as string)) || typeof line.name !== "string"
          || !Number.isSafeInteger(line.quantity) || (line.quantity as number) < 1 || typeof line.unitPrice !== "number"
          || line.unitPrice < 0 || typeof line.unitPriceKobo !== "string" || !/^-?\d+$/.test(line.unitPriceKobo)) {
          throw new JusticeSureRequestError("JusticeSure returned invalid quote line details.", 502);
        }
        return { inventoryItemId: uuid(line.inventoryItemId, "quote inventory item id"), variantId: typeof line.variantId === "string" ? line.variantId : null, name: line.name, quantity: line.quantity as number, unitPrice: line.unitPrice, unitPriceKobo: line.unitPriceKobo };
      });
      const fulfillment = object(quote.fulfillment, "quote fulfillment");
      if ((fulfillment.type !== "pickup" && fulfillment.type !== "delivery")
        || (fulfillment.locationId !== null && !UUID.test(fulfillment.locationId as string))
        || (fulfillment.address !== null && typeof fulfillment.address !== "string")
        || typeof fulfillment.destinationCountry !== "string" || !COUNTRY.test(fulfillment.destinationCountry)
        || (fulfillment.shippingAddress !== null && (!fulfillment.shippingAddress || typeof fulfillment.shippingAddress !== "object" || Array.isArray(fulfillment.shippingAddress)))) {
        throw new JusticeSureRequestError("JusticeSure returned invalid quote fulfillment.", 502);
      }
      result.fulfillment = {
        type: fulfillment.type, locationId: fulfillment.locationId as string | null, address: fulfillment.address as string | null,
        destinationCountry: fulfillment.destinationCountry, shippingAddress: fulfillment.shippingAddress as Record<string, unknown> | null,
        ...(fulfillment.corridor && typeof fulfillment.corridor === "object" && !Array.isArray(fulfillment.corridor) ? { corridor: fulfillment.corridor as Record<string, unknown> } : {}),
      };
    }
    return result;
  }
  async createOrder(input: { body: JusticeSureOrderRequestBody; idempotencyKey: string }): Promise<{ order: JusticeSureOrder; replayed: boolean }> {
    // This is intentionally a verbatim stored canonical body. Reconstructing
    // optional values here (especially notes) changes idempotent wire bytes.
    const { body, headers, status } = await this.idempotent("/orders", { method: "POST", idempotencyKey: input.idempotencyKey, body: JSON.stringify(input.body) });
    return { order: parseOrder(body), replayed: idempotencyReplayed(headers, status) };
  }
  async createPaymentSession(input: { orderId: string; body: JusticeSurePaymentSessionRequestBody; idempotencyKey: string }): Promise<JusticeSurePaymentSession> {
    const { body, headers, status } = await this.idempotent(`/orders/${encodeURIComponent(uuid(input.orderId, "order id"))}/payment-sessions`, { method: "POST", idempotencyKey: input.idempotencyKey, body: JSON.stringify(input.body) });
    const result = data(body); const provider = result.provider;
    const checkoutUrl = typeof result.checkoutUrl === "string" ? result.checkoutUrl : undefined;
    const validCheckoutUrl = provider === "simulated"
      ? Boolean(checkoutUrl && /^https:\/\/justicesure\.ai\/business\/headless-commerce\?environment=test&/.test(checkoutUrl))
      : Boolean(httpsUrl(checkoutUrl));
    if (!SESSION_PROVIDERS.has(provider as JusticeSureSessionProvider) || typeof result.reference !== "string" || !validCheckoutUrl) throw new JusticeSureRequestError("JusticeSure returned an unusable hosted payment session.", 502);
    if (provider !== input.body.provider && provider !== "simulated") throw new JusticeSureRequestError("JusticeSure returned a payment session for a provider other than the immutable quote.", 502);
    const remoteAttemptId = result.attemptId === undefined ? undefined : uuid(result.attemptId, "payment attempt id");
    const paymentIntentId = result.paymentIntentId === undefined ? undefined : uuid(result.paymentIntentId, "payment intent id");
    const originalCharge = result.originalCharge === undefined ? undefined : object(result.originalCharge, "original charge");
    if (provider === "simulated") {
      if (result.environment !== "test" || result.simulated !== true || typeof result.paymentIntentId !== "string"
        || typeof result.attemptId !== "string" || !UUID.test(result.attemptId)
        || !UUID.test(result.paymentIntentId) || !originalCharge || !/^sim_[0-9a-f-]{36}$/i.test(result.reference)
        || !/^https:\/\/justicesure\.ai\/business\/headless-commerce\?environment=test&/.test(checkoutUrl as string)) {
        throw new JusticeSureRequestError("JusticeSure returned an invalid Test payment session.", 502);
      }
    }
    return {
      provider: provider as JusticeSureSessionProvider,
      reference: result.reference,
      checkoutUrl: checkoutUrl as string,
      ...(typeof result.accessCode === "string" ? { accessCode: result.accessCode } : {}),
      ...(remoteAttemptId ? { attemptId: remoteAttemptId } : {}),
      ...(paymentIntentId ? { paymentIntentId } : {}),
      ...(originalCharge ? { originalCharge } : {}),
      replayed: idempotencyReplayed(headers, status, provider === "simulated" && result.environment === "test"),
    };
  }
  async getOrder(orderId: string): Promise<JusticeSureOrder> { const { body } = await this.request(`/orders/${encodeURIComponent(uuid(orderId, "order id"))}`); return parseOrder(body); }
  async verifyPaymentAttempt(orderId: string, attemptId: string): Promise<JusticeSurePaymentAttemptLifecycle> { return this.paymentAttemptOperation(orderId, attemptId, "verify"); }
  async reconcilePaymentAttempt(orderId: string, attemptId: string): Promise<JusticeSurePaymentAttemptLifecycle> { return this.paymentAttemptOperation(orderId, attemptId, "reconcile"); }
  private async paymentAttemptOperation(orderId: string, attemptId: string, operation: "verify" | "reconcile"): Promise<JusticeSurePaymentAttemptLifecycle> {
    const { body } = await this.request(`/orders/${encodeURIComponent(uuid(orderId, "order id"))}/payment-attempts/${encodeURIComponent(uuid(attemptId, "payment attempt id"))}/${operation}`, { method: "POST" });
    const result = data(body); if (result.attemptId !== attemptId || !UUID.test(result.attemptId as string) || !["pending", "authorized", "succeeded", "failed", "cancelled"].includes(result.status as string) || typeof result.paymentStatus !== "string") throw new JusticeSureRequestError("JusticeSure returned invalid payment recovery status.", 502);
    return { attemptId: result.attemptId as string, status: result.status as JusticeSurePaymentAttemptLifecycle["status"], paymentStatus: result.paymentStatus };
  }
}