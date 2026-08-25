import { promises as fs } from "node:fs";
import path from "node:path";

const roots = [
  "artifacts/api-server/dist",
  "artifacts/soso-store/dist/public",
];

const forbidden = [
  ["Replit connector SDK", /@replit\/connectors-sdk/],
  ["Replit Object Storage bucket", /DEFAULT_OBJECT_STORAGE_BUCKET_ID/],
  ["Replit private object directory", /PRIVATE_OBJECT_DIR/],
  ["Replit public object search paths", /PUBLIC_OBJECT_SEARCH_PATHS/],
  ["Replit development domain environment", /REPLIT_DEV_DOMAIN/],
  ["Replit domains environment", /REPLIT_DOMAINS/],
  ["Replit database environment", /REPLIT_(?:DB|DATABASE)_URL/],
  ["Replit-hosted runtime URL", /https?:\/\/[^"'`\s]*replit\.(?:app|dev|com)/i],
  ["Google Cloud Storage runtime URL", /https?:\/\/storage\.googleapis\.com/i],
];

const textExtensions = new Set([".css", ".html", ".js", ".json", ".mjs", ".txt", ".xml"]);
const violations = [];

async function scan(target) {
  const entries = await fs.readdir(target, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(target, entry.name);
    if (entry.isDirectory()) {
      await scan(absolute);
      continue;
    }
    if (!textExtensions.has(path.extname(entry.name))) continue;
    const source = await fs.readFile(absolute, "utf8");
    for (const [label, pattern] of forbidden) {
      if (pattern.test(source)) violations.push(`${label}: ${absolute}`);
    }
  }
}

for (const root of roots) {
  await fs.access(root);
  await scan(root);
}

if (violations.length > 0) {
  console.error("Production output contains forbidden Replit/runtime storage dependencies:");
  violations.forEach((violation) => console.error(`- ${violation}`));
  process.exit(1);
}

console.log("Production output has no Replit runtime or legacy object-storage dependency.");