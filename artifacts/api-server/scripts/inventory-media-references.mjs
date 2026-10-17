// Read-only reference audit. Never initializes content or changes a database.
import { readFile, writeFile } from "node:fs/promises";
import pg from "pg";

const directory = "generated-artifacts/media-migration";
const inventory = JSON.parse(await readFile(`${directory}/cloudinary-inventory.json`, "utf8"));
const assets = new Map(inventory.assets.map((asset) => [
  `${asset.resourceType}/${asset.deliveryType}/${asset.publicId}`,
  asset,
]));
const references = new Map();
function collect(scope, text, occurrences = 1) {
  const matches = String(text).matchAll(/https:\/\/res\.cloudinary\.com\/[^"'\s<>\\]+|\/api\/storage\/(?:objects|public-objects)\/[^"'\s<>\\]+/g);
  for (const [raw] of matches) {
    const value = raw.replace(/&amp;/g, "&");
    const key = `${scope}\0${value}`;
    const existing = references.get(key);
    if (existing) existing.occurrences += occurrences;
    else references.set(key, { scope, value, occurrences });
  }
}
if (!process.argv.includes("--development")) {
  throw new Error("Explicit --development is required for this audit's database reads.");
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 15_000 });
const client = await pool.connect();
try {
  await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  await client.query("SET LOCAL statement_timeout = '20s'");
  const result = await client.query(`
    WITH documents(scope, body) AS (
      SELECT 'development/draft', draft::text FROM soso_site_content
      UNION ALL SELECT 'development/published', published::text FROM soso_site_content
      UNION ALL SELECT 'development/content-history', snapshot::text FROM soso_site_content_revisions
      UNION ALL SELECT 'development/journal', coalesce(cover_image_url,'') || ' ' || body FROM soso_journal_posts
      UNION ALL SELECT 'development/journal-history', snapshot::text FROM soso_journal_post_revisions
      UNION ALL
      SELECT 'development/pending-cleanup', '/api/storage/objects/' || entity_id
      FROM (
        SELECT DISTINCT ON (entity_id) entity_id, action
        FROM soso_audit_logs
        WHERE action IN (
          'platform_media.cleanup_queued','platform_media.cleanup_failed',
          'platform_media.cleanup_deferred','platform_media.cleanup_deleted'
        )
        ORDER BY entity_id, created_at DESC, id DESC
      ) latest WHERE action <> 'platform_media.cleanup_deleted'
    ), matches AS (
      SELECT scope, (regexp_matches(
        body, $1, 'g'
      ))[1] AS value FROM documents
    )
    SELECT scope, value, count(*)::integer AS occurrences
    FROM matches GROUP BY scope, value ORDER BY scope, value
  `, [String.raw`https://res\.cloudinary\.com/[^"[:space:]<>\\]+|/api/storage/(?:objects|public-objects)/[^"[:space:]<>\\]+`]);
  for (const row of result.rows) collect(row.scope, row.value, row.occurrences);
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}

// Origin is supplied only after obtaining the live domain from deployment metadata.
const liveOrigin = process.argv.find((argument) => argument.startsWith("--live-origin="))?.slice("--live-origin=".length);
const publicReads = [];
if (liveOrigin) {
  const origin = new URL(liveOrigin);
  if (origin.protocol !== "https:" || origin.pathname !== "/" || origin.search || origin.hash
    || origin.username || origin.password) throw new Error("Invalid explicit live origin.");
  for (const route of ["/api/content/platform", "/api/content/site", "/api/journal"]) {
    const response = await fetch(new URL(route, origin), {
      redirect: "error", signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Live content read failed (${response.status}) on ${route}.`);
    const text = await response.text();
    if (text.length > 10_000_000) throw new Error("Live content exceeded the bounded audit read.");
    const data = JSON.parse(text);
    collect(`production/public${route}`, text);
    publicReads.push(route);
    if (route === "/api/journal") {
      const rows = Array.isArray(data) ? data : Array.isArray(data.posts) ? data.posts : [];
      for (const row of rows) {
        if (typeof row.slug !== "string" || !/^[a-z0-9-]+$/.test(row.slug)) continue;
        const articleRoute = `/api/journal/${encodeURIComponent(row.slug)}`;
        const article = await fetch(new URL(articleRoute, origin), {
          redirect: "error", signal: AbortSignal.timeout(30_000),
        });
        if (!article.ok) throw new Error(`Live Journal read failed (${article.status}).`);
        const body = await article.text();
        if (body.length > 2_000_000) throw new Error("Live Journal exceeded the bounded audit read.");
        JSON.parse(body);
        collect(`production/public${articleRoute}`, body);
        publicReads.push(articleRoute);
      }
    }
  }
}

function resolve(reference) {
  let resourceType;
  let deliveryType = "upload";
  let publicId;
  let sourceCloud;
  if (reference.value.startsWith("/api/storage/")) {
    const logical = reference.value.split(/[?#]/, 1)[0];
    const match = logical.match(/^\/api\/storage\/(objects|public-objects)\/(.+)\.(jpg|jpeg|png|webp|gif|mp4|webm)$/i);
    if (!match) return { ...reference, status: "unrecognized-managed-path" };
    resourceType = /^(mp4|webm)$/i.test(match[3]) ? "video" : "image";
    publicId = `soso-store/${match[1] === "public-objects" ? "public/" : ""}${match[2]}`;
  } else {
    const url = new URL(reference.value);
    const parts = decodeURIComponent(url.pathname).split("/").filter(Boolean);
    [sourceCloud, resourceType, deliveryType] = parts;
    if (sourceCloud !== process.env.CLOUDINARY_CLOUD_NAME) {
      return { ...reference, status: "different-cloudinary-account" };
    }
    const versionIndex = parts.findIndex((part, index) => index >= 3 && /^v\d+$/.test(part));
    const publicParts = versionIndex >= 0 ? parts.slice(versionIndex + 1) : parts.slice(3);
    if (versionIndex < 0 && publicParts[0]?.includes(",")) {
      return { ...reference, status: "unresolved-transformation" };
    }
    publicId = publicParts.join("/").replace(/\.[^.\/]+$/, "");
  }
  const asset = assets.get(`${resourceType}/${deliveryType}/${publicId}`);
  return {
    ...reference,
    status: asset ? "original-in-inventory" : "missing-original",
    assetId: asset?.assetId, publicId, resourceType, deliveryType,
  };
}
const resolved = [...references.values()].map(resolve);
const report = {
  capturedAt: new Date().toISOString(),
  limitations: [
    "Development drafts/history/cleanup and production public JSON only; production private drafts, history and cleanup remain unverified.",
    "Original asset identity only; transformed URL renditions are not yet verified in the backup.",
    "No content or media was modified. External non-Cloudinary media requires a separate audit.",
  ],
  publicReads,
  references: resolved,
  summary: Object.fromEntries([...new Set(resolved.map((row) => row.status))].map((status) => [
    status, resolved.filter((row) => row.status === status).length,
  ])),
};
await writeFile(`${directory}/media-reference-audit.json`, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ publicReads: publicReads.length, referenceGroups: resolved.length, summary: report.summary, limitations: report.limitations }, null, 2));
