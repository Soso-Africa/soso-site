import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "dist/public");
const approvedOrigin = "https://shopsoso.co";
const requestedOrigin = (process.env.VITE_PUBLIC_SITE_URL || "").trim();
const indexingEnabled = process.env.VITE_SOSO_INDEXING_ENABLED === "true";
const catalogApproved = process.env.VITE_SOSO_CATALOG_APPROVED === "true";
const policiesApproved = process.env.VITE_SOSO_POLICIES_APPROVED === "true";
const journalApproved = process.env.VITE_SOSO_JOURNAL_APPROVED === "true";
const socialImagePath = (process.env.VITE_SOSO_SOCIAL_IMAGE_PATH || "").trim();

function canonicalOrigin(value) {
  try {
    const url = new URL(value);
    // www is accepted only as an explicit input and is canonicalized to apex.
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return "";
    if (url.hostname === "shopsoso.co") return approvedOrigin;
    if (url.hostname === "www.shopsoso.co") return approvedOrigin;
  } catch { /* fail closed */ }
  return "";
}
const siteUrl = canonicalOrigin(requestedOrigin);
const canIndex = Boolean(siteUrl && indexingEnabled);
const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const xml = escapeHtml;
const stripMarkdown = (value = "") => String(value)
  .replace(/<[^>]*>/g, " ")
  .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
  .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
  .replace(/^#{1,6}\s+/gm, "")
  .replace(/^\s*[-*+]\s+/gm, "")
  .replace(/[*_`~]/g, "")
  .replace(/\s+/g, " ").trim();
const absolute = (path) => /^https:\/\//.test(path || "") ? path : `${siteUrl}${String(path || "").startsWith("/") ? "" : "/"}${path || ""}`;
const safeSlug = (value) => typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const iso = (value) => new Date(value || Date.now()).toISOString();
const now = iso();

await mkdir(out, { recursive: true });
const robotsPath = resolve(out, "robots.txt");
const generated = ["sitemap.xml", "feed.xml", "atom.xml", "feed.json", "llms.txt", "seo-manifest.json", "_seo"];
const routeRoots = ["shop", "product", "collections", "journal", "faq", "about", "policies", "privacy", "terms", "delivery-returns", "care"];
async function clearPrerenders() {
  await Promise.all(routeRoots.flatMap((path) => [
    rm(resolve(out, path), { recursive: true, force: true }),
    rm(resolve(out, `${path}.html`), { force: true }),
  ]));
}
if (!canIndex) {
  await writeFile(robotsPath, "User-agent: *\nDisallow: /\n\n# Private until the approved production canonical gate is enabled.\n");
  await Promise.all(generated.map((file) => rm(resolve(out, file), { recursive: true, force: true })));
  // These are filesystem-routed prerenders. Remove them rather than allowing a
  // previous public build to leak crawlable HTML into a private deployment.
  await clearPrerenders();
  process.stdout.write("SEO assets remain private: indexing requires https://shopsoso.co and VITE_SOSO_INDEXING_ENABLED=true.\n");
  process.exit(0);
}

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required when public SEO generation is enabled.");
const builtShell = await readFile(resolve(out, "index.html"), "utf8");
const hydrationAsset = builtShell.match(/<script[^>]+src="([^"]+)"[^>]*><\/script>/i)?.[1];
if (!hydrationAsset) throw new Error("Vite build output is missing its hydration client asset.");
await clearPrerenders();
await Promise.all(generated.map((file) => rm(resolve(out, file), { recursive: true, force: true })));
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
let platform = {};
let articles = [];
try {
  const [content, journal] = await Promise.all([
    pool.query("select published, published_at as \"publishedAt\" from soso_site_content where key = 'platform' and published_at is not null limit 1"),
    journalApproved ? pool.query(`select slug, title, excerpt, body, seo_title as "seoTitle", seo_description as "seoDescription",
      author_name as "authorName", category, tags, read_time_minutes as "readTimeMinutes",
      related_product_slugs as "relatedProductSlugs", related_article_slugs as "relatedArticleSlugs",
      cover_image_url as "coverImageUrl", cover_image_alt as "coverImageAlt",
      published_at as "publishedAt", updated_at as "updatedAt"
      from soso_journal_posts where status = 'published' and published_at is not null order by published_at desc`) : Promise.resolve({ rows: [] }),
  ]);
  platform = content.rows[0]?.published || {};
  articles = journal.rows.map((row) => ({
    ...row,
    pageTitle: row.seoTitle || row.title,
    description: row.seoDescription || row.excerpt,
    bodyText: stripMarkdown(row.body),
    publishedAt: iso(row.publishedAt),
    updatedAt: iso(row.updatedAt),
  }));
} finally { await pool.end(); }

const products = catalogApproved && Array.isArray(platform.products) ? platform.products.filter((p) => safeSlug(p.slug) && p.name && p.description) : [];
const collections = catalogApproved && Array.isArray(platform.collections) ? platform.collections.filter((c) => safeSlug(c.slug) && c.h1 && c.intro) : [];
const faq = policiesApproved && Array.isArray(platform.faq?.items) ? platform.faq.items : [];
const policyLinks = policiesApproved ? (platform.site?.footer?.legalLinks || platform.footer?.legalLinks || []) : [];
const policyPaths = [...new Set(["/policies", "/privacy", "/terms", "/delivery-returns", "/care", ...policyLinks.map((x) => x.href).filter((x) => /^\/policies\/[a-z0-9-]+$/.test(x || ""))])];
const staticPages = [
  { path: "/", title: "SOSO Africa | Premium Nigerian Menswear", description: "Discover premium Nigerian menswear from SOSO Africa.", h1: "SOSO Africa", body: "Discover considered Nigerian menswear, collections, and editorial stories." },
  ...(catalogApproved ? [{ path: "/shop", title: "Shop | SOSO Africa", description: "Browse SOSO Africa collections.", h1: "Shop SOSO Africa", body: "Browse the current SOSO Africa collection." }] : []),
  ...(policiesApproved ? [
    { path: "/faq", title: platform.faq?.seo?.title || "Frequently asked questions | SOSO Africa", description: platform.faq?.seo?.description || "Answers to common SOSO Africa questions.", h1: platform.faq?.title || "Frequently asked questions", body: platform.faq?.intro || "Find answers and support information." },
    { path: "/about", title: platform.about?.seo?.title || "About SOSO Africa", description: platform.about?.seo?.description || "About SOSO Africa.", h1: platform.about?.hero?.title || "About SOSO Africa", body: platform.about?.hero?.body || "Learn about SOSO Africa." },
    ...policyPaths.map((path) => ({ path, title: path === "/policies" ? (platform.policies?.seo?.title || "Policies | SOSO Africa") : `${path.slice(1).replaceAll("-", " ")} | SOSO Africa`, description: platform.policies?.seo?.description || "SOSO Africa policy information.", h1: path === "/policies" ? (platform.policies?.title || "Policies") : path.slice(1).replaceAll("-", " "), body: platform.policies?.intro || "Read SOSO Africa policy information." })),
  ] : []),
  ...(journalApproved && articles.length ? [{ path: "/journal", title: platform.journal?.seo?.title || "Journal | SOSO Africa", description: platform.journal?.seo?.description || "Stories from SOSO Africa.", h1: platform.journal?.heading || "The Journal", body: platform.journal?.intro || "Stories from SOSO Africa." }] : []),
];

function links(items) { return `<nav aria-label="Related pages">${items.map((i) => `<a href="${escapeHtml(i.path)}">${escapeHtml(i.h1 || i.name || i.title)}</a>`).join(" · ")}</nav>`; }
function safeInlineMarkdown(value) {
  const escaped = escapeHtml(value);
  return escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
    const safeHref = /^(?:\/(?:journal|product|collections)\/[a-z0-9]+(?:-[a-z0-9]+)*|\/(?:shop|faq|about))$/.test(href) ? href : "";
    return safeHref ? `<a href="${escapeHtml(safeHref)}">${label}</a>` : label;
  }).replace(/(\*\*|__)(.*?)\1/g, "<strong>$2</strong>").replace(/(\*|_)(.*?)\1/g, "<em>$2</em>");
}
function renderMarkdown(markdown) {
  const lines = String(markdown || "").replace(/\r/g, "").split("\n");
  const output = []; let list = [];
  const flush = () => { if (list.length) { output.push(`<ul>${list.map((x) => `<li>${safeInlineMarkdown(x)}</li>`).join("")}</ul>`); list = []; } };
  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.+)$/); const bullet = line.match(/^\s*[-*+]\s+(.+)$/);
    if (bullet) { list.push(bullet[1]); continue; }
    flush();
    if (heading) output.push(`<h${heading[1].length}>${safeInlineMarkdown(heading[2])}</h${heading[1].length}>`);
    else if (line.trim()) output.push(`<p>${safeInlineMarkdown(line.trim())}</p>`);
  }
  flush(); return output.join("");
}
function page({ path, title, description, h1, body, bodyHtml, schema = [], type = "website", image, imageAlt, article }) {
  const canonical = absolute(path);
  const breadcrumbs = [{ "@type": "ListItem", position: 1, name: "Home", item: siteUrl }];
  if (path !== "/") breadcrumbs.push({ "@type": "ListItem", position: 2, name: h1, item: canonical });
  const graph = [
    { "@context": "https://schema.org", "@type": "ClothingStore", "@id": `${siteUrl}/#organization`, name: platform.site?.name || "SOSO Africa", description: platform.site?.structuredData?.organizationDescription, url: siteUrl, address: { "@type": "PostalAddress", addressLocality: platform.site?.structuredData?.locality, addressCountry: platform.site?.structuredData?.country } },
    { "@context": "https://schema.org", "@type": "WebSite", "@id": `${siteUrl}/#website`, name: platform.site?.name || "SOSO Africa", description: platform.site?.structuredData?.websiteDescription, url: siteUrl },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", "@id": `${canonical}#breadcrumb`, itemListElement: breadcrumbs },
    ...schema,
  ];
  const socialImage = image ? absolute(image) : (socialImagePath ? absolute(socialImagePath) : "");
  const imageMeta = socialImage ? `<meta property="og:image" content="${escapeHtml(socialImage)}"><meta property="og:image:alt" content="${escapeHtml(imageAlt || title)}"><meta name="twitter:image" content="${escapeHtml(socialImage)}"><meta name="twitter:image:alt" content="${escapeHtml(imageAlt || title)}">` : "";
  const articleMeta = article ? `<meta property="article:published_time" content="${escapeHtml(article.publishedAt)}"><meta property="article:modified_time" content="${escapeHtml(article.updatedAt)}"><meta property="article:author" content="${escapeHtml(article.authorName)}">${(article.tags || []).map((tag) => `<meta property="article:tag" content="${escapeHtml(tag)}">`).join("")}` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><meta name="robots" content="index, follow"><link rel="canonical" href="${escapeHtml(canonical)}"><meta property="og:type" content="${type}"><meta property="og:site_name" content="${escapeHtml(platform.site?.name || "SOSO Africa")}"><meta property="og:locale" content="en_NG"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(canonical)}">${imageMeta}${articleMeta}<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(description)}"><script id="soso-server-schema" type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c")}</script></head><body><main><h1>${escapeHtml(h1)}</h1>${bodyHtml || `<p>${escapeHtml(body)}</p>`}${links(staticPages)}</main><div id="root"></div><script type="module" src="${escapeHtml(hydrationAsset)}"></script></body></html>`;
}
async function emit(path, html) {
  const file = path === "/" ? resolve(out, "index.html") : resolve(out, `${path.slice(1)}.html`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, html);
}
const routes = staticPages.map((p) => ({ ...p, lastmod: now }));
for (const item of staticPages) {
  const schema = item.path === "/faq" ? [{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map((x) => ({ "@type": "Question", name: x.question, acceptedAnswer: { "@type": "Answer", text: x.answer } })) }] : item.path === "/journal" ? [{ "@context": "https://schema.org", "@type": "ItemList", itemListElement: articles.map((a, i) => ({ "@type": "ListItem", position: i + 1, url: absolute(`/journal/${a.slug}`), name: a.title })) }] : [];
  await emit(item.path, page({ ...item, schema }));
}
for (const product of products) {
  const price = Number(product.price);
  const authoritativeState = ["ready_now", "made_immediately", "unavailable"].includes(product.fulfilmentState);
  const availability = product.fulfilmentState === "unavailable" ? "https://schema.org/OutOfStock" : product.fulfilmentState === "ready_now" ? "https://schema.org/InStock" : "https://schema.org/PreOrder";
  const offer = product.commerceProductId && authoritativeState && Number.isFinite(price) && price >= 0
    ? { "@type": "Offer", price, priceCurrency: "NGN", availability, url: absolute(`/product/${product.slug}`), seller: { "@id": `${siteUrl}/#organization` } }
    : undefined;
  const item = { path: `/product/${product.slug}`, title: `${product.name} | SOSO Africa`, description: product.description, h1: product.name, body: product.description, lastmod: now };
  routes.push(item); await emit(item.path, page({ ...item, schema: [{ "@context": "https://schema.org", "@type": "Product", name: product.name, description: product.description, url: absolute(item.path), brand: { "@type": "Brand", name: platform.site?.name || "SOSO Africa" }, ...(product.img ? { image: absolute(product.img) } : {}), ...(offer ? { offers: offer } : {}) }] }));
}
for (const collection of collections) {
  const pieces = products.filter((product) => product.department === collection.department && product.category === collection.category)
    .sort((a, b) => (b.merchandising?.sortPriority || 0) - (a.merchandising?.sortPriority || 0));
  const item = { path: `/collections/${collection.slug}`, title: collection.seo?.title || `${collection.h1} | SOSO Africa`, description: collection.seo?.description || collection.intro, h1: collection.h1, body: collection.intro, lastmod: now };
  const itemListElement = pieces.map((product, index) => ({ "@type": "ListItem", position: index + 1, url: absolute(`/product/${product.slug}`), name: product.name }));
  routes.push(item);
  await emit(item.path, page({ ...item, schema: [{ "@context": "https://schema.org", "@type": "CollectionPage", name: collection.h1, description: item.description, url: absolute(item.path), mainEntity: { "@type": "ItemList", itemListElement } }] }));
}
if (journalApproved) for (const article of articles) {
  const item = { path: `/journal/${article.slug}`, title: article.pageTitle, description: article.description, h1: article.title, body: article.bodyText || article.excerpt, lastmod: article.updatedAt };
  routes.push(item); const related = [...(article.relatedProductSlugs || []).map((slug) => `/product/${slug}`), ...(article.relatedArticleSlugs || []).map((slug) => `/journal/${slug}`)].filter((href) => /^\/(product|journal)\/[a-z0-9-]+$/.test(href));
  const relatedHtml = related.length ? `<nav aria-label="Related content">${related.map((href) => `<a href="${escapeHtml(href)}">${escapeHtml(href.split("/").at(-1).replaceAll("-", " "))}</a>`).join(" · ")}</nav>` : "";
  await emit(item.path, page({ ...item, type: "article", image: article.coverImageUrl, imageAlt: article.coverImageAlt, article, bodyHtml: `${renderMarkdown(article.body)}${relatedHtml}`, schema: [{ "@context": "https://schema.org", "@type": "BlogPosting", headline: article.title, description: article.description, articleBody: article.bodyText, datePublished: article.publishedAt, dateModified: article.updatedAt, author: { "@type": "Person", name: article.authorName }, publisher: { "@id": `${siteUrl}/#organization` }, mainEntityOfPage: { "@type": "WebPage", "@id": absolute(item.path) }, ...(article.category ? { articleSection: article.category } : {}), ...(article.tags?.length ? { keywords: article.tags.join(", ") } : {}), ...(article.coverImageUrl ? { image: { "@type": "ImageObject", url: absolute(article.coverImageUrl), ...(article.coverImageAlt ? { caption: article.coverImageAlt } : {}) } } : {}), relatedLink: related.map(absolute) }] }));
}
await writeFile(robotsPath, `User-agent: *\nAllow: /\nDisallow: /checkout\nDisallow: /staff\nDisallow: /sign-in\nDisallow: /sign-up\nSitemap: ${siteUrl}/sitemap.xml\n`);
await writeFile(resolve(out, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${routes.map((r) => `  <url><loc>${xml(absolute(r.path))}</loc><lastmod>${iso(r.lastmod)}</lastmod></url>`).join("\n")}\n</urlset>\n`);
const feedItems = articles.map((a) => ({ id: absolute(`/journal/${a.slug}`), url: absolute(`/journal/${a.slug}`), title: a.title, content_text: a.bodyText || a.excerpt, summary: a.description, date_published: a.publishedAt, date_modified: a.updatedAt, authors: [{ name: a.authorName }] }));
if (journalApproved) {
  await writeFile(resolve(out, "feed.json"), `${JSON.stringify({ version: "https://jsonfeed.org/version/1.1", title: "SOSO Africa Journal", home_page_url: siteUrl, feed_url: absolute("/feed.json"), items: feedItems }, null, 2)}\n`);
  await writeFile(resolve(out, "feed.xml"), `<?xml version="1.0"?><rss version="2.0"><channel><title>SOSO Africa Journal</title><link>${xml(siteUrl)}</link><description>SOSO Africa Journal</description>${feedItems.map((x) => `<item><title>${xml(x.title)}</title><link>${xml(x.url)}</link><guid>${xml(x.id)}</guid><pubDate>${new Date(x.date_published).toUTCString()}</pubDate><description>${xml(x.summary)}</description></item>`).join("")}</channel></rss>\n`);
  await writeFile(resolve(out, "atom.xml"), `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>SOSO Africa Journal</title><id>${xml(siteUrl)}</id><updated>${now}</updated>${feedItems.map((x) => `<entry><title>${xml(x.title)}</title><id>${xml(x.id)}</id><link href="${xml(x.url)}"/><updated>${x.date_modified}</updated><summary>${xml(x.summary)}</summary></entry>`).join("")}</feed>\n`);
}
const journalLlms = journalApproved && articles.length
  ? `\n\n## Journal\n${articles.map((a) => `- [${a.title}](${absolute(`/journal/${a.slug}`)}): ${a.excerpt}`).join("\n")}`
  : "";
await writeFile(resolve(out, "llms.txt"), `# SOSO Africa\n\n${staticPages.map((p) => `- [${p.h1}](${absolute(p.path)}): ${p.description}`).join("\n")}${journalLlms}\n`);
await writeFile(resolve(out, "seo-manifest.json"), `${JSON.stringify({ canonicalOrigin: siteUrl, routes, products, journalEntries: articles }, null, 2)}\n`);
process.stdout.write(`Crawlable SEO assets generated for ${siteUrl}.\n`);