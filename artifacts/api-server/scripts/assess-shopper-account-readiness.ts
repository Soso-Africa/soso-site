/**
 * Non-mutating qualification of the published shopper-account API.
 * Optional --check-write-permission sends an empty link payload, which lacks
 * every required customer field and must be rejected without creating a row.
 * Credentials remain inside this server-side process; customer payloads,
 * merchant details and provider error messages are never printed.
 */
import { randomUUID } from "node:crypto";
import { justiceSureConfig } from "../src/lib/justicesureCommerce";

const baseUrl = justiceSureConfig().baseUrl;
if (!baseUrl || new URL(baseUrl).origin !== "https://justicesure.ai"
  || new URL(baseUrl).pathname !== "/api/v1/commerce") {
  throw new Error("Configure the documented JusticeSure commerce origin before qualification.");
}

const subject = encodeURIComponent(`soso:readonly-contract-${randomUUID()}`);
const environments = [
  { environment: "test", key: process.env.JUSTICESURE_COMMERCE_TEST_API_KEY },
  { environment: "live", key: process.env.JUSTICESURE_COMMERCE_API_KEY },
];

function readinessFlags(value: unknown, prefix = "", depth = 0): Record<string, boolean | string[]> {
  if (!value || typeof value !== "object" || depth > 4) return {};
  const result: Record<string, boolean | string[]> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!/^[A-Za-z_]+$/.test(key)) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof entry === "boolean" && /delivery|pickup|schema|customer|enabled|verified/i.test(path)) {
      result[path] = entry;
    } else if (Array.isArray(entry) && /scopes/i.test(key)) {
      result[path] = entry.filter((scope): scope is string => typeof scope === "string"
        && /^commerce:customers:(?:read|write)$/.test(scope));
    } else if (!Array.isArray(entry) && typeof entry === "object") {
      Object.assign(result, readinessFlags(entry, path, depth + 1));
    }
  }
  return result;
}

for (const { environment, key } of environments) {
  if (!key) {
    console.log(JSON.stringify({ environment, configured: false }));
    continue;
  }
  for (const path of ["/readiness", "/store", `/customers/${subject}`, `/customers/${subject}/measurements`,
    ...(process.argv.includes("--check-write-permission") ? ["/customers/link"] : [])]) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: path === "/customers/link" ? "POST" : "GET", cache: "no-store",
        ...(path === "/customers/link" ? { body: "{}" } : {}),
        headers: { Accept: "application/json", Authorization: `Bearer ${key}`,
          ...(path === "/customers/link" ? { "Content-Type": "application/json" } : {}) },
        signal: AbortSignal.timeout(20_000),
      });
      const json = await response.json() as Record<string, any>;
      const payload = json.data ?? json;
      const code = json.error?.code ?? json.code;
      const scope = json.error?.requiredScope ?? json.requiredScope;
      const store = payload.store ?? payload;
      console.log(JSON.stringify({
        environment,
        route: path === "/customers/link" ? "/customers/link (invalid empty payload)" : path.startsWith("/customers/") ? `/customers/{synthetic-unlinked-subject}${path.endsWith("/measurements") ? "/measurements" : ""}` : path,
        status: response.status,
        ...(typeof code === "string" && /^[A-Z_]+$/.test(code) ? { code } : {}),
        ...(typeof scope === "string" && /^commerce:[a-z:]+$/.test(scope) ? { requiredScope: scope } : {}),
        ...(path === "/store" && response.ok ? {
          capabilityFlags: readinessFlags(json),
          fulfillmentOptions: Array.isArray(store.fulfillmentOptions) ? store.fulfillmentOptions : undefined,
          pickupEnabled: typeof store.pickup?.enabled === "boolean" ? store.pickup.enabled : undefined,
          deliveryEnabled: typeof store.delivery?.enabled === "boolean" ? store.delivery.enabled : undefined,
        } : {}),
        ...(path === "/readiness" && response.ok ? {
          readinessFlags: readinessFlags(json),
          contract: typeof payload.contract === "string" ? payload.contract : undefined,
          deploymentState: typeof payload.deploymentState === "string" ? payload.deploymentState : undefined,
          deploymentReasonCode: typeof payload.deploymentReasonCode === "string" ? payload.deploymentReasonCode : undefined,
          schemaVerified: typeof payload.schema?.verified === "boolean" ? payload.schema.verified : undefined,
        } : {}),
      }));
    } catch {
      console.log(JSON.stringify({ environment, route: path.startsWith("/customers/") ? "/customers/{synthetic-unlinked-subject}" : path, error: "READ_ONLY_PROBE_FAILED" }));
    }
  }
}
