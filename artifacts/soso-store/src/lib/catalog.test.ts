import test from "node:test";
import assert from "node:assert/strict";
import { filterAndSortProducts } from "./catalog";
import type { CatalogProduct } from "@/data/platformContent";

const mockProducts: CatalogProduct[] = [
  {
    slug: "suit-1",
    name: "Classic Suit",
    description: "A classic suit",
    category: "Suits",
    fulfilmentState: "ready_now",
    price: 150000,
    merchandising: { isNew: true, sortPriority: 10 },
    img: "",
    tag: "",
    note: "",
    sizes: [],
    standardEligible: true,
    customEligible: true,
    standardSizes: [],
    readyNowSizes: [],
    colour: "Black",
    fabric: "Wool",
    fit: "Tailored",
    searchableTerms: [],
    dispatchMessage: ""
  },
  {
    slug: "shirt-1",
    name: "Linen Shirt",
    description: "Breathable linen shirt",
    category: "Shirts",
    fulfilmentState: "made_immediately",
    price: 50000,
    merchandising: { isNew: false, sortPriority: 5 },
    img: "",
    tag: "",
    note: "",
    sizes: [],
    standardEligible: true,
    customEligible: false,
    standardSizes: ["M", "L"],
    readyNowSizes: [],
    colour: "Ivory",
    fabric: "Linen",
    fit: "Relaxed",
    searchableTerms: ["summer"],
    dispatchMessage: ""
  },
  {
    slug: "trousers-1",
    name: "Wool Trousers",
    description: "Warm trousers",
    category: "Trousers",
    fulfilmentState: "ready_now",
    price: 80000,
    merchandising: { isNew: false, sortPriority: 20 },
    img: "",
    tag: "",
    note: "",
    sizes: [],
    standardEligible: true,
    customEligible: true,
    standardSizes: ["S", "M"],
    readyNowSizes: [],
    colour: "Black",
    fabric: "Wool",
    fit: "Regular",
    searchableTerms: [],
    dispatchMessage: ""
  }
];

test("filterAndSortProducts", async (t) => {
  await t.test("filters by category", () => {
    const result = filterAndSortProducts(mockProducts, { category: "Suits" });
    assert.equal(result.length, 1);
    assert.equal(result[0].slug, "suit-1");
  });

  await t.test("filters by fulfillment state", () => {
    const result = filterAndSortProducts(mockProducts, { fulfillment: "made_immediately" });
    assert.equal(result.length, 1);
    assert.equal(result[0].slug, "shirt-1");
  });

  await t.test("filters by search query including search terms", () => {
    const result = filterAndSortProducts(mockProducts, { searchQuery: "summer" });
    assert.equal(result.length, 1);
    assert.equal(result[0].slug, "shirt-1");
  });

  await t.test("filters by Standard size and Custom eligibility", () => {
    assert.deepEqual(
      filterAndSortProducts(mockProducts, { size: "S" }).map((product) => product.slug),
      ["trousers-1"],
    );
    assert.deepEqual(
      filterAndSortProducts(mockProducts, { size: "Custom" }).map((product) => product.slug),
      ["trousers-1", "suit-1"],
    );
  });

  await t.test("filters by colour and inclusive price range", () => {
    assert.deepEqual(
      filterAndSortProducts(mockProducts, { colour: "Black", minPrice: 90000, maxPrice: 160000 })
        .map((product) => product.slug),
      ["suit-1"],
    );
  });

  await t.test("sorts by price ascending", () => {
    const result = filterAndSortProducts(mockProducts, { sort: "price_asc" });
    assert.equal(result[0].slug, "shirt-1"); // 50000
    assert.equal(result[1].slug, "trousers-1"); // 80000
    assert.equal(result[2].slug, "suit-1"); // 150000
  });

  await t.test("sorts by governed merchandising priority by default", () => {
    const result = filterAndSortProducts(mockProducts, { sort: "featured" });
    assert.equal(result[0].slug, "trousers-1"); // rank 20
    assert.equal(result[1].slug, "suit-1"); // rank 10
    assert.equal(result[2].slug, "shirt-1"); // rank 5
  });
});