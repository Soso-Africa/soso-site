/**
 * SOSO Africa — Dynamic XML sitemap
 *
 * Serves /api/sitemap.xml with all static routes plus every published
 * Journal article. Respects PUBLIC_SITE_URL; returns 404 if not configured.
 *
 * The storefront robots.txt should point to this endpoint once a production
 * domain is confirmed and VITE_ENABLE_INDEXING / VITE_CATALOG_APPROVED are set.
 */

import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, journalPostsTable } from "@workspace/db";

const router: IRouter = Router();

const STATIC_PATHS = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/shop", changefreq: "weekly", priority: "0.9" },
  { path: "/about", changefreq: "monthly", priority: "0.7" },
  { path: "/journal", changefreq: "weekly", priority: "0.8" },
  { path: "/faq", changefreq: "monthly", priority: "0.7" },
  { path: "/collections/kaftans", changefreq: "weekly", priority: "0.8" },
  { path: "/collections/agbadas", changefreq: "weekly", priority: "0.8" },
  { path: "/collections/dashikis", changefreq: "weekly", priority: "0.8" },
  { path: "/collections/shirts", changefreq: "weekly", priority: "0.8" },
  { path: "/collections/two-piece", changefreq: "weekly", priority: "0.8" },
  { path: "/privacy", changefreq: "monthly", priority: "0.4" },
  { path: "/terms", changefreq: "monthly", priority: "0.4" },
  { path: "/delivery-returns", changefreq: "monthly", priority: "0.5" },
  { path: "/care", changefreq: "monthly", priority: "0.4" },
  { path: "/sizing", changefreq: "monthly", priority: "0.5" },
];

function xmlEscape(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function sitemapUrl(base: string, path: string, lastmod?: string, changefreq?: string, priority?: string): string {
  return [
    "  <url>",
    `    <loc>${xmlEscape(base.replace(/\/$/, "") + path)}</loc>`,
    lastmod ? `    <lastmod>${lastmod.slice(0, 10)}</lastmod>` : "",
    changefreq ? `    <changefreq>${changefreq}</changefreq>` : "",
    priority ? `    <priority>${priority}</priority>` : "",
    "  </url>",
  ]
    .filter(Boolean)
    .join("\n");
}

router.get("/sitemap.xml", async (_req, res): Promise<void> => {
  const siteUrl = process.env.PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (!siteUrl) {
    res.status(404).json({ error: "Sitemap is not available until a production domain is configured." });
    return;
  }

  const publishedArticles = await db
    .select({
      slug: journalPostsTable.slug,
      updatedAt: journalPostsTable.updatedAt,
      publishedAt: journalPostsTable.publishedAt,
    })
    .from(journalPostsTable)
    .where(eq(journalPostsTable.status, "published"))
    .orderBy(journalPostsTable.publishedAt);

  const staticEntries = STATIC_PATHS.map((p) =>
    sitemapUrl(siteUrl, p.path, new Date().toISOString(), p.changefreq, p.priority),
  );

  const articleEntries = publishedArticles.map((a) =>
    sitemapUrl(
      siteUrl,
      `/journal/${a.slug}`,
      (a.updatedAt ?? a.publishedAt ?? new Date()).toISOString(),
      "monthly",
      "0.7",
    ),
  );

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...staticEntries,
    ...articleEntries,
    "</urlset>",
  ].join("\n");

  res.set("Content-Type", "application/xml; charset=utf-8");
  res.set("Cache-Control", "public, max-age=3600");
  res.send(xml);
});

export default router;
