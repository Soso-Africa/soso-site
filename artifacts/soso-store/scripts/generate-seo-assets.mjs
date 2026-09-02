import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = process.env.SOSO_SEO_OUTPUT_DIR
  ? resolve(process.env.SOSO_SEO_OUTPUT_DIR)
  : resolve(root, "dist/public");
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

// This data module deliberately contains JSON literals (rather than runtime-only
// React data) so it is the shared archival source for the client and this Node
// build step. Keep this small loader here instead of maintaining a second copy
// of the imported WordPress content for prerendering.
const legacySource = await readFile(resolve(root, "src/data/legacy-content.ts"), "utf8");
function loadLegacyCollection(name) {
  const match = legacySource.match(new RegExp(`export const ${name}[^=]*= (\\[[\\s\\S]*?\\n\\]);`));
  if (!match) throw new Error(`Unable to load ${name} from the shared legacy content source.`);
  const records = JSON.parse(match[1]);
  if (!Array.isArray(records) || records.some((record) => !safeSlug(record.slug) || !record.canonicalPath)) {
    throw new Error(`The shared ${name} source contains an invalid archival route.`);
  }
  if (new Set(records.map((record) => record.slug)).size !== records.length) {
    throw new Error(`The shared ${name} source contains duplicate archival slugs.`);
  }
  return records;
}
function loadJournalRefresh() {
  const match = legacySource.match(/const journalRefresh[^=]*= (\{[\s\S]*?\n\});/);
  if (!match) throw new Error("Unable to load the legacy journal editorial refresh source.");
  const serialized = match[1]
    .replace(/([,{]\s*)(takeaway|coverImageAlt)\s*:/g, '$1"$2":')
    .replace(/,\s*}$/, "\n}");
  const refresh = JSON.parse(serialized);
  if (!refresh || typeof refresh !== "object") throw new Error("The legacy journal editorial refresh source is invalid.");
  return refresh;
}
const legacyAboutPages = loadLegacyCollection("legacyAboutPages");
const legacyJournalPosts = loadLegacyCollection("legacyJournalSourcePosts");
const legacyJournalRefresh = loadJournalRefresh();
if (legacyAboutPages.length !== 7 || legacyJournalPosts.length !== 14) {
  throw new Error("The shared legacy content source must retain all 7 About pages and 14 Journal posts.");
}
if (legacyJournalPosts.some(({ slug }) => !legacyJournalRefresh[slug]?.takeaway || !legacyJournalRefresh[slug]?.coverImageAlt)) {
  throw new Error("Every legacy journal article requires an editorial takeaway and descriptive image alt text.");
}

await mkdir(out, { recursive: true });
const robotsPath = resolve(out, "robots.txt");
const fallbackPath = resolve(out, "spa-fallback.html");
const generated = ["sitemap.xml", "feed.xml", "atom.xml", "feed.json", "llms.txt", "seo-manifest.json", "_seo"];
const routeRoots = ["shop", "product", "collections", "journal", "faq", "about", "policies", "privacy", "terms", "delivery-returns", "care"];
async function clearPrerenders() {
  await Promise.all(routeRoots.flatMap((path) => [
    rm(resolve(out, path), { recursive: true, force: true }),
    rm(resolve(out, `${path}.html`), { force: true }),
  ]));
}
function assertNoIndexFallback(shell) {
  if (!/<meta[^>]+name="robots"[^>]+content="noindex,\s*nofollow"/i.test(shell)) {
    throw new Error("The SPA fallback must retain a noindex, nofollow robots directive.");
  }
  if (/<link[^>]+rel="canonical"/i.test(shell)) {
    throw new Error("The SPA fallback must not advertise a canonical route.");
  }
}
const currentIndex = await readFile(resolve(out, "index.html"), "utf8");
const builtShell = currentIndex.includes('data-soso-managed="robots"')
  ? currentIndex
  : await readFile(fallbackPath, "utf8");
