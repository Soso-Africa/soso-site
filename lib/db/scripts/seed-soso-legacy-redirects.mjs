import { pathToFileURL } from "node:url";
import pg from "pg";

export const LEGACY_REDIRECT_SEED_ACTOR = "system:legacy-redirect-seed-v1";

/** Approved, valuable SOSO legacy URLs. Obsolete WordPress utilities stay excluded. */
export const legacyRedirects = [
  ["/my-account/", "/sign-in"],
  ["/checkout/", "/checkout"],
  ["/cart/", "/?cart=open"],
  ["/privacy-policy-2/", "/privacy"],
  ["/reviews/", "/about#reviews"],
  ["/post-reviews/", "/about#reviews"],
  ["/newarrivals/", "/shop?sort=newest"],
  ["/blog/", "/journal"],
  ["/track-orders/", "/delivery-returns#track-order"],
  ["/track-your-order/", "/delivery-returns#track-order"],
  ["/guest-track-order-form/", "/delivery-returns#track-order"],
  ["/track-fedex-order/", "/delivery-returns#track-order"],
  ["/our-story/", "/about/our-story"],
  ["/the-architect-of-the-modern-man/", "/about/the-architect-of-the-modern-man"],
  ["/the-client/", "/about/the-client"],
  ["/craftsmanship/", "/about/craftsmanship"],
  ["/about-soso-legacy-vision/", "/about/legacy-vision"],
  ["/about-soso-the-soso-foundation/", "/about/soso-foundation"],
  ["/partner-with-us/", "/about/partner-with-us"],
  ["/danshiki/", "/collections/dashikis"],
  ["/product-category/kaftans/", "/collections/kaftans"],
  ["/product-category/agbada/", "/collections/agbadas"],
  ["/product-category/cufflinks/", "/shop?search=cufflinks"],
  ["/product-category/danshiki/", "/collections/dashikis"],
  ["/product-category/kigali-2025/", "/shop?search=Kigali"],
  ["/product-category/koles-collection/", "/shop?search=Koles"],
  ["/product-category/pants/", "/shop?search=pants"],
  ["/product-category/shirts/", "/collections/shirts"],
  ["/product-category/ss26-27/", "/shop?search=SS26"],
  ["/product-category/two-piece/", "/collections/two-piece"],
  ["/product-category/women/", "/collections/women-ready-to-wear"],
  ["/2025/10/24/abuja-mens-fashion-koles-collection-soso-africa-nigerian-designer-menswear-african-fashion-brands-modern-kaftan-abuja-style-mens-traditional-wear-nigeria/", "/journal/abuja-man-koles-collection"],
  ["/2025/11/01/kaftan-style-for-men-modern-designs-abuja/", "/journal/modern-kaftan-styles-men-abuja"],
  ["/2025/11/07/the-rise-of-the-abuja-gentleman-how-native-wear-became-everyday-luxury/", "/journal/rise-abuja-gentleman-native-wear"],
  ["/2025/11/14/danshiki-for-the-modern-african-man/", "/journal/dashiki-modern-african-man"],
  ["/2025/11/21/how-the-abuja-man-is-redefining-native-wear/", "/journal/abuja-man-redefining-native-wear"],
  ["/2025/11/29/the-grey-italian-wool-kaftan-refined-northern-elegance-for-the-modern-abuja-man/", "/journal/grey-italian-wool-kaftan"],
  ["/2025/10/17/into-the-process-sosos-latest-traditional-mens-wear-clothing-collection/", "/journal/into-the-process-koles-collection"],
  ["/2025/12/06/abuja-modern-mens-fashion-hub/", "/journal/abuja-modern-menswear-hub"],
  ["/2025/12/20/the-d-o-capsule/", "/journal/the-d-o-capsule"],
  ["/2026/04/29/soso-spring-summer-2026-2027-african-modern-kaftan-collection/", "/journal/spring-summer-african-modern-kaftan-collection"],
  ["/2026/05/12/modern-kaftans-beyond-traditional-wear/", "/journal/modern-kaftans-beyond-traditional-wear"],
  ["/2026/05/14/modern-mens-two-piece-sets/", "/journal/modern-mens-two-piece-sets"],
  ["/2026/05/29/the-rise-of-minimalist-african-luxury-fashion/", "/journal/minimalist-african-luxury-fashion"],
  ["/2026/06/08/how-to-style-black-traditional-outfits-for-modern-occasions/", "/journal/style-black-traditional-outfits-modern-occasions"],
].map(([fromPath, toPath]) => ({ fromPath, toPath, statusCode: 301 }));

function quoteIdentifier(identifier) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) throw new Error("Invalid PostgreSQL identifier");
  return `"${identifier.replaceAll('"', '""')}"`;
}

export async function seedSosoLegacyRedirects({ databaseUrl, schema } = {}) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required to seed SOSO legacy redirects");
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query("BEGIN");
    if (schema) await client.query(`SET LOCAL search_path TO ${quoteIdentifier(schema)}, pg_catalog`);
    await client.query("SELECT pg_advisory_xact_lock(hashtext('soso-legacy-redirect-seed-v1'))");
    const createdPaths = [];

    for (const redirect of legacyRedirects) {
      const result = await client.query(
        `INSERT INTO soso_redirects
          (from_path, to_path, status_code, is_published, updated_by_clerk_user_id)
         VALUES ($1, $2, 301, true, $3)
         ON CONFLICT (from_path) DO NOTHING
         RETURNING id, from_path, to_path, status_code, is_published,
                   updated_by_clerk_user_id, created_at, updated_at`,
        [redirect.fromPath, redirect.toPath, LEGACY_REDIRECT_SEED_ACTOR],
      );
      const row = result.rows[0];
      if (!row) continue;

      const snapshot = {
        id: row.id,
        fromPath: row.from_path,
        toPath: row.to_path,
        statusCode: row.status_code,
        isPublished: row.is_published,
        updatedByClerkUserId: row.updated_by_clerk_user_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
      const revision = await client.query(
        `INSERT INTO soso_redirect_revisions
          (redirect_id, event, snapshot, created_by_clerk_user_id)
         VALUES ($1, 'created', $2::jsonb, $3)
         RETURNING id`,
        [row.id, JSON.stringify(snapshot), LEGACY_REDIRECT_SEED_ACTOR],
      );
      await client.query(
        `INSERT INTO soso_audit_logs
          (actor_clerk_user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, 'redirect.created', 'redirect', $2, $3::jsonb)`,
        [LEGACY_REDIRECT_SEED_ACTOR, row.id, JSON.stringify({
          fromPath: row.from_path,
          toPath: row.to_path,
          statusCode: row.status_code,
          isPublished: row.is_published,
          revisionId: revision.rows[0].id,
          source: "approved_legacy_redirect_seed_v1",
        })],
      );
      createdPaths.push(row.from_path);
    }

    await client.query("COMMIT");
    return {
      createdPaths,
      skippedPaths: legacyRedirects
        .filter((redirect) => !createdPaths.includes(redirect.fromPath))
        .map((redirect) => redirect.fromPath),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await seedSosoLegacyRedirects({ databaseUrl: process.env.DATABASE_URL });
  process.stdout.write(`Created: ${result.createdPaths.join(", ") || "none"}; skipped: ${result.skippedPaths.join(", ") || "none"}\n`);
}