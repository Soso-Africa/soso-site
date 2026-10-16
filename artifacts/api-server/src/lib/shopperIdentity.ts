import { createHash } from "node:crypto";
import type { Request } from "express";
import { and, eq } from "drizzle-orm";
import { db, shopperCustomersTable, type ShopperCustomer } from "@workspace/db";
import { JusticeSureCustomersClient, ShopperError, type RemoteCustomer } from "./justicesureCustomers";
import { SHOPPER_ISSUER } from "./shopper-auth-session";

export type VerifiedShopper = { issuer: string; subject: string; externalId: string; email: string; name: string | null };

export function shopperExternalId(issuer: string, subject: string): string {
  return `soso:${createHash("sha256").update(JSON.stringify([issuer, subject])).digest("hex")}`;
}

export async function verifiedShopper(req: Request): Promise<VerifiedShopper> {
  const user = req.shopper;
  if (!user) throw new ShopperError(401, "SIGN_IN_REQUIRED", "Sign in to your shopper account.");
  if (!user.emailVerified) {
    throw new ShopperError(403, "EMAIL_NOT_VERIFIED", "Verify your email before linking your shopper account.");
  }
  return {
    issuer: SHOPPER_ISSUER, subject: user.id, externalId: shopperExternalId(SHOPPER_ISSUER, user.id),
    email: user.email, name: user.name,
  };
}

function bindingWhere(identity: VerifiedShopper, client: JusticeSureCustomersClient) {
  return and(
    eq(shopperCustomersTable.merchantScope, "soso"),
    eq(shopperCustomersTable.commerceOrigin, client.origin),
    eq(shopperCustomersTable.environment, client.environment),
    eq(shopperCustomersTable.authIssuer, identity.issuer),
    eq(shopperCustomersTable.authSubject, identity.subject),
  );
}
export async function shopperBinding(identity: VerifiedShopper, client: JusticeSureCustomersClient): Promise<ShopperCustomer | undefined> {
  const [binding] = await db.select().from(shopperCustomersTable).where(bindingWhere(identity, client)).limit(1);
  if (binding && (binding.externalId !== identity.externalId || binding.verifiedEmail !== identity.email)) {
    throw new ShopperError(409, "CUSTOMER_IDENTITY_CONFLICT", "Your verified email has changed. Contact SOSO for a customer-record review.");
  }
  return binding;
}

export function assertCustomerIdentity(customer: RemoteCustomer, identity: VerifiedShopper, binding?: ShopperCustomer): void {
  if (customer.externalId !== identity.externalId
    || customer.verifiedEmail.toLowerCase() !== identity.email
    || (binding && binding.remoteCustomerId !== customer.id)) {
    throw new ShopperError(409, "CUSTOMER_IDENTITY_CONFLICT", "The customer link does not match your account. Contact SOSO for review.");
  }
}

export async function readLinkedShopper(identity: VerifiedShopper, client = new JusticeSureCustomersClient()): Promise<RemoteCustomer> {
  const binding = await shopperBinding(identity, client);
  if (!binding) throw new ShopperError(404, "CUSTOMER_NOT_FOUND", "Your shopper profile is not linked yet.");
  const customer = await client.profile(binding.externalId);
  // Revalidate the upstream merchant-scoped record on every access. A replaced
  // merchant key cannot silently move a local binding to a different company.
  assertCustomerIdentity(customer, identity, binding);
  return customer;
}

export async function linkShopper(identity: VerifiedShopper, name?: string, client = new JusticeSureCustomersClient()): Promise<RemoteCustomer> {
  const existing = await shopperBinding(identity, client);
  if (existing) return readLinkedShopper(identity, client);
  const profileName = name?.trim() || identity.name;
  if (!profileName) throw new ShopperError(400, "NAME_REQUIRED", "Enter your name to complete your shopper profile.");
  const customer = await client.link({ externalId: identity.externalId, email: identity.email, emailVerified: true, name: profileName });
  assertCustomerIdentity(customer, identity);
  // Remote link is idempotent. If this local commit fails, replaying links the
  // same upstream record. Concurrent inserts must resolve to the same binding.
  await db.insert(shopperCustomersTable).values({
    merchantScope: "soso", commerceOrigin: client.origin, environment: client.environment,
    authIssuer: identity.issuer, authSubject: identity.subject, externalId: identity.externalId,
    verifiedEmail: identity.email, remoteCustomerId: customer.id,
  }).onConflictDoNothing();
  const binding = await shopperBinding(identity, client);
  if (!binding) throw new ShopperError(409, "CUSTOMER_IDENTITY_CONFLICT", "This customer is already linked to another account. Contact SOSO for review.");
  assertCustomerIdentity(customer, identity, binding);
  return customer;
}

/** Called only on auth-enabled payment routes. Guests remain unlinked. */
export async function checkoutShopper(req: Request, email: string): Promise<{ customerExternalId?: string }> {
  // An unverified session carries no customer authority and remains guest checkout.
  if (!req.shopper?.emailVerified) return {};
  const identity = await verifiedShopper(req);
  const customer = await readLinkedShopper(identity);
  if (email.toLowerCase() !== customer.verifiedEmail.toLowerCase()) {
    throw new ShopperError(409, "CHECKOUT_EMAIL_MISMATCH", "Use your verified account email for this checkout, or sign out to check out as a guest.");
  }
  return { customerExternalId: identity.externalId };
}