assertNoIndexFallback(builtShell);
await writeFile(fallbackPath, builtShell);
const hydrationAsset = builtShell.match(/<script[^>]+src="([^"]+)"[^>]*><\/script>/i)?.[1];
if (!hydrationAsset) throw new Error("Vite build output is missing its hydration client asset.");

if (!canIndex) {
  await writeFile(resolve(out, "index.html"), builtShell);
  await writeFile(robotsPath, "User-agent: *\nDisallow: /\n\n# Private until the approved production canonical gate is enabled.\n");
  await Promise.all(generated.map((file) => rm(resolve(out, file), { recursive: true, force: true })));
  // These are filesystem-routed prerenders. Remove them rather than allowing a
  // previous public build to leak crawlable HTML into a private deployment.
  await clearPrerenders();
  process.stdout.write("SEO assets remain private: indexing requires https://shopsoso.co and VITE_SOSO_INDEXING_ENABLED=true.\n");
  process.exit(0);
}

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required when public SEO generation is enabled.");
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
  const cmsArticles = journal.rows.map((row) => ({
    ...row,
    pageTitle: row.seoTitle || row.title,
    description: row.seoDescription || row.excerpt,
    bodyText: stripMarkdown(row.body),
    publishedAt: iso(row.publishedAt),
    updatedAt: iso(row.updatedAt),
  }));
  // A reviewed CMS entry always wins over an archival record with the same
  // public slug. This lets editors replace migration copy without duplicate
  // pages, feed items, or sitemap URLs.
  articles = journalApproved ? Array.from(new Map([
    ...legacyJournalPosts.map((post) => {
      const refresh = legacyJournalRefresh[post.slug];
      const index = legacyJournalPosts.findIndex(({ slug }) => slug === post.slug);
      const presentationBody = post.slug === "abuja-modern-menswear-hub"
        ? `## A new era of kaftan style\n\n${post.body}`
        : post.body;
      return [post.slug, {
      ...post,
      ...refresh,
      seoTitle: `${post.title.replace(/\.$/, "")} | SOSO Africa`,
      seoDescription: refresh.takeaway,
      coverImageAlt: refresh.coverImageAlt,
      pageTitle: `${post.title.replace(/\.$/, "")} | SOSO Africa`,
      description: refresh.takeaway,
      body: presentationBody,
      bodyText: stripMarkdown(presentationBody),
      relatedArticleSlugs: [
        legacyJournalPosts[index - 1]?.slug,
        legacyJournalPosts[index + 1]?.slug,
      ].filter(Boolean),
      publishedAt: iso(post.publishedAt),
      updatedAt: iso(post.updatedAt),
    }]; }),
    ...cmsArticles.map((post) => [post.slug, post]),
  ]).values()) : [];
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
const legacyAboutRoutes = legacyAboutPages.map((about) => ({
  path: about.canonicalPath,
  title: about.seoTitle || `${about.title} | SOSO Africa`,
  description: about.seoDescription || about.summary,
  h1: about.title,
  body: stripMarkdown(about.body),
  lastmod: iso(about.modifiedAt),
  about,
}));

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
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><meta name="robots" content="index, follow"><link rel="canonical" href="${escapeHtml(canonical)}"><meta property="og:type" content="${type}"><meta property="og:site_name" content="${escapeHtml(platform.site?.name || "SOSO Africa")}"><meta property="og:locale" content="en_NG"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(canonical)}">${imageMeta}${articleMeta}<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(description)}"><script id="soso-server-schema" type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c")}</script></head><body><div id="root"><main data-soso-crawler-content><h1>${escapeHtml(h1)}</h1>${bodyHtml || `<p>${escapeHtml(body)}</p>`}${links(staticPages)}</main></div><script type="module" src="${escapeHtml(hydrationAsset)}"></script></body></html>`;
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
for (const item of legacyAboutRoutes) {
  const { about } = item;
  routes.push(item);
  await emit(item.path, page({
    ...item,
    type: "website",
    image: about.mediaUrls?.[0],
    imageAlt: `${about.title} — SOSO Africa`,
    bodyHtml: `<article><p>${escapeHtml(stripMarkdown(about.summary))}</p>${renderMarkdown(about.body)}</article>`,
    schema: [{
      "@context": "https://schema.org",
      "@type": "AboutPage",
      name: about.title,
      description: item.description,
      url: absolute(item.path),
      datePublished: iso(about.publishedAt),
      dateModified: iso(about.modifiedAt),
      isPartOf: { "@id": `${siteUrl}/#website` },
      mainEntity: { "@id": `${siteUrl}/#organization` },
    }],
  }));
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
  const articleIndex = articles.findIndex(({ slug }) => slug === article.slug);
  const archivalRelated = articleIndex >= 0 ? [articles[articleIndex - 1]?.slug, articles[articleIndex + 1]?.slug].filter(Boolean) : [];
  routes.push(item); const related = [...(article.relatedProductSlugs || []).map((slug) => `/product/${slug}`), ...((article.relatedArticleSlugs?.length ? article.relatedArticleSlugs : archivalRelated)).map((slug) => `/journal/${slug}`)].filter((href) => /^\/(product|journal)\/[a-z0-9-]+$/.test(href));
  const relatedHtml = related.length ? `<nav aria-label="Related content">${related.map((href) => `<a href="${escapeHtml(href)}">${escapeHtml(href.split("/").at(-1).replaceAll("-", " "))}</a>`).join(" · ")}</nav>` : "";
  const actionsHtml = `<nav aria-label="Article actions"><a href="/shop">Shop current menswear</a> · <a href="/faq">Fit and measurement guide</a></nav>`;
  const takeawayHtml = `<aside aria-label="Article summary"><strong>In brief</strong><p>${escapeHtml(article.takeaway || article.description)}</p></aside>`;
  await emit(item.path, page({ ...item, type: "article", image: article.coverImageUrl, imageAlt: article.coverImageAlt, article, bodyHtml: `${takeawayHtml}${renderMarkdown(article.body)}${actionsHtml}${relatedHtml}`, schema: [{ "@context": "https://schema.org", "@type": "BlogPosting", headline: article.title, description: article.description, articleBody: article.bodyText, datePublished: article.publishedAt, dateModified: article.updatedAt, author: { "@type": "Person", name: article.authorName }, publisher: { "@id": `${siteUrl}/#organization` }, mainEntityOfPage: { "@type": "WebPage", "@id": absolute(item.path) }, ...(article.category ? { articleSection: article.category } : {}), ...(article.tags?.length ? { keywords: article.tags.join(", ") } : {}), ...(article.coverImageUrl ? { image: { "@type": "ImageObject", url: absolute(article.coverImageUrl), ...(article.coverImageAlt ? { caption: article.coverImageAlt } : {}) } } : {}), relatedLink: related.map(absolute) }] }));
}
if (new Set(routes.map((route) => route.path)).size !== routes.length) {
  throw new Error("Refusing to generate duplicate crawler routes.");
}
await writeFile(robotsPath, `User-agent: *\nAllow: /\nDisallow: /checkout\nDisallow: /staff\nDisallow: /sign-in\nDisallow: /sign-up\nDisallow: /journal/preview\nSitemap: ${siteUrl}/sitemap.xml\n`);
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
const legacyAboutLlms = `\n\n## About SOSO Africa\n${legacyAboutRoutes.map((page) => `- [${page.h1}](${absolute(page.path)}): ${page.description}`).join("\n")}`;
await writeFile(resolve(out, "llms.txt"), `# SOSO Africa\n\n${staticPages.map((p) => `- [${p.h1}](${absolute(p.path)}): ${p.description}`).join("\n")}${legacyAboutLlms}${journalLlms}\n`);
await writeFile(resolve(out, "seo-manifest.json"), `${JSON.stringify({ canonicalOrigin: siteUrl, routes, products, journalEntries: articles }, null, 2)}\n`);
process.stdout.write(`Crawlable SEO assets generated for ${siteUrl}.\n`);