import { useEffect } from "react";
import type { CatalogProduct } from "@/data/products";
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

/** Organization schema — injected once at app level */
export function buildOrganizationSchema(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "ClothingStore",
    name: "SOSO Africa",
    description:
      "SOSO Africa is a bespoke menswear house based in Abuja, Nigeria, specialising in kaftans, agbadas, dashikis, and shirting made to order for the individual.",
    url: siteUrl || undefined,
    address: {
      "@type": "PostalAddress",
      addressLocality: "Abuja",
      addressCountry: "NG",
    },
    brand: { "@type": "Brand", name: "SOSO Africa" },
    ...(socialImageUrl() ? { image: socialImageUrl() } : {}),
  };
}

/** WebSite schema with potential SearchAction */
export function buildWebsiteSchema(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "SOSO Africa",
    url: siteUrl || undefined,
    description:
      "Premium made-to-order African menswear from Abuja. Kaftans, agbadas, dashikis, and shirting — made for the individual.",
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
  useEffect(() => {
    document.title = title;
    setMeta('meta[name="description"]', description);
    upsertMeta("name", "robots", noIndex || !indexingEnabled ? "noindex, follow" : "index, follow");
    upsertMeta("property", "og:title", title);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:type", type);
    upsertMeta("property", "og:url", siteUrl ? absoluteUrl(path) : null);
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
    if (siteUrl && !noIndex) {
      const canonical = document.createElement("link");
      canonical.rel = "canonical";
      canonical.href = absoluteUrl(path);
      document.head.appendChild(canonical);
    }

    // Page schema (product, article, or supplied)
    const productSchema =
      product && siteUrl
        ? {
            "@context": "https://schema.org",
            "@type": "Product",
            name: product.name,
            description: product.description,
            image: absoluteUrl(product.img),
            url: absoluteUrl(path),
            brand: { "@type": "Brand", name: "SOSO Africa" },
            offers: {
              "@type": "Offer",
              priceCurrency: "NGN",
              price: product.price,
              availability: "https://schema.org/PreOrder",
              seller: { "@type": "Organization", name: "SOSO Africa" },
            },
          }
        : null;

    const articleSchema =
      type === "article" && article && siteUrl
        ? {
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            headline: title,
            description,
            datePublished: article.publishedAt,
            dateModified: article.modifiedAt ?? article.publishedAt,
            author: { "@type": "Person", name: article.authorName ?? "SOSO Africa" },
            publisher: { "@type": "Organization", name: "SOSO Africa" },
            mainEntityOfPage: absoluteUrl(path),
            ...(article.imageUrl ? { image: article.imageUrl } : {}),
          }
        : null;

    injectSchema("soso-page-schema", structuredData ?? articleSchema ?? productSchema);

    // Breadcrumb schema
    const breadcrumbSchema =
      breadcrumbs && siteUrl && indexingEnabled
        ? {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "SOSO Africa", item: siteUrl },
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
    };
  }, [description, noIndex, path, product, structuredData, title, type, article, breadcrumbs]);

  return null;
}
