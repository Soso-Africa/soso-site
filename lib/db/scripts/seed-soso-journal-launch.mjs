import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import pg from "pg";

export const JOURNAL_SEED_ACTOR = "system:soso-journal-launch";

const weddingSlug = "what-to-wear-to-a-nigerian-wedding";
const buyingSlug = "how-to-buy-luxury-nigerian-menswear-online";
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, "../..", "..");

function quoteIdentifier(identifier) {
  if (!/^[a-z_][a-z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid PostgreSQL schema name: ${identifier}`);
  }
  return `"${identifier}"`;
}

function hash(post) {
  return createHash("sha256").update(JSON.stringify({
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    body: post.body,
    coverImageUrl: post.coverImageUrl,
    coverImageAlt: post.coverImageAlt,
    authorName: post.authorName,
    category: post.category,
    tags: post.tags,
    seoTitle: post.seoTitle,
    seoDescription: post.seoDescription,
    readTimeMinutes: post.readTimeMinutes,
    relatedProductSlugs: post.relatedProductSlugs,
    relatedArticleSlugs: post.relatedArticleSlugs,
    status: post.status,
  })).digest("hex");
}

function snapshot(post) {
  return {
    slug: post.slug, title: post.title, excerpt: post.excerpt, body: post.body,
    coverImageUrl: post.coverImageUrl, coverImageAlt: post.coverImageAlt,
    authorName: post.authorName, category: post.category, tags: post.tags,
    seoTitle: post.seoTitle, seoDescription: post.seoDescription,
    readTimeMinutes: post.readTimeMinutes, relatedProductSlugs: post.relatedProductSlugs,
    relatedArticleSlugs: post.relatedArticleSlugs, status: post.status,
    publishedAt: post.publishedAt.toISOString(),
  };
}

const posts = [
  {
    slug: weddingSlug,
    title: "What to Wear to a Nigerian Wedding: A Modern Agbada, Kaftan & Guest Style Guide",
    excerpt: "An answer-first guide to choosing a polished Nigerian wedding look, from agbada and kaftan proportion to respectful guest styling.",
    body: `## Start with the invitation and the couple’s direction

For a Nigerian wedding, the right outfit is one that respects the ceremony, the hosts and the level of formality. Read the invitation first: note the venue, time of day, dress code and any aso ebi direction. If the couple has shared a fabric or colour story, follow it exactly rather than treating it as a loose suggestion.

## Choose the silhouette for your role

An agbada is a strong choice for a groom, principal guest or a highly formal celebration. Its flowing outer layer, buba and trousers create presence, so fit matters most at the shoulder, sleeve and trouser length. A kaftan offers a cleaner, more streamlined line for guests who want ceremony-ready polish with less volume. For a daytime or less formal event, a refined shirt or coordinated two-piece can be appropriate when the invitation supports it.

## Build a modern look, not a costume

Let one element lead. If the garment has embroidery, keep footwear and accessories restrained. If the fabric is quiet, texture, a considered cap or a subtle pocket square can add interest. Choose footwear that is clean, comfortable and suitable for the venue; a long celebration is not the place to discover a difficult fit.

Colour is contextual. Ivory, cream, black, jewel tones and earthy shades can all work, but avoid competing with the wedding party or ignoring a stated palette. When in doubt, ask the hosts or a stylist before committing.

## Get the fit right before the day

Use the product size guide as a starting point, then compare it with a garment you already wear well. For an agbada, ensure the inner layers sit cleanly beneath the outer robe. For a kaftan, check chest ease, shoulder comfort and length while seated and walking. If you are between sizes or want a personal fit, choose Custom only after confirming the measurements the atelier needs.

SOSO pieces are made to order. Ask a SOSO stylist about your occasion, preferred fit and any measurement questions before ordering; the atelier confirms making details after payment.

## Wedding guest checklist

- Confirm the dress code, aso ebi and venue.
- Choose an agbada for grand formality or a kaftan for a sleek ceremonial line.
- Try your full look with footwear before the event.
- Keep accessories purposeful and respectful of the couple’s palette.
- Leave time for fit questions and atelier confirmation.

## FAQ

### Can a guest wear an agbada to a Nigerian wedding?

Yes, when it suits the formality of the event and does not conflict with the couple’s stated dress direction. A kaftan can be a more understated alternative.

### Should I wear aso ebi?

If the couple asks guests to wear aso ebi, follow their instructions on fabric, colour and styling. If you are unsure, ask the hosts rather than guessing.

### What should I wear to a daytime Nigerian wedding?

Start with the invitation. A well-fitted kaftan, refined two-piece or lighter formal look may suit daytime celebrations, while an agbada remains appropriate for a more ceremonial setting.

### How do I choose a size online?

Compare the published size guide with a garment that fits you well and ask a stylist if you are between sizes. Custom sizing requires a conversation with the atelier about the measurements needed for the piece.

For practical ordering guidance, read [How to Buy Luxury Nigerian Menswear Online](/journal/${buyingSlug}).`,
    coverImageUrl: "/images/soso/agbada.jpg",
    coverImageAlt: "Black SOSO agbada styled for a formal Nigerian wedding",
    authorName: "SOSO Africa Editorial",
    category: "Occasion Style",
    tags: ["Nigerian wedding style", "Agbada", "Kaftan", "Wedding guest style", "Menswear"],
    seoTitle: "What to Wear to a Nigerian Wedding | Agbada & Kaftan Guide",
    seoDescription: "A practical Nigerian wedding style guide for guests: choose an agbada, kaftan or refined set, get the fit right and follow aso ebi direction.",
    readTimeMinutes: 6,
    relatedProductSlugs: ["sovereign-agbada", "ivory-kaftan", "twin-set"],
  },
  {
    slug: buyingSlug,
    title: "How to Buy Luxury Nigerian Menswear Online: Fit, Measurements, Fabric & International Delivery",
    excerpt: "Buy made-to-order Nigerian menswear with more confidence: understand fit, measurements, fabric questions and what to confirm before an international order.",
    body: `## Begin with fit, not a label

Buying luxury Nigerian menswear online works best when you begin with the silhouette and the measurements behind it. Choose a piece that suits your occasion, then use its size guide as a starting point rather than assuming your usual label will translate across every cut. Compare the guide with a garment you already own and wear comfortably.

For a kaftan, consider shoulder comfort, chest ease and finished length. For an agbada, account for the inner layers as well as the outer robe. If you are between sizes, prefer a closer or more relaxed fit, or have a significant event in mind, ask a SOSO stylist before ordering.

## Prepare useful measurements

Have your height, chest, waist, hips, shoulder and sleeve measurements available if requested. Measure over light clothing, keep the tape level and do not pull it tight. A stylist may need additional measurements for a specific piece. Custom sizing is a conversation with the atelier, not an automatic promise that every preference can be accommodated.

## Ask clear fabric and finish questions

Product pages describe the current piece, but fabric can affect weight, drape, warmth and care. Ask about the fabric shown, the occasion you are dressing for and any finish preference before purchase if those details matter to you. Do not assume that a screen colour or a fabric name alone tells you how a garment will feel in person.

## Ordering from outside Nigeria

International customers should contact the SOSO atelier or a stylist before ordering to confirm whether the destination can be served, the current production and delivery timing, shipping cost, and any destination-specific duties or taxes. These details vary by order and destination. Do not rely on a general article for a delivery date, worldwide availability, import charges or payment options.

Made-to-order garments also need time for the atelier to confirm details. Share your event date early, but wait for the atelier’s confirmation before treating any timing as committed.

## A confident online-order checklist

- Select the piece for your occasion and compare the size guide with a garment you own.
- Tell the stylist if you are between sizes or want Custom sizing.
- Ask the questions that affect your decision: fit, fabric, finish and care.
- For international orders, confirm destination, timing, shipping cost and duties or taxes with the atelier before ordering.
- Keep a record of the details you have agreed with the atelier.

## FAQ

### Is a standard size enough for made-to-order menswear?

It can be a useful option when your measurements align with the product guide. If they do not, ask a stylist about fit and Custom sizing before ordering.

### Which measurements should I send?

Only send the measurements requested for your selected piece. Height, chest, waist, hips, shoulder and sleeve are useful starting points, but the atelier may need more context.

### Does SOSO deliver internationally?

Ask the atelier or a SOSO stylist to confirm your destination before ordering. Availability, timing, shipping cost, duties and taxes must be confirmed for the specific destination and order.

### Can I rely on an estimated delivery date for an event?

No. Confirm the current production and delivery timing with the atelier before ordering, especially when your event date is fixed.

Choosing an outfit for a celebration? Read [What to Wear to a Nigerian Wedding](/journal/${weddingSlug}).`,
    coverImageUrl: "/images/soso/kaftan-white.jpg",
    coverImageAlt: "Ivory SOSO kaftan for a formal occasion",
    authorName: "SOSO Africa Editorial",
    category: "Buying Guide",
    tags: ["Luxury Nigerian menswear", "Online menswear", "Made to order", "Measurements", "International orders"],
    seoTitle: "Buy Luxury Nigerian Menswear Online | Fit & International Guide",
    seoDescription: "Learn how to buy luxury Nigerian menswear online: compare fit and measurements, ask fabric questions and confirm international delivery details first.",
    readTimeMinutes: 7,
    relatedProductSlugs: ["vault", "ivory-kaftan", "sovereign-agbada"],
  },
];

export const JOURNAL_LAUNCH_POSTS = posts;

async function verifyCoverImages() {
  for (const post of posts) {
    const path = resolve(workspaceRoot, "artifacts/soso-store/public", post.coverImageUrl.slice(1));
    const [metadata, bytes] = await Promise.all([stat(path), readFile(path)]);
    if (metadata.size < 1 || metadata.size > 12 * 1024 * 1024 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
      throw new Error(`Journal seed cover did not pass bundled-image checks: ${post.coverImageUrl}`);
    }
  }
}

export async function seedSosoJournalLaunch({ databaseUrl, schema } = {}) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required to seed SOSO launch Journal articles");
  await verifyCoverImages();
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    if (schema) {
      await client.query(`SET LOCAL search_path TO ${quoteIdentifier(schema)}, pg_catalog`);
    }
    await client.query("SELECT pg_advisory_xact_lock(hashtext('soso-journal-launch-seed-v1'))");
    const existingResult = await client.query(
      "SELECT id, slug, status, published_at FROM soso_journal_posts WHERE slug = ANY($1::text[])",
      [posts.map((post) => post.slug)],
    );
    const existing = new Map(existingResult.rows.map((row) => [row.slug, row]));
    const created = [];
    for (const definition of posts) {
      if (existing.has(definition.slug)) continue;
      const publishedAt = new Date();
      const result = await client.query(`
        INSERT INTO soso_journal_posts
          (slug, title, excerpt, body, cover_image_url, cover_image_alt, author_name, category, tags, seo_title, seo_description, read_time_minutes, related_product_slugs, related_article_slugs, status, published_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13::jsonb,$14::jsonb,'published',$15)
        RETURNING id`,
        [
          definition.slug, definition.title, definition.excerpt, definition.body,
          definition.coverImageUrl, definition.coverImageAlt, definition.authorName,
          definition.category, JSON.stringify(definition.tags), definition.seoTitle,
          definition.seoDescription, definition.readTimeMinutes,
          JSON.stringify(definition.relatedProductSlugs), JSON.stringify([]), publishedAt,
        ],
      );
      const post = { ...definition, relatedArticleSlugs: [], status: "published", publishedAt };
      created.push({ ...post, id: result.rows[0].id });
      existing.set(post.slug, {
        id: result.rows[0].id,
        slug: post.slug,
        status: "published",
        published_at: publishedAt,
      });
    }
    for (const post of created) {
      const otherSlug = post.slug === weddingSlug ? buyingSlug : weddingSlug;
      const related = existing.get(otherSlug);
      if (related?.status === "published" && related.published_at) {
        post.relatedArticleSlugs = [otherSlug];
        await client.query("UPDATE soso_journal_posts SET related_article_slugs = $1::jsonb WHERE id = $2", [JSON.stringify(post.relatedArticleSlugs), post.id]);
      }
      const contentHash = hash(post);
      const revision = await client.query(
        "INSERT INTO soso_journal_post_revisions (journal_post_id, snapshot, content_hash, created_by_clerk_user_id) VALUES ($1,$2::jsonb,$3,$4) RETURNING id",
        [post.id, JSON.stringify(snapshot(post)), contentHash, JOURNAL_SEED_ACTOR],
      );
      await client.query(
        "INSERT INTO soso_audit_logs (actor_clerk_user_id, action, entity_type, entity_id, metadata) VALUES ($1,'journal.created','journal_post',$2,$3::jsonb)",
        [JOURNAL_SEED_ACTOR, post.id, JSON.stringify({ slug: post.slug, status: post.status, contentHash, revisionId: revision.rows[0].id, source: "launch_journal_seed_v1" })],
      );
    }
    await client.query("COMMIT");
    return { createdSlugs: created.map((post) => post.slug), skippedSlugs: posts.filter((post) => !created.some((createdPost) => createdPost.slug === post.slug)).map((post) => post.slug) };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await seedSosoJournalLaunch({ databaseUrl: process.env.DATABASE_URL });
  process.stdout.write(`Created: ${result.createdSlugs.join(", ") || "none"}; skipped: ${result.skippedSlugs.join(", ") || "none"}\n`);
}