import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import pg from "pg";

export const POLICY_SEED_ACTOR = "system:policy-seed-v1";

export const policies = [
  {
    slug: "privacy",
    title: "Privacy & cookie notice",
    summary: "How SOSO Africa handles information used for orders, customer support, storefront operation, privacy choices and consent-based measurement.",
    sections: [
      {
        id: "information-we-receive",
        heading: "Information we receive",
        bullets: [
          "Contact details and messages you provide when you ask for stylist help, place an order or contact customer support.",
          "Order details, selected products, sizing choices, delivery information and fitting or measurement details you choose to provide.",
          "Payment status and transaction references returned by the checkout provider. SOSO does not ask you to send full payment-card credentials by chat.",
          "Necessary technical information used to operate and protect the storefront, plus limited measurement or marketing events only when the relevant consent is active.",
        ],
      },
      {
        id: "how-we-use-information",
        heading: "How we use information",
        bullets: [
          "To answer enquiries and provide optional stylist support.",
          "To create, confirm, make, deliver and support an order.",
          "To process payment through the checkout provider and maintain transaction and customer-service records.",
          "To secure the storefront, prevent misuse, meet applicable record-keeping duties and understand storefront performance where consent is required.",
        ],
      },
      {
        id: "cookies",
        heading: "Cookies and privacy choices",
        paragraphs: [
          "Necessary browser storage keeps your shopping bag, session and privacy choice working. It remains active because the storefront cannot provide those functions without it.",
          "Optional measurement and marketing technologies remain off unless you grant the relevant consent. You can change your choice at any time through Cookie choices in the footer.",
        ],
      },
      {
        id: "sharing-and-providers",
        heading: "Service providers and sharing",
        paragraphs: [
          "SOSO may share only the information needed with providers that support hosting, checkout, payment, communications, delivery, security and storefront operations. These providers process information for the service they supply and under their own applicable terms.",
          "SOSO does not publish customer information or sell it as a product. Information may also be disclosed where required by law or needed to protect customers, SOSO or the integrity of the service.",
        ],
      },
      {
        id: "retention-and-security",
        heading: "Retention and security",
        paragraphs: [
          "Information is kept only for as long as reasonably needed for the purpose for which it was collected, including order support, legal, accounting, fraud-prevention and dispute records. Different records may require different retention periods.",
          "SOSO uses reasonable technical and organisational safeguards, but no online service can promise absolute security. Please do not send payment-card credentials or other unnecessary sensitive information through messages.",
        ],
      },
      {
        id: "your-choices",
        heading: "Your choices and requests",
        paragraphs: [
          "You may request access to or deletion of personal information through the privacy request form on this page. SOSO will verify identity before acting on a request and may retain information where applicable law or a legitimate record-keeping need requires it.",
          "You can withdraw optional measurement or marketing consent through Cookie choices. Withdrawing consent does not affect processing that occurred before the change.",
        ],
      },
      {
        id: "updates",
        heading: "Updates to this notice",
        paragraphs: [
          "SOSO may update this notice as the storefront, providers or legal requirements change. The effective version and version number shown on this page identify the notice currently published.",
        ],
      },
    ],
  },
  {
    slug: "terms",
    title: "Storefront terms",
    summary: "The terms that apply when you browse the SOSO Africa storefront, request support or place an order.",
    sections: [
      {
        id: "using-the-storefront",
        heading: "Using the storefront",
        paragraphs: [
          "Use the storefront lawfully and provide accurate information when placing an order or requesting support. Do not interfere with the service, attempt unauthorised access, submit fraudulent orders or misuse SOSO content.",
          "Product photography, descriptions and sizing guidance help you make a selection, but colours and details may vary with screens, fabric batches and hand finishing.",
        ],
      },
      {
        id: "orders-and-availability",
        heading: "Orders and availability",
        paragraphs: [
          "Adding an item to the bag does not reserve it. An order is subject to product availability, payment authorisation and the confirmations shown during checkout and after payment.",
          "If SOSO cannot fulfil an accepted order, SOSO will contact you using the details supplied and explain the available resolution.",
        ],
      },
      {
        id: "pricing-and-payment",
        heading: "Pricing and payment",
        paragraphs: [
          "The price, currency, delivery charge and final order total presented by the approved checkout flow control the payment you authorise. Do not rely on a currency or delivery option that is not presented for your order.",
          "Payment is processed by the checkout provider displayed during checkout. Additional bank, card or currency-conversion charges imposed by your own provider are outside SOSO’s control.",
        ],
      },
      {
        id: "made-to-order",
        heading: "Made-to-order and custom details",
        paragraphs: [
          "Many SOSO pieces are made or finished for the customer. After payment, the atelier confirms the selected size, fabric or finish direction and production timing. Optional stylist guidance does not replace the customer’s responsibility to review and confirm order details.",
          "Where custom measurements or approvals are required, production may depend on receiving complete and accurate information from you.",
        ],
      },
      {
        id: "delivery-returns",
        heading: "Delivery, changes and returns",
        paragraphs: [
          "Delivery estimates, address requirements, cancellations, alterations, returns and refunds are governed by the current Delivery, returns & refunds policy and by any rights that applicable law does not allow these terms to exclude.",
        ],
      },
      {
        id: "intellectual-property",
        heading: "SOSO content and intellectual property",
        paragraphs: [
          "The storefront design, photography, product names, editorial content and other SOSO materials are protected content. You may view them for personal shopping purposes but may not copy, republish, sell or commercially exploit them without permission.",
        ],
      },
      {
        id: "responsibility",
        heading: "Responsibility",
        paragraphs: [
          "SOSO is responsible for obligations that cannot lawfully be excluded. To the extent permitted by applicable law, SOSO is not responsible for losses caused by misuse of the storefront, inaccurate information supplied by a customer, or events outside reasonable control.",
          "Nothing in these terms removes mandatory consumer rights or limits liability where doing so would be unlawful.",
        ],
      },
      {
        id: "changes",
        heading: "Changes to these terms",
        paragraphs: [
          "The version effective when you place an order applies to that order unless a change is required by law or agreed with you. The effective version and version number are shown on this page.",
        ],
      },
    ],
  },
  {
    slug: "delivery-returns",
    title: "Delivery, returns & refunds",
    summary: "How SOSO Africa confirms production and delivery, and how to raise cancellation, alteration, return or refund requests.",
    sections: [
      {
        id: "production-confirmation",
        heading: "Production confirmation",
        paragraphs: [
          "SOSO uses payment-first checkout. After payment, the atelier confirms the selected size, fabric or finish direction and the production timing for the order.",
          "A timeframe is not final until it is confirmed for your specific order. Respond promptly if the atelier needs measurements or another approval, because production may pause until the required information is received.",
        ],
      },
      {
        id: "delivery",
        heading: "Delivery",
        paragraphs: [
          "Available delivery destinations, charges and order totals are presented through the approved checkout flow. A destination or option not offered during checkout should not be assumed to be available.",
          "Provide a complete delivery address and reachable contact details. Contact SOSO promptly if an address needs correction; a change may not be possible after dispatch and may create an additional charge.",
        ],
      },
      {
        id: "receiving-an-order",
        heading: "Receiving and inspecting an order",
        paragraphs: [
          "Inspect the package and garment as soon as reasonably possible after delivery. If an item appears damaged, incorrect or materially different from the confirmed order, contact SOSO promptly with the order reference, a description and clear photographs where helpful.",
          "Do not wear, wash, alter or repair a disputed item before SOSO has advised the next step, except where necessary to prevent further damage.",
        ],
      },
      {
        id: "made-to-order-returns",
        heading: "Made-to-order returns and alterations",
        paragraphs: [
          "A made-to-order or personalised piece may have limited change-of-mind return options once production has started. This does not remove rights that applicable law gives you for faulty, damaged, misdescribed or incorrectly supplied goods.",
          "Where an alteration is the appropriate resolution, SOSO will explain the next steps after reviewing the order details and the issue reported.",
        ],
      },
      {
        id: "cancellations",
        heading: "Cancellations",
        paragraphs: [
          "Send a cancellation request through an approved SOSO support channel as soon as possible. Whether it can be accepted may depend on payment status, whether atelier work has started and any rights available under applicable law.",
        ],
      },
      {
        id: "refunds",
        heading: "Refunds",
        paragraphs: [
          "If a refund is approved, SOSO will confirm the amount, method and next steps. Processing time may also depend on the checkout, payment and banking providers involved.",
          "Any treatment of delivery charges or permitted deductions will be explained for the specific request and will remain subject to mandatory customer rights.",
        ],
      },
      {
        id: "support",
        heading: "How to request support",
        paragraphs: [
          "Use the stylist or customer-support link shown on the storefront and include the order reference. SOSO may ask for photographs, measurements or other information reasonably needed to review the request.",
        ],
      },
    ],
  },
  {
    slug: "care",
    title: "Garment care",
    summary: "General handling, cleaning and storage guidance for SOSO garments, subject to the care instructions supplied with each piece.",
    sections: [
      {
        id: "care-label",
        heading: "Follow the garment instructions",
        paragraphs: [
          "The care label and any instructions supplied with your garment control. Fabrics, linings, embroidery, embellishment and structured finishing can require different treatment, so ask SOSO before cleaning if anything is unclear.",
        ],
      },
      {
        id: "cleaning",
        heading: "Cleaning and pressing",
        bullets: [
          "Do not assume that a richly coloured, embroidered, embellished or structured piece can be machine washed.",
          "Use a qualified cleaner when the care label or atelier recommends it.",
          "Avoid harsh stain treatments, direct high heat and untested pressing methods.",
          "Empty pockets and secure detachable or delicate elements before cleaning where the garment instructions permit.",
        ],
      },
      {
        id: "storage",
        heading: "Handling and storage",
        bullets: [
          "Allow the garment to air after wear and store it clean and dry, away from direct sunlight.",
          "Use a suitable hanger for structured pieces and avoid hanging heavy embellishment from a weak point.",
          "Keep light and dark garments separate when damp, and protect the piece from moisture, heat and fragrance overspray.",
        ],
      },
      {
        id: "support",
        heading: "Care questions",
        paragraphs: [
          "Use the stylist or customer-support link on the storefront if you need garment-specific care guidance. Include the product or order reference where available.",
        ],
      },
    ],
  },
];

