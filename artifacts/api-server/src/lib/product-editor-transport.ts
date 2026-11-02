import { sql, type SQL } from "drizzle-orm";
import { siteContentTable } from "@workspace/db";
import { PlatformContentSchema } from "./platform-content";

// Reuse every field-level rule, default and refinement from the full editor.
export const PlatformProductEditSchema = PlatformContentSchema.innerType().shape.products.element;

export function productFromDocument(document: SQL, slug: string): SQL {
  return sql`(select p from jsonb_array_elements(coalesce(${document}->'products', '[]'::jsonb)) p
    where p->>'slug' = ${slug} limit 1)`;
}

export const productVersionProjection = {
  draftUpdatedAt: siteContentTable.draftUpdatedAt,
  publishedAt: siteContentTable.publishedAt,
};

export function productEditorProjection(slug: string) {
  const selected = productFromDocument(sql`${siteContentTable.draft}`, slug);
  return {
    ...productVersionProjection,
    product: selected,
    publishedProduct: productFromDocument(sql`${siteContentTable.published}`, slug),
    collections: sql`(select coalesce(jsonb_agg(jsonb_build_object(
      'slug', c->>'slug', 'label', c->>'label', 'category', c->>'category', 'department', c->>'department')), '[]')
      from jsonb_array_elements(${siteContentTable.draft}->'collections') c)`,
    relatedProducts: sql`(select coalesce(jsonb_agg(jsonb_build_object('slug',p->>'slug','name',p->>'name')), '[]')
      from jsonb_array_elements(${siteContentTable.draft}->'products') p
      where (${selected}->'relatedProductSlugs') ? (p->>'slug'))`,
  };
}

/** Existing-product replacement only: order, all other sections and publication stay in PostgreSQL. */
export function productCandidate(slug: string, product: unknown): SQL {
  return sql`jsonb_set(${siteContentTable.draft}, '{products}', (
    select jsonb_agg(case when p->>'slug' = ${slug} then ${JSON.stringify(product)}::jsonb else p end order by n)
    from jsonb_array_elements(${siteContentTable.draft}->'products') with ordinality as entries(p,n)
  ))`;
}

/**
 * Cross-document rules affected by replacement of an existing, immutable slug.
 * The database returns booleans, not the document or a list of every product.
 * Unchanged link targets, duplicate slugs and sparse-featured provenance cannot
 * change in this operation. Field-level rules run through the shared schema.
 */
export function productReferenceChecks(candidate: SQL, slug: string): SQL {
  return sql`(
    with c as (select ${candidate} as doc),
    products as (select p from c, jsonb_array_elements(doc->'products') p),
    selected as (select p from products where p->>'slug' = ${slug}),
    collections as (select entry from c, jsonb_array_elements(doc->'collections') entry),
    menus as (select g from c, jsonb_array_elements(doc#>'{site,megaMenu}') g),
    categories as (select tile from c, jsonb_array_elements(doc#>'{homepage,categories,items}') tile),
    campaign as (select doc#>'{homepage,hero,campaignCta}' as cta from c)
    select jsonb_build_object(
      'collection', exists(select 1 from selected, collections
        where entry->>'department' = p->>'department' and entry->>'category' = p->>'category'),
      'related', not exists(select 1 from selected, jsonb_array_elements_text(coalesce(p->'relatedProductSlugs','[]')) r
        where r = ${slug} or not exists(select 1 from products where p->>'slug' = r)),
      'featuredDepartment', not exists(select 1 from menus, selected
        where g ? 'department' and g->>'department' <> p->>'department'
          and (g->'featuredProductSlugs') ? ${slug}),
      'visibleMenus', not exists(select 1 from menus where (g->>'visible')::boolean and g ? 'department' and (
        (g->>'department' <> 'accessories' and not exists(select 1 from products
          where p->>'department' = g->>'department' and p->>'fulfilmentState' <> 'unavailable'))
        or (exists(select 1 from products where p->>'department' = g->>'department')
          and jsonb_array_length(g->'featuredProductSlugs') = 0)
        or (g->>'department' = 'accessories' and not exists(select 1 from products where p->>'department' = 'accessories')
          and jsonb_array_length(g->'featuredProductSlugs') <> 0)
      )),
      'activeCategories', not exists(select 1 from categories where coalesce((tile->>'active')::boolean,true)
        and not exists(select 1 from products, collections
          where '/collections/' || (entry->>'slug') = tile->>'href'
            and p->>'department' = entry->>'department' and p->>'category' = entry->>'category'
            and p->>'fulfilmentState' <> 'unavailable')),
      'campaign', not exists(select 1 from campaign where (cta->>'enabled')::boolean
        and cta->>'href' like '/collections/%'
        and not exists(select 1 from products where p->>'fulfilmentState' <> 'unavailable' and (
          (cta->>'href' = '/collections/new-arrivals' and (p#>>'{merchandising,isNew}')::boolean)
          or (cta->>'href' <> '/collections/new-arrivals' and exists(select 1 from collections
            where '/collections/' || (entry->>'slug') = cta->>'href'
              and p->>'department' = entry->>'department' and p->>'category' = entry->>'category'))
        ))),
      'mappingOwnership', not exists(select 1 from selected s, products other,
        lateral (select s.p->>'commerceProductId' as id union all
          select value from jsonb_each_text(coalesce(s.p->'commerceVariantIds','{}'))) ids
        where other.p->>'slug' <> ${slug} and ids.id is not null and (
          other.p->>'commerceProductId' = ids.id or exists(
            select 1 from jsonb_each_text(coalesce(other.p->'commerceVariantIds','{}')) where value = ids.id)))
    )
  )`;
}

export function productLocalReferenceIssues(product: {
  slug: string; img: string; images: { src: string }[]; relatedProductSlugs?: string[];
}): string[] {
  const issues: string[] = [];
  if (product.img && !product.images.some((image) => image.src === product.img))
    issues.push("Primary product image must be included in the approved images.");
  const images = product.images.map((image) => image.src).filter(Boolean);
  if (new Set(images).size !== images.length) issues.push("Duplicate approved product image.");
  const related = product.relatedProductSlugs ?? [];
  if (new Set(related).size !== related.length) issues.push("Duplicate related product.");
  if (related.includes(product.slug)) issues.push("A product cannot relate to itself.");
  return issues;
}
