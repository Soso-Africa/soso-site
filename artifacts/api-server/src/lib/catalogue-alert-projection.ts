import { sql } from "drizzle-orm";
import { siteContentTable } from "@workspace/db";
import { z } from "zod";
import { findWebhookStaleMappings, type CatalogueWebhookInvalidation } from "./catalogue-mapping";

export const CatalogueAlertProductsSchema = z.array(z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  productId: z.string().uuid(),
  variantIds: z.record(z.string(), z.string().uuid()),
  confirmedAt: z.string().datetime(),
}));

// Select only the identity/confirmation fields used by the alert. No draft
// copy, imagery, evidence history, or published document crosses the DB wire.
export const catalogueAlertProjection = sql<unknown>`coalesce((
  select jsonb_agg(jsonb_build_object(
    'slug', product->'slug',
    'name', product->'name',
    'productId', product->'commerceProductId',
    'variantIds', coalesce(product->'commerceVariantIds', '{}'::jsonb),
    'confirmedAt', product#>'{commerceMappingConfirmation,confirmedAt}'
  ))
  from jsonb_array_elements(
    case when jsonb_typeof(${siteContentTable.draft}->'products') = 'array'
      then ${siteContentTable.draft}->'products' else '[]'::jsonb end
  ) as product
  where product->>'commerceProductId' is not null
    and product->>'commerceMappingConfirmation' is not null
), '[]'::jsonb)`;

export function findStaleProjectedProducts(
  products: z.infer<typeof CatalogueAlertProductsSchema>,
  invalidations: CatalogueWebhookInvalidation[],
): Array<{ slug: string; name: string }> {
  const stale = new Set(findWebhookStaleMappings(products.map((product) => ({
    slug: product.slug,
    productId: product.productId,
    variantIds: Object.values(product.variantIds),
    confirmedAt: new Date(product.confirmedAt),
  })), invalidations));
  return products.filter((product) => stale.has(product.slug))
    .map(({ slug, name }) => ({ slug, name }));
}