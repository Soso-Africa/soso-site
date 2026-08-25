import { useEffect } from "react";
import { usePlatformContent, type CatalogProduct, type PlatformContent } from "@/data/platformContent";
import { buildProductStructuredData } from "@/lib/product-schema";
import { absoluteUrl, indexingEnabled, siteUrl, socialImageUrl } from "@/lib/seo";

type SeoProps = {
  title: string;
  description: string;
  path?: string;
  product?: CatalogProduct;
  noIndex?: boolean;
  type?: "website" | "article";
  structuredData?: Record<string, unknown> | null;
  /** Article-specific metadata, used when type="article" */
  article?: {
    publishedAt?: string;
    modifiedAt?: string;
    authorName?: string;
    imageUrl?: string;
    imageAlt?: string;
    section?: string;
    tags?: string[];
  };
  breadcrumbs?: { name: string; path: string }[];
};

function setMeta(selector: string, content: string | null) {
  const element = document.head.querySelector<HTMLMetaElement>(selector);
  if (element && content) {
    element.content = content;
  } else if (element && !content) {
    element.remove();
  }
}

function upsertMeta(attribute: "name" | "property", value: string, content: string | null) {
  const selector = `meta[${attribute}="${value}"]`;
  const existing = document.head.querySelector<HTMLMetaElement>(selector);
  if (!content) {
    existing?.remove();
    return;
  }
  const element = existing ?? document.createElement("meta");
  element.setAttribute(attribute, value);
  element.content = content;
  element.dataset.sosoManaged = "true";
  if (!existing) document.head.appendChild(element);
}

function injectSchema(id: string, data: Record<string, unknown> | null) {
  const prev = document.getElementById(id);
  prev?.remove();
  if (!data || !siteUrl || !indexingEnabled) return;
  const script = document.createElement("script");
  script.id = id;
  script.type = "application/ld+json";
  script.text = JSON.stringify(data);
  document.head.appendChild(script);
}

type StructuredSite = Pick<PlatformContent["site"], "name" | "logoAlt" | "structuredData">;

/** Organization schema — injected once at app level */
export function buildOrganizationSchema(site: StructuredSite): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "ClothingStore",
    "@id": siteUrl ? `${siteUrl}/#organization` : undefined,
    name: site.name,
    description: site.structuredData.organizationDescription,
    url: siteUrl || undefined,
    address: {
      "@type": "PostalAddress",
      addressLocality: site.structuredData.locality,
      addressCountry: site.structuredData.country,
    },
      areaServed: { "@type": "Country", name: site.structuredData.country, identifier: site.structuredData.countryCode },
    brand: { "@type": "Brand", name: site.name },
    ...(socialImageUrl() ? { image: socialImageUrl() } : {}),
  };
}

/** WebSite schema with potential SearchAction */
export function buildWebsiteSchema(site: StructuredSite): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": siteUrl ? `${siteUrl}/#website` : undefined,
    name: site.name,
    url: siteUrl || undefined,
    description: site.structuredData.websiteDescription,
  };
}

function schemaImage(url?: string, alt?: string) {
  if (!url) return undefined;
  return {
    "@type": "ImageObject",
    url: absoluteUrl(url),
    ...(alt ? { caption: alt } : {}),
  };
}

export function buildProductSchema(product: CatalogProduct, site: StructuredSite, path: string): Record<string, unknown> {
  return buildProductStructuredData(product, site, path, { siteUrl, absoluteUrl });
}

