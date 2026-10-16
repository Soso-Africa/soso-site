import { createHash } from "node:crypto";
import { normalizeStorefrontTitle } from "@workspace/api-zod";
import { publicCatalogueContent } from "./public-catalogue-checkout";
import type { PublicSnapshot } from "./public-platform-cache";

type EncodedJson = { body: Buffer; etag: string };

function encodeJson(value: unknown): EncodedJson {
  const body = Buffer.from(JSON.stringify(value));
  return { body, etag: `W/"${createHash("sha256").update(body).digest("hex")}"` };
}

/**
 * CPU-only reuse, not a freshness cache. Callers must first read the live
 * version-checked public snapshot and (for platform) live checkout activation.
 * Keep only the current snapshot, its site body and two activation variants.
 */
export function createPublicContentResponses() {
  let current: PublicSnapshot | null = null;
  let site: EncodedJson | null = null;
  const platform = new Map<boolean, EncodedJson>();

  function select(snapshot: PublicSnapshot) {
    if (current !== snapshot) {
      current = snapshot;
      site = null;
      platform.clear();
    }
  }

  return {
    site(snapshot: PublicSnapshot): EncodedJson {
      select(snapshot);
      site ??= encodeJson({ content: snapshot.content.site });
      return site;
    },
    platform(snapshot: PublicSnapshot, checkoutEnabled: boolean): EncodedJson {
      select(snapshot);
      const cached = platform.get(checkoutEnabled);
      if (cached) return cached;
      const publicContent = publicCatalogueContent(snapshot.content, checkoutEnabled);
      const oldTitle = publicContent.homepage.seo.title;
      const currentTitle = normalizeStorefrontTitle(oldTitle);
      const response = encodeJson({
        content: currentTitle === oldTitle ? publicContent : {
          ...publicContent,
          homepage: { ...publicContent.homepage, seo: { ...publicContent.homepage.seo, title: currentTitle } },
        },
        publishedAt: snapshot.publishedAt,
        checkoutEnabled,
      });
      platform.set(checkoutEnabled, response);
      return response;
    },
  };
}
