import { z } from "zod";
import { justiceSureConfig, isJusticeSureCommerceReadable, type JusticeSureConfig } from "./justicesureCommerce";

export class ShopperError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = "ShopperError";
  }
}

const nullableText = z.string().nullable();
export const remoteCustomerSchema = z.object({
  customer: z.object({
    id: z.string().uuid(),
    externalId: z.string().min(1).max(200),
    name: z.string().min(1).max(255),
    email: nullableText,
    verifiedEmail: z.string().email().max(255),
    phone: nullableText,
    address: nullableText,
  }),
});
export type RemoteCustomer = z.infer<typeof remoteCustomerSchema>["customer"];

/** Only documented merchant-scoped routes. Customer JSON has NO data wrapper. */
export class JusticeSureCustomersClient {
  readonly environment: "test" | "live";
  readonly origin: string;
  constructor(private readonly config: JusticeSureConfig = justiceSureConfig()) {
    if (!isJusticeSureCommerceReadable(config)) {
      throw new ShopperError(503, "CUSTOMER_SERVICE_UNAVAILABLE", "Customer profiles are temporarily unavailable. Please retry.");
    }
    this.environment = config.apiKey!.startsWith("jsk_test_") ? "test" : "live";
    this.origin = config.baseUrl!;
  }

  async request(path: string, method = "GET", body?: unknown): Promise<unknown> {
    if (method !== "GET" && process.env.NODE_ENV !== "production" && this.environment !== "test") {
      throw new ShopperError(503, "TEST_CUSTOMER_KEY_REQUIRED", "Account testing requires a customer-enabled JusticeSure Test key. No Live customer record has been changed.");
    }
    let response: globalThis.Response;
    try {
      response = await fetch(`${this.origin}/customers${path}`, {
        method,
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(12_000),
        redirect: "error",
      });
    } catch {
      throw new ShopperError(503, "CUSTOMER_SERVICE_UNAVAILABLE", "Customer service did not respond. You can safely retry linking or saving this same profile.");
    }
    const value: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = value && typeof value === "object" ? value as Record<string, unknown> : {};
      const detail = error.error && typeof error.error === "object" ? error.error as Record<string, unknown> : error;
      const code = typeof detail.code === "string" ? detail.code : typeof error.code === "string" ? error.code : "CUSTOMER_SERVICE_UNAVAILABLE";
      const messages: Record<string, string> = {
        CUSTOMER_NOT_FOUND: "Your shopper profile is not linked yet.",
        ORDER_NOT_FOUND: "This order is not available in your account.",
        CUSTOMER_MATCH_AMBIGUOUS: "Your customer record needs a SOSO review before it can be linked. Please contact SOSO.",
        CUSTOMER_IDENTITY_CONFLICT: "Your verified email or customer identity has changed. Please contact SOSO for review.",
        SHOP_ACCOUNT_REVIEW_REQUIRED: "Your customer record needs a SOSO review before it can be linked. Please contact SOSO.",
        CUSTOMER_SCHEMA_REQUIRED: "Shopper accounts need a service update before they can be used. Please retry later.",
        INSUFFICIENT_SCOPE: "Customer access is not yet enabled for this store. Please retry later.",
      };
      const status = response.status === 401 || response.status === 403 || response.status >= 500 ? 503 : response.status;
      throw new ShopperError(status, code, messages[code] ?? "Customer service could not complete this request. Please retry or contact SOSO.");
    }
    return value;
  }

  async profile(externalId: string): Promise<RemoteCustomer> {
    return this.parseCustomer(await this.request(`/${encodeURIComponent(externalId)}`));
  }
  async link(input: { externalId: string; email: string; emailVerified: true; name: string }): Promise<RemoteCustomer> {
    return this.parseCustomer(await this.request("/link", "POST", input));
  }
  async update(externalId: string, input: { name: string; phone: string | null; address: string | null }): Promise<RemoteCustomer> {
    return this.parseCustomer(await this.request(`/${encodeURIComponent(externalId)}`, "PATCH", input));
  }
  private parseCustomer(value: unknown): RemoteCustomer {
    const parsed = remoteCustomerSchema.safeParse(value);
    if (!parsed.success) throw new ShopperError(502, "INVALID_CUSTOMER_RESPONSE", "Customer service returned an invalid profile. Please retry.");
    return parsed.data.customer;
  }
}
