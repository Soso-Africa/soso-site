import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { JusticeSureCatalogProduct } from "../lib/justicesureCommerce";
import { validateCurrentCommerceMappings } from "./staff-content";

function mappedProduct() {
  return {
    slug: "sample-shirt",
    name: "Sample Shirt",
    price: 150,
    standardEligible: true,
    customEligible: false,
    standardSizes: ["M"],
    fulfilmentState: "ready_now" as const,
    commerceProductId: randomUUID(),
    commerceVariantIds: { M: randomUUID() },
  };
}

function matchingCatalogue(product: ReturnType<typeof mappedProduct>): JusticeSureCatalogProduct[] {
  return [{
    id: product.commerceProductId!,
    name: product.name,
    description: null,
    images: [],
    currency: "NGN",
    amountKobo: 15_000,
    inStock: true,
    variants: [{
      id: product.commerceVariantIds!.M!,
      name: "Medium",
      label: "Medium",
      attributes: { size: "M" },
      amountKobo: 15_000,
      inStock: true,
    }],
  }];
}

test("draft mapping validation accepts structurally valid identifiers without contacting JusticeSure", async () => {
  const product = mappedProduct();
  let providerCalls = 0;

  const issues = await validateCurrentCommerceMappings([product], false, async () => {
    providerCalls += 1;
    throw new Error("JusticeSure unavailable");
  });

  assert.deepEqual(issues, []);

  const duplicate = { ...product, slug: "another-shirt" };
  const duplicateIssues = await validateCurrentCommerceMappings([product, duplicate], false, async () => {
    providerCalls += 1;
    throw new Error("JusticeSure unavailable");
  });
  assert.ok(duplicateIssues.some((issue) => issue.includes("is already assigned to sample-shirt")));
  assert.equal(providerCalls, 0);
});

test("publication validation fetches live catalogue and fails closed when JusticeSure is unavailable", async () => {
  const product = mappedProduct();
  let providerCalls = 0;

  await assert.rejects(
    validateCurrentCommerceMappings([product], true, async () => {
      providerCalls += 1;
      throw new Error("JusticeSure unavailable");
    }),
    /JusticeSure unavailable/,
  );

  assert.equal(providerCalls, 1);
});

test("publication validation rejects unsafe live mappings and mappings without confirmation", async () => {
  const product = mappedProduct();
  const mismatchedCatalogue = matchingCatalogue(product);
  mismatchedCatalogue[0]!.name = "Different Shirt";

  const unsafeIssues = await validateCurrentCommerceMappings(
    [product],
    true,
    async () => mismatchedCatalogue,
  );
  assert.ok(unsafeIssues.some((issue) => issue.includes("different normalized name")));

  const unconfirmedIssues = await validateCurrentCommerceMappings(
    [product],
    true,
    async () => matchingCatalogue(product),
  );
  assert.ok(unconfirmedIssues.some((issue) => issue.includes("confirm the current high-confidence JusticeSure mapping")));
});