import { useEffect } from "react";
import { usePlatformContent, type CatalogProduct, type PlatformContent } from "@/data/platformContent";
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

type StructuredSite = Pick<PlatformContent["site"], "name" | "structuredData">;

/** Organization schema — injected once at app level */
export function buildOrganizationSchema(site: StructuredSite): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "ClothingStore",
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
    name: site.name,
    url: siteUrl || undefined,
    description: site.structuredData.websiteDescription,
  };
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
    document.title = title;
    setMeta('meta[name="description"]', description);
    upsertMeta("name", "robots", pageIsIndexable ? "index, follow" : "noindex, follow");
    upsertMeta("property", "og:title", title);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:type", type);
    upsertMeta("property", "og:url", pageIsIndexable ? absoluteUrl(path) : null);
    upsertMeta("property", "og:image", article?.imageUrl || socialImageUrl() || null);
    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", title);
    upsertMeta("name", "twitter:description", description);
    upsertMeta("name", "twitter:image", article?.imageUrl || socialImageUrl() || null);

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
        ? {
            "@context": "https://schema.org",
            "@type": "Product",
            name: product.name,
            description: product.description,
            image: absoluteUrl(product.img),
            url: absoluteUrl(path),
            brand: { "@type": "Brand", name: site.name },
            offers: {
              "@type": "Offer",
              priceCurrency: "NGN",
              price: product.price,
              availability: "https://schema.org/PreOrder",
              seller: { "@type": "Organization", name: site.name },
            },
          }
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
            publisher: { "@type": "Organization", name: site.name },
            mainEntityOfPage: absoluteUrl(path),
            ...(article.imageUrl ? { image: article.imageUrl } : {}),
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
