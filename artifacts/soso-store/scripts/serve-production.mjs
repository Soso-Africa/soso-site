import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, normalize, resolve, sep } from "node:path";

const port = Number(process.env.PORT || 24036);
const outputDirectory = resolve("artifacts/soso-store/dist/public");
const rawSiteUrl = (process.env.VITE_PUBLIC_SITE_URL || "").trim();
const indexingEnabled = process.env.VITE_SOSO_INDEXING_ENABLED === "true";
const catalogApproved = process.env.VITE_SOSO_CATALOG_APPROVED === "true";
const policiesApproved = process.env.VITE_SOSO_POLICIES_APPROVED === "true";
const journalApproved = process.env.VITE_SOSO_JOURNAL_APPROVED === "true";
const socialImagePath = (process.env.VITE_SOSO_SOCIAL_IMAGE_PATH || "").trim();

function normalizeSiteUrl(value) {
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

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[character]));
}

function absoluteUrl(path) {
  const normalPath = path.startsWith("/") ? path : `/${path}`;
  return `${siteUrl}${normalPath}`;
}

function replaceMeta(html, selector, metaTag) {
  const expression = new RegExp(`<meta\\s+${selector}\\s+content="[^"]*"[^>]*>`, "i");
  return expression.test(html) ? html.replace(expression, metaTag) : html.replace("</head>", `  ${metaTag}\n  </head>`);
}

function removeMatching(html, expression) {
  return html.replace(expression, "");
}

const siteUrl = normalizeSiteUrl(rawSiteUrl);
const canIndex = Boolean(siteUrl) && indexingEnabled;
const [shell, manifestSource] = await Promise.all([
  readFile(resolve(outputDirectory, "index.html"), "utf8"),
  readFile(resolve(outputDirectory, "seo-manifest.json"), "utf8"),
]);
const { products, journalEntries = [] } = JSON.parse(manifestSource);

const defaultMeta = {
  title: "SOSO Africa | Premium Nigerian Menswear",
  description: "Discover SOSO Africa's premium kaftans, agbadas, dashikis and shirts, with considered sizing guidance and stylist support.",
};

function metadataForPath(pathname) {
  if (pathname === "/") return { ...defaultMeta, indexable: canIndex };
  if (pathname === "/shop") {
    return {
      title: "Shop premium menswear | SOSO Africa",
      description: "Browse SOSO Africa kaftans, agbadas, dashikis, two-piece sets and shirts.",
      indexable: canIndex && catalogApproved,
    };
  }

  const product = products.find((candidate) => pathname === `/product/${candidate.slug}`);
  if (product) {
    return {
      title: `${product.name} | SOSO Africa`,
      description: `${product.description} View current price and speak to a SOSO stylist for fit assistance.`,
      indexable: canIndex && catalogApproved,
      product,
    };
  }

  const policies = {
    "/policies": ["Policies & support | SOSO Africa", "SOSO Africa customer policy and garment care information."],
    "/privacy": ["Privacy & cookie notice | SOSO Africa", "SOSO Africa privacy and cookie information."],
    "/terms": ["Terms of purchase | SOSO Africa", "SOSO Africa terms of purchase."],
    "/delivery-returns": ["Delivery, returns & refunds | SOSO Africa", "SOSO Africa delivery, returns and refunds information."],
    "/care": ["Garment care | SOSO Africa", "SOSO Africa garment care guidance."],
  };
  if (policies[pathname]) {
    const [title, description] = policies[pathname];
    return { title, description, indexable: canIndex && policiesApproved };
  }

  if (pathname === "/journal") {
    return {
      title: "The Journal | SOSO Africa",
      description: "Reflections on bespoke tailoring, cultural heritage, and African luxury from SOSO Africa.",
      indexable: canIndex && journalApproved && journalEntries.length > 0,
    };
  }

  const journalArticle = journalEntries.find((article) => pathname === `/journal/${article.slug}`);
  if (journalArticle) {
    return {
      title: `${journalArticle.title} | SOSO Africa Journal`,
      description: journalArticle.excerpt,
      indexable: canIndex && journalApproved,
      journalArticle,
    };
  }

  if (pathname === "/checkout") {
    return {
      title: "Secure checkout | SOSO Africa",
      description: "Complete payment for a SOSO Africa order.",
      indexable: false,
    };
  }

  return {
    title: pathname.startsWith("/staff") || pathname.startsWith("/sign-")
      ? "Staff access | SOSO Africa"
      : "Page not found | SOSO Africa",
    description: "The requested SOSO Africa page is not available.",
    indexable: false,
  };
}

