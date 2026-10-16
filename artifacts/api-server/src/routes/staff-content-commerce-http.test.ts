import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express, { type Request } from "express";
import test from "node:test";
import { JusticeSureCommerceClient, JusticeSureConfigurationError, type JusticeSureCatalogProduct } from "../lib/justicesureCommerce";
import { validateCurrentCommerceMappings, default as staffContentRouter } from "./staff-content";

const liveCataloguePath = "/tmp/soso-live-catalogue-current.json";

type CapturedCatalogue = {
  products: JusticeSureCatalogProduct[];
};

function loadCapturedCatalogue(): CapturedCatalogue {
  return JSON.parse(readFileSync(liveCataloguePath, "utf8")) as CapturedCatalogue;
}

function loadSavedDraftMappingProducts(): Array<Record<string, unknown>> {
  const payload = JSON.parse(readFileSync("/tmp/soso-real-draft-mapping-payload.json", "utf8")) as {
    products: Array<Record<string, unknown>>;
  };
  assert.equal(payload.products.length, 52);
  return payload.products;
}

function rawProviderProduct(product: JusticeSureCatalogProduct): Record<string, unknown> {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    images: product.images,
    price: { currency: product.currency, amountKobo: product.amountKobo },
    availability: { inStock: product.inStock },
    variants: product.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      attributes: variant.attributes,
      price: { amountKobo: variant.amountKobo },
      availability: { inStock: variant.inStock },
    })),
  };
}

async function listenWithStaffContext(
  role: NonNullable<Request["staff"]>["role"] = "owner",
): Promise<{ server: Server; baseUrl: string }> {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res, next) => {
    req.staff = { role } as NonNullable<Request["staff"]>;
    req.log = { warn() {}, error() {} } as unknown as typeof req.log;
    next();
  });
  app.use(staffContentRouter);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

