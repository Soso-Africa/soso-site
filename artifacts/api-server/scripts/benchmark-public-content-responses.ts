import { createHash } from "node:crypto";
import { normalizeStorefrontTitle } from "@workspace/api-zod";
import { DEFAULT_PLATFORM_CONTENT } from "../src/lib/platform-content";
import { publicCatalogueContent } from "../src/lib/public-catalogue-checkout";
import { createPublicContentResponses } from "../src/lib/public-content-responses";

const snapshot = { content: structuredClone(DEFAULT_PLATFORM_CONTENT), publishedAt: new Date("2026-10-01T00:00:00Z") };
const responses = createPublicContentResponses();
const encoded = responses.platform(snapshot, false);
const iterations = 2_000;

function oldResponse() {
  const content = publicCatalogueContent(snapshot.content, false);
  const title = normalizeStorefrontTitle(content.homepage.seo.title);
  const body = Buffer.from(JSON.stringify({
    content: title === content.homepage.seo.title ? content : {
      ...content, homepage: { ...content.homepage, seo: { ...content.homepage.seo, title } },
    },
    publishedAt: snapshot.publishedAt,
    checkoutEnabled: false,
  }));
  return createHash("sha1").update(body).digest("base64");
}

for (let i = 0; i < 100; i++) oldResponse();
function measure(run: () => unknown) {
  const start = process.cpuUsage();
  for (let i = 0; i < iterations; i++) run();
  const used = process.cpuUsage(start);
  return (used.user + used.system) / 1_000;
}
const previousCpuMs = measure(oldResponse);
const reusedCpuMs = measure(() => responses.platform(snapshot, false));
console.log(JSON.stringify({
  scope: "Local warm public-response preparation only; excludes database checks, initialization, network, other routes and Vercel billing.",
  fixture: "DEFAULT_PLATFORM_CONTENT",
  responseBytes: encoded.body.byteLength,
  iterations,
  previousCpuMs,
  reusedCpuMs,
  preparationCpuReductionPercent: Number(((1 - reusedCpuMs / previousCpuMs) * 100).toFixed(2)),
}, null, 2));
