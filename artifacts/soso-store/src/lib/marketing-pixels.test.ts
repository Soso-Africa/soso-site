import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import {
  isMarketingPixelEligiblePath,
  marketingConsentAllowsActivation,
  marketingConfigFromSuccessfulRefetch,
  MarketingPixelRuntime,
} from "./marketing-pixels.ts";
import type {
  MarketingPixelConfig,
  MarketingProvider,
  MarketingProviderName,
  ProviderEvent,
} from "./marketing-pixel-types.ts";

type Call = ["activate", string] | ["resume", string] | ["send", ProviderEvent] | ["revoke"];

function fakeProvider(name: MarketingProviderName, calls: Call[], failures: Partial<Record<Call[0], boolean>> = {}): MarketingProvider {
  return {
    name,
    activate(id) {
      calls.push(["activate", id]);
      if (failures.activate) throw new Error("activate failed");
    },
    resume(id) {
      calls.push(["resume", id]);
    },
    send(event) {
      calls.push(["send", event]);
      if (failures.send) throw new Error("send failed");
    },
    revoke() {
      calls.push(["revoke"]);
      if (failures.revoke) throw new Error("revoke failed");
    },
  };
}

function config(meta = "12345", googleAds: string | null = null): MarketingPixelConfig {
  return {
    schemaVersion: 1,
    revision: 1,
    providers: {
      meta: meta ? { pixelId: meta } : null,
      googleAds: googleAds ? { pixelId: googleAds } : null,
      x: null,
      tiktok: null,
    },
  };
}

test("excludes API, sign-in, sign-up, staff, and Journal preview surfaces", () => {
  assert.equal(isMarketingPixelEligiblePath("/shop"), true);
  for (const path of ["/api", "/api/x", "/staff", "/staff/orders", "/sign-in", "/sign-up/a", "/journal/preview/draft"]) {
    assert.equal(isMarketingPixelEligiblePath(path), false, path);
  }
  assert.equal(isMarketingPixelEligiblePath("shop"), false);
  assert.equal(isMarketingPixelEligiblePath("/shop?email=x"), false);
});

test("supports late grant, current-page dispatch, navigation deduplication, revoke, and regrant", () => {
  const calls: Call[] = [];
  const runtime = new MarketingPixelRuntime([fakeProvider("meta", calls)]);
  runtime.configure(config());
  runtime.setContext(false, "/shop");
  assert.deepEqual(calls, []);

  runtime.setContext(true, "/shop");
  runtime.setContext(true, "/shop");
  assert.equal(calls.filter(([kind]) => kind === "activate").length, 1);
  assert.equal(calls.filter(([kind]) => kind === "send").length, 1);

  runtime.setContext(true, "/about");
  runtime.setContext(true, "/about");
  assert.equal(calls.filter(([kind]) => kind === "send").length, 2);

  runtime.setContext(false, "/about");
  runtime.track("add_to_bag", { productSlug: "blocked" });
  assert.equal(calls.at(-1)?.[0], "revoke");

  runtime.setContext(true, "/about");
  assert.equal(calls.filter(([kind]) => kind === "activate").length, 1);
  assert.equal(calls.filter(([kind]) => kind === "resume").length, 0);
  runtime.configure(config());
  assert.equal(calls.filter(([kind]) => kind === "resume").length, 1);
  assert.equal(calls.filter(([kind]) => kind === "send").length, 3);
});

test("applies refetched configuration without duplicating the current page", () => {
  const calls: Call[] = [];
  const runtime = new MarketingPixelRuntime([fakeProvider("meta", calls)]);
  runtime.setContext(true, "/shop");
  runtime.configure(config("12345"));
  runtime.configure({ ...config("12345"), revision: 2 });
  assert.equal(calls.filter(([kind]) => kind === "send").length, 1);

  runtime.configure({ ...config("67890"), revision: 3 });
  assert.equal(calls.filter(([kind]) => kind === "activate").length, 1);
  assert.equal(calls.filter(([kind]) => kind === "revoke").length, 1);
  assert.equal(calls.filter(([kind]) => kind === "send").length, 1);
  runtime.track("product_view", { productSlug: "blocked-after-replacement" });
  assert.equal(calls.filter(([kind]) => kind === "send").length, 1);
});

