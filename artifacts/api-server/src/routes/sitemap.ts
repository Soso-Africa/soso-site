/**
 * SOSO Africa — Dynamic XML sitemap
 *
 * Serves /api/sitemap.xml only when the approved canonical origin and the
 * indexing release switch are configured. Journal URLs are intentionally not
 * generated here: the storefront owns the explicit Journal SEO allowlist.
 *
 * The storefront's generated sitemap is the canonical public sitemap. This
 * endpoint remains conservative so it cannot publish a database record that
 * has not been explicitly approved for search.
 */

import { Router, type IRouter } from "express";

const router: IRouter = Router();

type SitemapPath = {
  path: string;
  changefreq: string;
  priority: string;
  releaseGate?: "catalog" | "policies";
};

const STATIC_PATHS: SitemapPath[] = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/about", changefreq: "monthly", priority: "0.7" },
  { path: "/faq", changefreq: "monthly", priority: "0.7" },
  { path: "/shop", changefreq: "weekly", priority: "0.9", releaseGate: "catalog" },
  { path: "/collections/kaftans", changefreq: "weekly", priority: "0.8", releaseGate: "catalog" },
  { path: "/collections/agbadas", changefreq: "weekly", priority: "0.8", releaseGate: "catalog" },
  { path: "/collections/dashikis", changefreq: "weekly", priority: "0.8", releaseGate: "catalog" },
  { path: "/collections/shirts", changefreq: "weekly", priority: "0.8", releaseGate: "catalog" },
  { path: "/collections/two-piece", changefreq: "weekly", priority: "0.8", releaseGate: "catalog" },
  { path: "/policies", changefreq: "monthly", priority: "0.5", releaseGate: "policies" },
  { path: "/privacy", changefreq: "monthly", priority: "0.4", releaseGate: "policies" },
  { path: "/terms", changefreq: "monthly", priority: "0.4", releaseGate: "policies" },
  { path: "/delivery-returns", changefreq: "monthly", priority: "0.5", releaseGate: "policies" },
  { path: "/care", changefreq: "monthly", priority: "0.4", releaseGate: "policies" },
];

export function normalizeApprovedSiteUrl(value: string | undefined): string {
  if (!value) return "";

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return "";
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname.endsWith(".replit.dev")) return "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function xmlEscape(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function sitemapUrl(base: string, path: string, changefreq: string, priority: string): string {
  return [
    "  <url>",
    `    <loc>${xmlEscape(base.replace(/\/$/, "") + path)}</loc>`,
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    "  </url>",
  ]
    .join("\n");
}

export function buildSitemap(env: NodeJS.ProcessEnv): string | null {
  const siteUrl = normalizeApprovedSiteUrl(env.VITE_PUBLIC_SITE_URL);
  if (!siteUrl || env.VITE_SOSO_INDEXING_ENABLED !== "true") return null;

  const releaseGates = {
    catalog: env.VITE_SOSO_CATALOG_APPROVED === "true",
    policies: env.VITE_SOSO_POLICIES_APPROVED === "true",
  };
  const staticEntries = STATIC_PATHS
    .filter((entry) => !entry.releaseGate || releaseGates[entry.releaseGate])
    .map((entry) => sitemapUrl(siteUrl, entry.path, entry.changefreq, entry.priority));

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...staticEntries,
    "</urlset>",
  ].join("\n");
  return xml;
}

router.get("/sitemap.xml", async (_req, res): Promise<void> => {
  const xml = buildSitemap(process.env);
  if (!xml) {
    res.status(404).json({ error: "Sitemap is unavailable until approved indexing configuration is supplied." });
    return;
  }
  res.set("Content-Type", "application/xml; charset=utf-8");
  res.set("Cache-Control", "public, max-age=3600");
  res.send(xml);
});

export default router;
