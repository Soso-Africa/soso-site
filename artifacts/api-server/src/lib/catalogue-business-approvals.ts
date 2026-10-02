import { createHash } from "node:crypto";
import type { PlatformContent } from "./platform-content";

export const CATALOGUE_BUSINESS_APPROVALS_KEY = "catalogue-business-approvals";

type Product = PlatformContent["products"][number];

export type CatalogueBusinessApproval = {
  fingerprint: string;
  actorClerkUserId: string;
  approvedAt: string;
};

export type CatalogueBusinessApprovalLedger = {
  version: 1;
  approvals: Record<string, CatalogueBusinessApproval>;
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => [key, canonicalize(child)]));
}

export function productBusinessFingerprint(product: Product): string {
  const snapshot = structuredClone(product) as unknown as Record<string, unknown>;
  const confirmation = snapshot.commerceMappingConfirmation;
  if (confirmation && typeof confirmation === "object" && !Array.isArray(confirmation)) {
    const stableConfirmation = { ...(confirmation as Record<string, unknown>) };
    delete stableConfirmation.confirmedAt;
    delete stableConfirmation.snapshotFetchedAt;
    snapshot.commerceMappingConfirmation = stableConfirmation;
  }
  return createHash("sha256").update(JSON.stringify(canonicalize(snapshot))).digest("hex");
}

export function parseCatalogueBusinessApprovalLedger(value: unknown): CatalogueBusinessApprovalLedger {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { version: 1, approvals: {} };
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== 1 || !candidate.approvals || typeof candidate.approvals !== "object" || Array.isArray(candidate.approvals)) {
    return { version: 1, approvals: {} };
  }
  const approvals: Record<string, CatalogueBusinessApproval> = {};
  for (const [slug, raw] of Object.entries(candidate.approvals as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const approval = raw as Record<string, unknown>;
    if (
      typeof approval.fingerprint === "string"
      && /^[a-f0-9]{64}$/.test(approval.fingerprint)
      && typeof approval.actorClerkUserId === "string"
      && approval.actorClerkUserId.length > 0
      && typeof approval.approvedAt === "string"
      && Number.isFinite(Date.parse(approval.approvedAt))
    ) {
      approvals[slug] = {
        fingerprint: approval.fingerprint,
        actorClerkUserId: approval.actorClerkUserId,
        approvedAt: approval.approvedAt,
      };
    }
  }
  return { version: 1, approvals };
}

export function validBusinessApprovalSlugs(
  content: PlatformContent,
  ledgerValue: unknown,
): Set<string> {
  const ledger = parseCatalogueBusinessApprovalLedger(ledgerValue);
  return new Set(content.products
    .filter((product) => ledger.approvals[product.slug]?.fingerprint === productBusinessFingerprint(product))
    .map((product) => product.slug));
}

export function confirmedNonAccessoryProducts(content: PlatformContent): Product[] {
  return content.products.filter((product) => (
    product.department !== "accessories" && Boolean(product.commerceMappingConfirmation)
  ));
}