export function Seo({
  title,
  description,
  path = "/",
  product,
  noIndex = false,
  type = "website",
  structuredData,
  article,
  breadcrumbs,
}: SeoProps) {
  const { data } = usePlatformContent();
  const site = data?.content.site;

  useEffect(() => {
    const pageIsIndexable = Boolean(siteUrl && indexingEnabled && !noIndex);
    // The static response carries one route schema for crawlers. Hydration owns
    // schema state from this point onward, so remove it before client parity.
    document.getElementById("soso-server-schema")?.remove();
    document.title = title;
    setMeta('meta[name="description"]', description);
    upsertMeta("name", "robots", pageIsIndexable ? "index, follow" : "noindex, follow");
    upsertMeta("property", "og:title", title);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:type", type);
    upsertMeta("property", "og:url", pageIsIndexable ? absoluteUrl(path) : null);
    upsertMeta("property", "og:site_name", site?.name ?? null);
    upsertMeta("property", "og:locale", "en_NG");
    const imageUrl = article?.imageUrl || socialImageUrl() || null;
    upsertMeta("property", "og:image", imageUrl ? absoluteUrl(imageUrl) : null);
    upsertMeta("property", "og:image:alt", imageUrl ? article?.imageAlt || site?.logoAlt || title : null);
    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", title);
    upsertMeta("name", "twitter:description", description);
    upsertMeta("name", "twitter:image", imageUrl ? absoluteUrl(imageUrl) : null);
    upsertMeta("name", "twitter:image:alt", imageUrl ? article?.imageAlt || site?.logoAlt || title : null);

    // Article-specific meta
    if (type === "article" && article) {
      upsertMeta("property", "article:published_time", article.publishedAt ?? null);
      upsertMeta("property", "article:modified_time", article.modifiedAt ?? null);
      upsertMeta("property", "article:author", article.authorName ?? null);
      (article.tags ?? []).forEach((tag, i) => {
        const selector = `meta[property="article:tag"][data-idx="${i}"]`;
        const el = document.head.querySelector<HTMLMetaElement>(selector) ?? document.createElement("meta");
        el.setAttribute("property", "article:tag");
        el.setAttribute("data-idx", String(i));
        el.content = tag;
        el.dataset.sosoManaged = "true";
        if (!document.head.querySelector(selector)) document.head.appendChild(el);
      });
      document.head.querySelectorAll<HTMLMetaElement>('meta[property="article:tag"][data-soso-managed="true"]').forEach((el) => {
        if (Number(el.dataset.idx) >= (article.tags?.length ?? 0)) el.remove();
      });
    } else {
      document.head.querySelectorAll<HTMLMetaElement>('meta[property^="article:"]').forEach((el) => el.remove());
    }

    // Canonical
    document.head.querySelector('link[rel="canonical"]')?.remove();
    if (pageIsIndexable) {
      const canonical = document.createElement("link");
      canonical.rel = "canonical";
      canonical.href = absoluteUrl(path);
      document.head.appendChild(canonical);
    }

    // Page schema (product, article, or supplied)
    const productSchema =
      product && site && pageIsIndexable
        ? buildProductSchema(product, site, path)
        : null;

    const articleSchema =
      type === "article" && article && site && pageIsIndexable
        ? {
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            headline: title,
            description,
            datePublished: article.publishedAt,
            dateModified: article.modifiedAt ?? article.publishedAt,
            author: { "@type": "Person", name: article.authorName ?? site.name },
            publisher: { "@id": `${siteUrl}/#organization`, name: site.name },
            mainEntityOfPage: { "@type": "WebPage", "@id": absoluteUrl(path) },
            ...(article.section ? { articleSection: article.section } : {}),
            ...(article.tags?.length ? { keywords: article.tags.join(", ") } : {}),
            ...(article.imageUrl ? { image: schemaImage(article.imageUrl, article.imageAlt) } : {}),
          }
        : null;

    injectSchema("soso-page-schema", pageIsIndexable ? structuredData ?? articleSchema ?? productSchema : null);
    injectSchema("soso-organization-schema", site ? buildOrganizationSchema(site) : null);
    injectSchema("soso-website-schema", site ? buildWebsiteSchema(site) : null);

    // Breadcrumb schema
    const breadcrumbSchema =
      breadcrumbs && pageIsIndexable && site
        ? {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: site.name, item: siteUrl },
              ...breadcrumbs.map((b, i) => ({
                "@type": "ListItem",
                position: i + 2,
                name: b.name,
                item: absoluteUrl(b.path),
              })),
            ],
          }
        : null;
    injectSchema("soso-breadcrumb-schema", breadcrumbSchema);

    return () => {
      document.getElementById("soso-page-schema")?.remove();
      document.getElementById("soso-breadcrumb-schema")?.remove();
      document.getElementById("soso-organization-schema")?.remove();
      document.getElementById("soso-website-schema")?.remove();
    };
  }, [description, noIndex, path, product, structuredData, title, type, article, breadcrumbs, site]);

  return null;
}