test("disabling stops dispatch and re-enabling the same ID resumes without a duplicate initialization", () => {
  const calls: Call[] = [];
  const runtime = new MarketingPixelRuntime([fakeProvider("meta", calls)]);
  runtime.setContext(true, "/shop");
  runtime.configure(config("12345"));
  runtime.configure(config(null));
  runtime.track("product_view", { productSlug: "blocked" });
  assert.equal(calls.filter(([kind]) => kind === "send").length, 1);
  assert.equal(calls.filter(([kind]) => kind === "revoke").length, 1);

  runtime.configure(config("12345"));
  assert.equal(calls.filter(([kind]) => kind === "activate").length, 1);
  assert.equal(calls.filter(([kind]) => kind === "resume").length, 1);
  assert.equal(calls.filter(([kind]) => kind === "send").length, 2);
});

test("isolates activation, dispatch, and revocation failures by provider", () => {
  const brokenCalls: Call[] = [];
  const activationFailureCalls: Call[] = [];
  const healthyCalls: Call[] = [];
  const runtime = new MarketingPixelRuntime([
    fakeProvider("meta", brokenCalls, { send: true, revoke: true }),
    fakeProvider("googleAds", healthyCalls),
    fakeProvider("x", activationFailureCalls, { activate: true }),
  ]);
  runtime.configure({
    ...config("12345", "AW-123456"),
    providers: {
      ...config("12345", "AW-123456").providers,
      x: { pixelId: "abcde" },
    },
  });
  assert.doesNotThrow(() => runtime.setContext(true, "/shop"));
  assert.equal(activationFailureCalls.at(-1)?.[0], "activate");
  assert.equal(healthyCalls.some(([kind]) => kind === "send"), true);

  assert.doesNotThrow(() => runtime.track("checkout_started", {
    itemIds: ["one"],
    value: 10,
    currency: "NGN",
    itemCount: 1,
  }));
  assert.equal(healthyCalls.filter(([kind]) => kind === "send").length, 2);
  assert.doesNotThrow(() => runtime.revoke());
  assert.equal(healthyCalls.at(-1)?.[0], "revoke");
});

test("a failed fresh refetch never reactivates cached provider settings", async () => {
  const oldConfig = config("12345");
  let fail = false;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const observer = new QueryObserver<MarketingPixelConfig, Error>(client, {
    queryKey: ["marketing-pixels-freshness"],
    queryFn: async () => {
      if (fail) throw new Error("public settings unavailable after provider disable");
      return oldConfig;
    },
  });

  const initial = await observer.refetch();
  assert.equal(initial.isSuccess, true);
  assert.deepEqual(marketingConfigFromSuccessfulRefetch(initial), oldConfig);

  fail = true;
  const failed = await observer.refetch({ throwOnError: false });
  assert.equal(failed.isError, true);
  assert.deepEqual(failed.data, oldConfig);
  assert.equal(marketingConfigFromSuccessfulRefetch(failed), null);
  client.clear();
});

test("withdrawal remains authoritative through navigation and a fresh config response", () => {
  const calls: Call[] = [];
  const runtime = new MarketingPixelRuntime([fakeProvider("meta", calls)]);
  let renderedConsent: string | null = "marketing";
  let authoritativeConsent: string | null = "marketing";
  runtime.setContext(
    marketingConsentAllowsActivation(renderedConsent, authoritativeConsent, true),
    "/shop",
  );
  runtime.configure(config("12345"));
  assert.equal(calls.filter(([kind]) => kind === "send").length, 1);

  // The visitor withdraws marketing while the persistence request is pending.
  // React may still hold its previous render briefly, but the synchronous
  // authoritative source must prevent both navigation and config refetches
  // from reopening the provider.
  authoritativeConsent = "analytics";
  runtime.setContext(false, "/shop");
  runtime.setContext(
    marketingConsentAllowsActivation(renderedConsent, authoritativeConsent, true),
    "/about",
  );
  runtime.configure(config("12345"));
  runtime.track("product_view", { productSlug: "must-remain-blocked" });

  assert.equal(calls.filter(([kind]) => kind === "activate").length, 1);
  assert.equal(calls.filter(([kind]) => kind === "resume").length, 0);
  assert.equal(calls.filter(([kind]) => kind === "send").length, 1);
  assert.equal(calls.filter(([kind]) => kind === "revoke").length, 1);
});