function quoteIdentifier(identifier) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) throw new Error("Invalid PostgreSQL identifier");
  return `"${identifier.replaceAll('"', '""')}"`;
}

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function seedSosoPolicies({ databaseUrl, schema } = {}) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required to seed SOSO policies");
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    if (schema) await client.query(`SET LOCAL search_path TO ${quoteIdentifier(schema)}, pg_catalog`);
    await client.query("SELECT pg_advisory_xact_lock(hashtext('soso-policy-seed-v1'))");
    const existingResult = await client.query(
      "SELECT slug FROM soso_policy_documents WHERE slug = ANY($1::text[])",
      [policies.map((policy) => policy.slug)],
    );
    const existing = new Set(existingResult.rows.map((row) => row.slug));
    const createdSlugs = [];
    const effectiveAt = new Date();

    for (const policy of policies) {
      if (existing.has(policy.slug)) continue;
      const result = await client.query(
        `INSERT INTO soso_policy_documents
          (slug, title, summary, sections, version, status, reviewed_by_clerk_user_id, reviewed_at,
           approved_by_clerk_user_id, approved_at, effective_at, published_at, created_by_clerk_user_id)
         VALUES ($1,$2,$3,$4::jsonb,1,'published',$5,$6,$5,$6,$6,$6,$5)
         RETURNING id, created_at, updated_at`,
        [policy.slug, policy.title, policy.summary, JSON.stringify(policy.sections), POLICY_SEED_ACTOR, effectiveAt],
      );
      const row = result.rows[0];
      const snapshot = {
        ...policy,
        id: row.id,
        version: 1,
        status: "published",
        reviewedByClerkUserId: POLICY_SEED_ACTOR,
        reviewedAt: effectiveAt,
        approvedByClerkUserId: POLICY_SEED_ACTOR,
        approvedAt: effectiveAt,
        effectiveAt,
        publishedAt: effectiveAt,
        createdByClerkUserId: POLICY_SEED_ACTOR,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
      const revision = await client.query(
        "INSERT INTO soso_policy_document_revisions (policy_document_id, snapshot, created_by_clerk_user_id) VALUES ($1,$2::jsonb,$3) RETURNING id",
        [row.id, JSON.stringify(snapshot), POLICY_SEED_ACTOR],
      );
      await client.query(
        "INSERT INTO soso_audit_logs (actor_clerk_user_id, action, entity_type, entity_id, metadata) VALUES ($1,'policy.published','policy_document',$2,$3::jsonb)",
        [POLICY_SEED_ACTOR, row.id, JSON.stringify({ slug: policy.slug, version: 1, contentHash: hash(policy), revisionId: revision.rows[0].id, source: "approved_policy_seed_v1" })],
      );
      createdSlugs.push(policy.slug);
    }

    await client.query("COMMIT");
    return {
      createdSlugs,
      skippedSlugs: policies.filter((policy) => !createdSlugs.includes(policy.slug)).map((policy) => policy.slug),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await seedSosoPolicies({ databaseUrl: process.env.DATABASE_URL });
  process.stdout.write(`Created: ${result.createdSlugs.join(", ") || "none"}; skipped: ${result.skippedSlugs.join(", ") || "none"}\n`);
}