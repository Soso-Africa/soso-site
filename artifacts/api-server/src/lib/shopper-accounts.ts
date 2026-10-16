import type { Request } from "express";
import { z } from "zod";
import { GetShopperProfileResponse } from "@workspace/api-zod";
import { justiceSureConfig } from "./justicesureCommerce";
import {
  shopperExternalId, linkShopper, verifiedShopper as verifiedBoundShopper,
  type VerifiedShopper as BoundShopper,
} from "./shopperIdentity";
import { ShopperError } from "./justicesureCustomers";
import { SHOPPER_ISSUER } from "./shopper-auth-session";

export { ShopperError };

export function shopperSubject(req: Request, optional = false): string | undefined {
  const userId = req.shopper?.id;
  if (!userId) {
    if (optional) return undefined;
    throw new ShopperError(401, "SIGN_IN_REQUIRED", "Sign in to your customer account.");
  }
  if (!req.shopper?.emailVerified) throw new ShopperError(403, "EMAIL_NOT_VERIFIED", "Verify your email before opening your account.");
  return shopperExternalId(SHOPPER_ISSUER, userId);
}

export function externalSubject(userId: string): string {
  if (!/^user_[A-Za-z0-9]+$/.test(userId)) throw new ShopperError(401, "INVALID_IDENTITY", "Sign in again.");
  return `soso:clerk:${userId}`;
}

export type VerifiedShopper = BoundShopper;

export async function verifiedShopper(req: Request): Promise<VerifiedShopper> {
  return verifiedBoundShopper(req);
}

export async function customerRequest<T>(
  path: string, schema: z.ZodType<T>, method = "GET", body?: unknown,
): Promise<T> {
  const config = justiceSureConfig();
  if (!config.baseUrl || !/^jsk_.{8,}$/.test(config.apiKey ?? "")) {
    throw new ShopperError(503, "CUSTOMER_SERVICE_UNAVAILABLE", "Customer profiles are temporarily unavailable. Please try again later.");
  }
  if (method !== "GET" && process.env.NODE_ENV !== "production" && !config.apiKey?.startsWith("jsk_test_")) {
    throw new ShopperError(503, "TEST_CUSTOMER_KEY_REQUIRED", "Account testing requires a customer-enabled JusticeSure Test key. No Live customer record has been changed.");
  }
  let response: globalThis.Response;
  try {
    response = await fetch(`${config.baseUrl}${path}`, {
      method, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000),
      headers: { Accept: "application/json", Authorization: `Bearer ${config.apiKey}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ShopperError(503, "CUSTOMER_SERVICE_UNAVAILABLE", "The customer service could not be reached. Refresh before retrying a save.");
  }
  const json = await response.json().catch(() => null) as { error?: { code?: string }; code?: string } | null;
  if (!response.ok) {
    const code = json?.error?.code ?? json?.code;
    if (code === "INSUFFICIENT_SCOPE" || response.status >= 500 || response.status === 401 || response.status === 429) {
      throw new ShopperError(503, "CUSTOMER_SERVICE_UNAVAILABLE", "Customer profiles are not available in this environment yet. Please contact SOSO or try again later.");
    }
    if (response.status === 404) throw new ShopperError(404, code === "CUSTOMER_NOT_FOUND" ? code : "NOT_FOUND", "This customer record was not found.");
    if (response.status === 409) throw new ShopperError(409, "CUSTOMER_CONFLICT", "The profile changed or this identity needs review. Refresh and retry; contact SOSO if the conflict remains.");
    if (response.status === 403) throw new ShopperError(403, "CUSTOMER_ACTION_UNAVAILABLE", "This profile is read-only or the requested feature is not enabled.");
    throw new ShopperError(400, "CUSTOMER_INPUT_REJECTED", "Check your details and the supported measurement fields, then try again.");
  }
  // Customer extension responses are direct objects; never unwrap .data here.
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new ShopperError(502, "CUSTOMER_RESPONSE_INVALID", "The customer service returned an unexpected response. Please try again later.");
  return parsed.data;
}

export function customerPath(subject: string): string { return `/customers/${encodeURIComponent(subject)}`; }

export async function linkVerifiedShopper(identity: VerifiedShopper, details: { name?: string; phone?: string | null; address?: string | null }) {
  const name = details.name?.trim() || identity.name;
  if (!name) throw new ShopperError(400, "NAME_REQUIRED", "Enter your name to complete your customer profile.");
  await linkShopper(identity, name);
  const result = await customerRequest(customerPath(identity.externalId), GetShopperProfileResponse);
  assertCustomerIdentity(result.customer, identity);
  return result;
}

export function assertCustomerIdentity(
  customer: { externalId: string; verifiedEmail: string }, identity: Pick<VerifiedShopper, "externalId" | "email">,
) {
  if (customer.externalId !== identity.externalId || customer.verifiedEmail.toLowerCase() !== identity.email.toLowerCase()) {
    throw new ShopperError(409, "CUSTOMER_IDENTITY_REVIEW_REQUIRED", "Your verified email and customer identity need review. Please contact SOSO; accounts are not merged automatically.");
  }
}

/** Checkout binds the authenticated subject, never a client-supplied CRM ID. */
export { checkoutShopper } from "./shopperIdentity";