function renderPage(pathname) {
  const metadata = metadataForPath(pathname);
  const robots = metadata.indexable ? "index, follow" : "noindex, nofollow";
  let html = shell
    .replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(metadata.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*"[^>]*>/i, `<meta name="description" content="${escapeHtml(metadata.description)}" />`);

  html = replaceMeta(html, 'property="og:title"', `<meta property="og:title" content="${escapeHtml(metadata.title)}" />`);
  html = replaceMeta(html, 'property="og:description"', `<meta property="og:description" content="${escapeHtml(metadata.description)}" />`);
  html = replaceMeta(html, 'name="twitter:title"', `<meta name="twitter:title" content="${escapeHtml(metadata.title)}" />`);
  html = replaceMeta(html, 'name="twitter:description"', `<meta name="twitter:description" content="${escapeHtml(metadata.description)}" />`);
  html = replaceMeta(html, 'name="robots"', `<meta name="robots" content="${robots}" data-soso-managed="robots" />`);
  html = removeMatching(html, /\s*<link rel="canonical" href="[^"]*"\s*\/?>/gi);
  html = removeMatching(html, /\s*<meta property="og:url" content="[^"]*"\s*\/?>/gi);
  html = removeMatching(html, /\s*<meta property="og:image" content="[^"]*"\s*\/?>/gi);
  html = removeMatching(html, /\s*<meta name="twitter:image" content="[^"]*"\s*\/?>/gi);
  html = removeMatching(html, /\s*<script id="soso-server-schema" type="application\/ld\+json">.*?<\/script>/gis);

  if (!metadata.indexable) return html;

  const canonical = absoluteUrl(pathname);
  html = html.replace("</head>", `    <link rel="canonical" href="${escapeHtml(canonical)}" />\n    <meta property="og:url" content="${escapeHtml(canonical)}" />\n  </head>`);

  if (socialImagePath) {
    const socialImage = absoluteUrl(socialImagePath);
    html = html.replace("</head>", `    <meta property="og:image" content="${escapeHtml(socialImage)}" />\n    <meta name="twitter:image" content="${escapeHtml(socialImage)}" />\n  </head>`);
  }

  if (metadata.product) {
    const product = metadata.product;
    const schema = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.name,
      description: product.description,
      image: absoluteUrl(product.image),
      url: canonical,
      brand: { "@type": "Brand", name: "SOSO Africa" },
    };
    html = html.replace("</head>", `    <script id="soso-server-schema" type="application/ld+json">${JSON.stringify(schema)}</script>\n  </head>`);
  }

  if (metadata.journalArticle) {
    const article = metadata.journalArticle;
    const coverImage = article.coverImageUrl
      ? (article.coverImageUrl.startsWith("https://") ? article.coverImageUrl : absoluteUrl(article.coverImageUrl))
      : undefined;
    const schema = {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: article.title,
      description: article.excerpt,
      datePublished: article.publishedAt,
      author: { "@type": "Person", name: article.authorName },
      mainEntityOfPage: canonical,
      ...(coverImage ? { image: coverImage } : {}),
    };
    html = html.replace("</head>", `    <script id="soso-server-schema" type="application/ld+json">${JSON.stringify(schema)}</script>\n  </head>`);
  }

  return html;
}

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".woff2": "font/woff2",
};

async function staticFileForPath(pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const normalizedPath = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, "");
  const candidate = resolve(outputDirectory, `.${normalizedPath}`);
  if (!candidate.startsWith(`${outputDirectory}${sep}`) && candidate !== outputDirectory) return null;

  try {
    const file = await stat(candidate);
    return file.isFile() ? candidate : null;
  } catch {
    return null;
  }
}

createServer(async (request, response) => {
  const pathname = new URL(request.url || "/", "http://localhost").pathname;
  const filePath = await staticFileForPath(pathname);

  if (filePath && pathname !== "/" && pathname !== "/index.html") {
    response.writeHead(200, {
      "Content-Type": contentTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "public, max-age=300",
    });
    createReadStream(filePath).pipe(response);
    return;
  }

  const metadata = metadataForPath(pathname);
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Robots-Tag": metadata.indexable ? "index, follow" : "noindex, nofollow",
  });
  response.end(renderPage(pathname));
}).listen(port, "0.0.0.0", () => {
  process.stdout.write(`SOSO production server listening on ${port}.\n`);
});