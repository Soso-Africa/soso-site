import { useEffect } from "react";
import type { CatalogProduct } from "@/data/products";

type SeoProps = {
  title: string;
  description: string;
  path?: string;
  product?: CatalogProduct;
};

const siteUrl = (import.meta.env.VITE_PUBLIC_SITE_URL || "").replace(/\/$/, "");

function setMeta(selector: string, content: string) {
  const element = document.head.querySelector<HTMLMetaElement>(selector);
  if (element) element.content = content;
}

export function Seo({ title, description, path = "/", product }: SeoProps) {
  useEffect(() => {
    document.title = title;
    setMeta('meta[name="description"]', description);
    setMeta('meta[property="og:title"]', title);
    setMeta('meta[property="og:description"]', description);
    setMeta('meta[name="twitter:title"]', title);
    setMeta('meta[name="twitter:description"]', description);

    const previousCanonical = document.head.querySelector('link[rel="canonical"]');
    previousCanonical?.remove();
    if (siteUrl) {
      const canonical = document.createElement("link");
      canonical.rel = "canonical";
      canonical.href = `${siteUrl}${path}`;
      document.head.appendChild(canonical);
    }

    const previousSchema = document.getElementById("soso-product-schema");
    previousSchema?.remove();
    if (product && siteUrl) {
      const schema = document.createElement("script");
      schema.id = "soso-product-schema";
      schema.type = "application/ld+json";
      schema.text = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Product",
        name: product.name,
        description: product.description,
        image: `${siteUrl}${product.img}`,
        url: `${siteUrl}${path}`,
        offers: {
          "@type": "Offer",
          priceCurrency: "NGN",
          price: product.price,
          availability: "https://schema.org/PreOrder",
          url: `${siteUrl}${path}`,
        },
      });
      document.head.appendChild(schema);
    }

    return () => {
      document.getElementById("soso-product-schema")?.remove();
    };
  }, [description, path, product, title]);

  return null;
}