async function requestPreview(baseUrl: string, body: unknown, fetcher = globalThis.fetch) {
  const response = await fetcher(`${baseUrl}/staff/commerce/catalogue-mapping/preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) as Record<string, any> : undefined };
}

async function requestStaffCatalogue(baseUrl: string, fetcher = globalThis.fetch) {
  const response = await fetcher(`${baseUrl}/staff/commerce/catalogue`);
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) as Record<string, any> : undefined };
}

function withJusticeSureTestConfiguration<T>(callback: () => Promise<T>): Promise<T> {
  const keys = [
    "NODE_ENV",
    "JUSTICESURE_COMMERCE_API_BASE_URL",
    "JUSTICESURE_COMMERCE_TEST_API_KEY",
    "JUSTICESURE_COMMERCE_API_KEY",
    "JUSTICESURE_COMMERCE_RUNTIME_READY",
    "JUSTICESURE_COMMERCE_TEST_WEBHOOK_SECRET",
    "JUSTICESURE_COMMERCE_WEBHOOK_SECRET",
    "SOSO_PAYMENT_RETURN_URL",
  ];
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  process.env.NODE_ENV = "test";
  process.env.JUSTICESURE_COMMERCE_API_BASE_URL = "https://commerce.test";
  process.env.JUSTICESURE_COMMERCE_TEST_API_KEY = "jsk_test_catalogue-read-only";
  process.env.JUSTICESURE_COMMERCE_RUNTIME_READY = "false";
  delete process.env.JUSTICESURE_COMMERCE_API_KEY;
  delete process.env.JUSTICESURE_COMMERCE_TEST_WEBHOOK_SECRET;
  delete process.env.JUSTICESURE_COMMERCE_WEBHOOK_SECRET;
  delete process.env.SOSO_PAYMENT_RETURN_URL;
  return callback().finally(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test("Staff catalogue GET returns normalized products while checkout activation is disabled", async () => {
  await withJusticeSureTestConfiguration(async () => {
    const originalFetch = globalThis.fetch;
    const captured = loadCapturedCatalogue();
    assert.equal(captured.products.length, 138);
    const requests: Array<{ url: string; method: string }> = [];
    globalThis.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      requests.push({ url, method: init?.method ?? "GET" });
      return Response.json({ data: captured.products.map(rawProviderProduct) });
    };
    let server: Server | undefined;
    try {
      const running = await listenWithStaffContext("owner");
      server = running.server;
      const response = await requestStaffCatalogue(running.baseUrl, originalFetch);
      assert.equal(response.status, 200, JSON.stringify(response.body));
      assert.deepEqual(response.body, { products: captured.products });
      assert.deepEqual(requests.map(({ method }) => method), ["GET"]);
      assert.match(requests[0]!.url, /^https:\/\/commerce\.test\/products\?limit=100&offset=0$/);
    } finally {
      globalThis.fetch = originalFetch;
      if (server) {
        server.close();
        await once(server, "close");
      }
    }
  });
});

test("Staff catalogue GET denies roles outside the platform role policy", async () => {
  await withJusticeSureTestConfiguration(async () => {
    const originalFetch = globalThis.fetch;
    let fetchCount = 0;
    globalThis.fetch = async () => {
      fetchCount += 1;
      return Response.json({ data: [] });
    };
    let server: Server | undefined;
    try {
      const running = await listenWithStaffContext("operations");
      server = running.server;
      const response = await requestStaffCatalogue(running.baseUrl, originalFetch);
      assert.equal(response.status, 403);
      assert.equal(fetchCount, 0);
    } finally {
      globalThis.fetch = originalFetch;
      if (server) {
        server.close();
        await once(server, "close");
      }
    }
  });
});

test("real Staff catalogue-preview HTTP route reads the captured live catalogue before checkout activation", async () => {
  await withJusticeSureTestConfiguration(async () => {
    const originalFetch = globalThis.fetch;
    const captured = loadCapturedCatalogue();
    assert.equal(captured.products.length, 138);
    const requests: Array<{ url: string; method: string }> = [];
    globalThis.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = init?.method ?? "GET";
      requests.push({ url, method });
      return Response.json({ data: captured.products.map(rawProviderProduct) });
    };
    let server: Server | undefined;
    try {
      const running = await listenWithStaffContext();
      server = running.server;
      const matching = captured.products.find((product) => product.name === "Crest Ivory Two-Piece")!;
      const response = await requestPreview(running.baseUrl, {
        products: [{
          slug: "crest-ivory-two-piece",
          name: matching.name,
          price: matching.amountKobo / 100,
          standardEligible: true,
          customEligible: false,
          standardSizes: matching.variants.filter((variant) => variant.name !== "Custom").map((variant) => variant.name),
          fulfilmentState: "ready_now",
        }],
      }, originalFetch);
      assert.equal(response.status, 200, JSON.stringify(response.body));
      assert.equal(response.body!.suggestions.length, 1);
      assert.equal(response.body!.suggestions[0].status, "confident");
      assert.equal(response.body!.suggestions[0].confidence, 97);
      assert.equal(response.body!.suggestions[0].productId, matching.id);
      assert.ok(/^[a-f0-9]{64}$/.test(response.body!.snapshotHash));
      assert.deepEqual(requests.map(({ method }) => method), ["GET"]);
      assert.match(requests[0]!.url, /^https:\/\/commerce\.test\/products\?limit=100&offset=0$/);
    } finally {
      globalThis.fetch = originalFetch;
      if (server) {
        server.close();
        await once(server, "close");
      }
    }
  });
});

test("real Staff catalogue-preview HTTP route rechecks all mapped products from the saved production draft", async () => {
  await withJusticeSureTestConfiguration(async () => {
    const originalFetch = globalThis.fetch;
    const captured = loadCapturedCatalogue();
    const savedProducts = loadSavedDraftMappingProducts();
    const mappedSlugs = savedProducts
      .filter((product) => typeof product.commerceProductId === "string")
      .map((product) => String(product.slug));
    assert.equal(mappedSlugs.length, 7);
    globalThis.fetch = async () => Response.json({ data: captured.products.map(rawProviderProduct) });
    let server: Server | undefined;
    try {
      const running = await listenWithStaffContext();
      server = running.server;
      const response = await requestPreview(running.baseUrl, { products: savedProducts }, originalFetch);
      assert.equal(response.status, 200, JSON.stringify(response.body));
      assert.equal(response.body!.suggestions.length, 52);
      const mappedStatuses = Object.fromEntries(response.body!.suggestions
        .filter((suggestion: { slug: string }) => mappedSlugs.includes(suggestion.slug))
        .map((suggestion: { slug: string; status: string; confidence: number; issues: string[] }) => [
          suggestion.slug,
          suggestion.status,
        ]));
      assert.equal(Object.keys(mappedStatuses).length, 7);
      assert.deepEqual(mappedStatuses, {
        "minimal-cocoa": "confident",
        "panel-azure-danshiki": "confident",
        "kaftan-rtw-1": "blocked",
        "patch-taupe-kaftan": "blocked",
        "sovan-dress-shirt": "confident",
        "aurel-twopiece": "confident",
        "crest-ivory-two-piece": "confident",
      });
    } finally {
      globalThis.fetch = originalFetch;
      if (server) {
        server.close();
        await once(server, "close");
      }
    }
  });
});

test("Staff catalogue preview rejects malformed requests before contacting JusticeSure", async () => {
  await withJusticeSureTestConfiguration(async () => {
    const originalFetch = globalThis.fetch;
    let fetchCount = 0;
    globalThis.fetch = async () => {
      fetchCount += 1;
      return Response.json({ data: [] });
    };
    let server: Server | undefined;
    try {
      const running = await listenWithStaffContext();
      server = running.server;
      const response = await requestPreview(running.baseUrl, { products: [{ slug: "invalid slug" }] }, originalFetch);
      assert.equal(response.status, 400);
      assert.equal(fetchCount, 0);
    } finally {
      globalThis.fetch = originalFetch;
      if (server) {
        server.close();
        await once(server, "close");
      }
    }
  });
});

test("Staff catalogue preview reports safe provider diagnostics without exposing upstream details", async () => {
  await withJusticeSureTestConfiguration(async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => Response.json(
      { error: { message: "raw provider response must not escape", apiKey: "secret-value" }, requestHeaders: "private" },
      { status: 503 },
    );
    let server: Server | undefined;
    try {
      const running = await listenWithStaffContext();
      server = running.server;
      const response = await requestPreview(running.baseUrl, {
        products: [{
          slug: "provider-error-check",
          name: "Missing product",
          price: 10,
          standardEligible: false,
          customEligible: false,
          standardSizes: [],
          fulfilmentState: "unavailable",
        }],
      }, originalFetch);
      assert.equal(response.status, 503);
      assert.deepEqual(response.body!.diagnostic, {
        provider: "justicesure",
        stage: "preview_catalogue_read",
        category: "provider",
      });
      assert.doesNotMatch(JSON.stringify(response.body), /raw provider response|secret-value|private/);
    } finally {
      globalThis.fetch = originalFetch;
      if (server) {
        server.close();
        await once(server, "close");
      }
    }
  });
});

test("read-only JusticeSure catalogue access does not activate payment clients or allow writes", async () => {
  const config = {
    baseUrl: "https://commerce.test",
    apiKey: "jsk_test_catalogue-read-only",
    runtimeReady: false,
  };
  assert.throws(() => new JusticeSureCommerceClient(config), JusticeSureConfigurationError);
  let fetchCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCount += 1;
    return Response.json({});
  };
  try {
    const readonlyClient = new JusticeSureCommerceClient(config, true);
    await assert.rejects(
      readonlyClient.createPriceQuote({ items: [], fulfillment: { type: "pickup" } }),
      (error: unknown) => error instanceof JusticeSureConfigurationError && /writes require/i.test(error.message),
    );
    assert.equal(fetchCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("publication mapping validation performs a fresh catalogue read and requires confirmation confidence", async () => {
  const catalogue = loadCapturedCatalogue().products;
  const matched = catalogue.find((product) => product.name === "Crest Ivory Two-Piece")!;
  let catalogueReads = 0;
  const issues = await validateCurrentCommerceMappings([{
    slug: "crest-ivory-two-piece",
    name: matched.name,
    price: matched.amountKobo / 100,
    standardEligible: true,
    customEligible: false,
    standardSizes: matched.variants.filter((variant) => variant.name !== "Custom").map((variant) => variant.name),
    fulfilmentState: "ready_now",
    commerceProductId: matched.id,
    commerceVariantIds: Object.fromEntries(matched.variants
      .filter((variant) => variant.name !== "Custom")
      .map((variant) => [variant.name, variant.id])),
    commerceMappingConfirmation: {
      productHash: "a".repeat(64),
      localHash: "b".repeat(64),
      confidence: 94,
    },
  }], true, async () => {
    catalogueReads += 1;
    return catalogue;
  });
  assert.equal(catalogueReads, 1);
  assert.ok(issues.some((issue) => /high-confidence/i.test(issue)));
  assert.ok(issues.some((issue) => /changed after confirmation/i.test(issue)));
});

test("missing JusticeSure configuration produces a safe configuration diagnostic", async () => {
  await withJusticeSureTestConfiguration(async () => {
    delete process.env.JUSTICESURE_COMMERCE_TEST_API_KEY;
    let fetchCount = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      fetchCount += 1;
      return Response.json({ data: [] });
    };
    let server: Server | undefined;
    try {
      const running = await listenWithStaffContext();
      server = running.server;
      const response = await requestPreview(running.baseUrl, { products: [] }, originalFetch);
      assert.equal(response.status, 503);
      assert.deepEqual(response.body!.diagnostic, {
        provider: "justicesure",
        stage: "preview_catalogue_read",
        category: "configuration",
      });
      assert.equal(fetchCount, 0);
    } finally {
      globalThis.fetch = originalFetch;
      if (server) {
        server.close();
        await once(server, "close");
      }
    }
  });
});