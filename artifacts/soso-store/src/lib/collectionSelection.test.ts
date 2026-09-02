import assert from "node:assert/strict";
import test from "node:test";
import { selectCollectionProducts } from "./collectionSelection";

test("new arrivals selects only available new products in merchandising order", () => {
  const products = [
    { slug: "later", fulfilmentState: "made_immediately", merchandising: { isNew: true, sortPriority: 20 } },
    { slug: "first", fulfilmentState: "ready_now", merchandising: { isNew: true, sortPriority: 10 } },
    { slug: "retired", fulfilmentState: "unavailable", merchandising: { isNew: true, sortPriority: 1 } },
    { slug: "old", fulfilmentState: "ready_now", merchandising: { isNew: false, sortPriority: 0 } },
  ] as any[];
  assert.deepEqual(selectCollectionProducts({ slug: "new-arrivals", department: "men", category: "New Arrivals" }, products).map((item) => item.slug), ["first", "later"]);
});