/**
 * Non-mutating local CPU model. No SQL, network calls or media reads.
 * Run from the root:
 * pnpm --dir scripts exec tsx ../artifacts/api-server/scripts/benchmark-platform-initialization.ts
 */
import {
  DEFAULT_PLATFORM_CONTENT, mergePlatformContentDefaults,
  PlatformContentSchema, platformContentHash,
} from "../src/lib/platform-content";
import { needsPlatformUpgrade } from "../src/lib/platform-upgrade-gate";

const iterations = 30;
const fixture = JSON.stringify(DEFAULT_PLATFORM_CONTENT);
const state = {
  draftVersion: String(DEFAULT_PLATFORM_CONTENT.contentVersion),
  publishedVersion: String(DEFAULT_PLATFORM_CONTENT.contentVersion),
  publishedEmpty: false,
  hasLegacyFaqItems: false,
};

function cpuPerCall(operation: () => void) {
  // Warm JIT once; startup/module import and PostgreSQL CPU are excluded.
  operation();
  const start = process.cpuUsage();
  for (let i = 0; i < iterations; i++) operation();
  const cpu = process.cpuUsage(start);
  return (cpu.user + cpu.system) / 1000 / iterations;
}

const beforeCpuMs = cpuPerCall(() => {
  // Model the previous full-row decoder and compatibility loop for draft/live.
  for (let side = 0; side < 2; side++) {
    const document = JSON.parse(fixture);
    const merged = PlatformContentSchema.safeParse(mergePlatformContentDefaults(document));
    if (!merged.success) throw new Error("Invalid benchmark fixture");
    platformContentHash(document);
    platformContentHash(merged.data);
  }
});
const afterCpuMs = cpuPerCall(() => {
  if (needsPlatformUpgrade(state, DEFAULT_PLATFORM_CONTENT.contentVersion)) {
    throw new Error("Current documents unexpectedly require migration");
  }
});

console.log(JSON.stringify({
  scope: "Local seeded-fixture compatibility CPU model, not measured Vercel CPU or a monthly forecast",
  iterations,
  fixtureCatalogueBytes: Buffer.byteLength(fixture),
  before: { compatibilityDocumentBytesPerCall: Buffer.byteLength(fixture) * 2, localCpuMsPerCall: beforeCpuMs },
  after: { compatibilityMetadataBytesPerCall: Buffer.byteLength(JSON.stringify(state)), localCpuMsPerCall: afterCpuMs },
  exclusions: "Query protocol/TLS overhead, DB CPU, module startup, live snapshot reads, payment, stock and media checks",
}, null, 2));
