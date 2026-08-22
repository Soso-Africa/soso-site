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

export function Seo({
  title,
  description,
  path = "/",
  product,
  noIndex = false,
  type = "website",
  structuredData,
}: SeoProps) {
  useEffect(() => {
    document.title = title;
    setMeta('meta[name="description"]', description);
    upsertMeta("name", "robots", noIndex || !indexingEnabled ? "noindex, follow" : "index, follow");
    upsertMeta("property", "og:title", title);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:type", type);
    upsertMeta("property", "og:url", siteUrl ? absoluteUrl(path) : null);
    upsertMeta("property", "og:image", socialImageUrl() || null);
    upsertMeta("name", "twitter:title", title);
    upsertMeta("name", "twitter:description", description);
    upsertMeta("name", "twitter:image", socialImageUrl() || null);

    const previousCanonical = document.head.querySelector('link[rel="canonical"]');
    previousCanonical?.remove();
    if (siteUrl && !noIndex) {
      const canonical = document.createElement("link");
      canonical.rel = "canonical";
      canonical.href = absoluteUrl(path);
      document.head.appendChild(canonical);
    }

    const previousSchema = document.getElementById("soso-page-schema");
    previousSchema?.remove();
    const productSchema = product && siteUrl
      ? {
          "@context": "https://schema.org",
          "@type": "Product",
          name: product.name,
          description: product.description,
          image: absoluteUrl(product.img),
          url: absoluteUrl(path),
          brand: { "@type": "Brand", name: "SOSO Africa" },
        }
      : null;
    const schemaData = structuredData ?? productSchema;
    if (schemaData && siteUrl && !noIndex) {
      const schema = document.createElement("script");
      schema.id = "soso-page-schema";
      schema.type = "application/ld+json";
      schema.text = JSON.stringify(schemaData);
      document.head.appendChild(schema);
    }

    return () => {
      document.getElementById("soso-page-schema")?.remove();
    };
  }, [description, noIndex, path, product, structuredData, title, type]);

  return null;
}