import test from "node:test";
import assert from "node:assert/strict";
import { renderOffer, renderCollectionLinks, renderProductDetails, renderProductList } from "./seo-catalog-content.mjs";

const product = {
  slug: "ivory-kaftan", name: "Ivory & Pearl", description: "Approved description.",
  colour: "Ivory", fabric: "Cotton", fit: "Regular", standardEligible: true,
  standardSizes: ["S", "M"], customEligible: true, fulfilmentState: "made_immediately",
  composition: "Published composition.", care: "Published care.",
  delivery: "Published delivery.", returns: "Published returns.",
  dispatchMessage: "Timing confirmed by the atelier.",
};
const offer = { "@type": "AggregateOffer", lowPrice: 125000, highPrice: 150000 };

test("crawler product details include approved facts, policies, sizes, range and normal collection links", () => {
  const html = renderProductDetails(product, {
    offer,
    collections: [{ slug: "kaftans", label: "Kaftans" }],
    copy: { fabricLabel: "Material" },
  });
  for (const value of ["Approved description.", "Ivory", "Cotton", "Regular", "S, M, Custom",
    "Published composition.", "Published care.", "Published delivery.", "Published returns.",
    "Timing confirmed by the atelier.", "125,000", "150,000", "<dt>Material</dt>"]) assert.ok(html.includes(value), value);
  assert.match(html, /<a href="\/collections\/kaftans">Kaftans<\/a>/);
  assert.match(html, /<a href="\/shop">/);
});

test("browse-only pages and lists never invent a price without an authoritative offer", () => {
  const placeholder = { ...product, price: 999999, fulfilmentState: "unavailable", unavailableMessage: "Coming soon" };
  const html = renderProductDetails(placeholder);
  assert.match(html, /Coming soon/);
  assert.doesNotMatch(html, /999|Timing confirmed/);
  assert.doesNotMatch(renderProductList([placeholder], () => undefined), /999/);
  assert.equal(renderOffer(undefined), "");
  assert.equal(renderOffer({ "@type": "Offer", price: NaN }), "");
  assert.equal(renderOffer({ "@type": "AggregateOffer", lowPrice: 5, highPrice: 2 }), "");
});

test("crawler text and link attributes are escaped, and missing facts are not invented", () => {
  const html = renderProductDetails({
    slug: "test", description: '<script>alert("bad")</script>', fabric: '" onclick="bad()',
  });
  assert.doesNotMatch(html, /<script>|<dt>Sizes<\/dt>|<h2>Delivery<\/h2>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&quot; onclick=&quot;/);
  const listing = renderProductList([{ ...product, name: "<img onerror=bad()>" }], () => undefined);
  assert.match(listing, /&lt;img onerror=bad\(\)&gt;/);
  assert.doesNotMatch(listing, /<img/);
  assert.equal(renderProductList([], () => undefined), "");
  assert.equal(renderCollectionLinks([]), "");
});

test("published generic detail sections are used only as the storefront uses them", () => {
  const copy = { details: [{ title: "Details", body: "Approved general care." }],
    assurances: [{ title: "Ordering", body: "Approved ordering guidance." }] };
  const html = renderProductDetails({ description: "A piece." }, { copy });
  assert.match(html, /Approved general care/);
  assert.match(html, /Approved ordering guidance/);
  const specific = renderProductDetails(product, { copy });
  assert.doesNotMatch(specific, /Approved general care|Approved ordering guidance/);
});
