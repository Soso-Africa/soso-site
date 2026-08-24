import { policyVersionsTable } from "@workspace/db";
import type { PgTransaction } from "drizzle-orm/pg-core";

const FALLBACK_PRIVACY_POLICY_VERSION = "unconfigured";

/**
 * A deployment configures only an opaque version identifier; legal text and
 * legal approval remain managed outside this service.
 */
export function currentPrivacyPolicyVersion(): string {
  const configured = process.env.PRIVACY_POLICY_VERSION?.trim();
  return configured && configured.length <= 64 ? configured : FALLBACK_PRIVACY_POLICY_VERSION;
}

export async function recordPrivacyPolicyVersion(
  tx: PgTransaction<any, any, any>,
  version: string,
): Promise<void> {
  await tx.insert(policyVersionsTable).values({ version }).onConflictDoNothing();
}