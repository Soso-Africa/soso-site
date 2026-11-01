import { escapeHtml } from "./seo-public-content.mjs";

const text = (value) => typeof value === "string" ? value.trim() : "";
const paragraph = (value) => text(value) ? `<p>${escapeHtml(value).replace(/\n/g, "<br>")}</p>` : "";
const money = (value) => new Intl.NumberFormat("en-NG", {
  style: "currency", currency: "NGN", maximumFractionDigits: 2,
}).format(value);

// The caller supplies the SAME offer used by the storefront's Product schema.
// No offer means no price, including for browse-only accessory placeholders.
export function renderOffer(offer) {
  if (!offer) return "";
  const low = offer["@type"] === "AggregateOffer" ? offer.lowPrice : offer.price;
  const high = offer["@type"] === "AggregateOffer" ? offer.highPrice : offer.price;
  if (!Number.isFinite(low) || !Number.isFinite(high) || low < 0 || high < low) return "";
  return paragraph(low === high ? money(low) : `${money(low)} – ${money(high)}`);
}

export function renderCollectionLinks(collections) {
  if (!collections.length) return "";
  return `<section><h2>Collections</h2><ul>${collections.map((collection) =>
    `<li><a href="/collections/${escapeHtml(collection.slug)}">${escapeHtml(collection.label || collection.h1)}</a></li>`,
  ).join("")}</ul></section>`;
}

export function renderProductList(products, offerFor, heading = "Products") {
  if (!products.length) return "";
  return `<section><h2>${escapeHtml(heading)}</h2><ul>${products.map((product) =>
    `<li><h3><a href="/product/${escapeHtml(product.slug)}">${escapeHtml(product.name)}</a></h3>${paragraph(product.description)}${renderOffer(offerFor(product))}</li>`,
  ).join("")}</ul></section>`;
}

export function renderProductDetails(product, { copy = {}, offer, collections = [] } = {}) {
  const sizes = [
    ...(product.standardEligible ? product.standardSizes || [] : []),
    ...(product.customEligible ? ["Custom"] : []),
  ];
  const fields = [
    [copy.colourLabel || "Colour", product.colour],
    [copy.fabricLabel || "Fabric", product.fabric],
    [copy.fitLabel || "Fit", product.fit],
    ["Sizes", sizes.join(", ")],
  ].filter(([, value]) => text(value));
  const details = product.composition || product.care
    ? [
        { title: copy.compositionLabel || "Composition", body: product.composition },
        { title: copy.careLabel || "Care", body: product.care },
      ]
    : copy.details || [];
  const assurances = product.delivery || product.returns
    ? [
        { title: copy.deliveryLabel || "Delivery", body: product.delivery },
        { title: copy.returnsLabel || "Returns", body: product.returns },
      ]
    : copy.assurances || [];
  const sections = [...details, ...assurances].filter((item) => text(item.body))
    .map((item) => `<section><h2>${escapeHtml(item.title)}</h2>${paragraph(item.body)}</section>`).join("");
  const availability = product.fulfilmentState === "unavailable"
    ? product.unavailableMessage || copy.unavailableLabel || "Unavailable"
    : offer ? product.dispatchMessage : "";
  return `<article>${paragraph(product.description)}${renderOffer(offer)}${paragraph(availability)}${fields.length ? `<dl>${fields.map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`).join("")}</dl>` : ""}${sections}</article>${renderCollectionLinks(collections)}<p><a href="/shop">Browse all products</a></p>`;
}
