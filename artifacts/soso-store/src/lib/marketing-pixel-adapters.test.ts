import assert from "node:assert/strict";
import test from "node:test";
import { createGoogleAdsPixel } from "./google-ads-pixel.ts";
import { MarketingPixelRuntime } from "./marketing-pixels.ts";
import { createMetaPixel } from "./meta-pixel.ts";
import { createTikTokPixel } from "./tiktok-pixel.ts";
import { createXPixel } from "./x-pixel.ts";

type ScriptNode = {
  id: string;
  async: boolean;
  src: string;
  remove(): void;
};

function withBrowserGlobals(run: (scope: Record<string, unknown>, scripts: Map<string, ScriptNode>) => void) {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const scope: Record<string, unknown> = {};
  const scripts = new Map<string, ScriptNode>();
  const documentStub = {
    createElement() {
      const node: ScriptNode = {
        id: "",
        async: false,
        src: "",
        remove() {
          scripts.delete(node.id);
        },
      };
      return node;
    },
    getElementById(id: string) {
      return scripts.get(id) ?? null;
    },
    head: {
      appendChild(node: ScriptNode) {
        scripts.set(node.id, node);
        return node;
      },
    },
  };
  Object.defineProperty(globalThis, "window", { value: scope, configurable: true, writable: true });
  Object.defineProperty(globalThis, "document", { value: documentStub, configurable: true, writable: true });
  try {
    run(scope, scripts);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else delete (globalThis as { window?: unknown }).window;
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else delete (globalThis as { document?: unknown }).document;
  }
}

test("Meta dispatches to the one governed destination and applies consent revocation", () => {
  withBrowserGlobals((scope, scripts) => {
    const provider = createMetaPixel();
    provider.activate("12345");
    provider.send({ name: "page_view", payload: {} });
    const calls = (scope.fbq as { queue: unknown[][] }).queue;
    assert.deepEqual(calls.at(-1), ["trackSingle", "12345", "PageView", {}]);
    provider.revoke();
    assert.deepEqual(calls.at(-1), ["consent", "revoke"]);
    assert.equal(scripts.has("soso-marketing-meta"), false);
    provider.resume("12345");
    assert.deepEqual(calls.at(-1), ["consent", "grant"]);
    assert.equal(scripts.has("soso-marketing-meta"), true);
  });
});

test("Google Ads events always carry an explicit governed send_to destination", () => {
  withBrowserGlobals((scope, scripts) => {
    const provider = createGoogleAdsPixel();
    provider.activate("AW-123456");
    provider.send({ name: "add_to_bag", payload: { itemIds: ["variant-1"], value: 100, currency: "NGN", quantity: 1 } });
    const calls = scope.dataLayer as unknown[][];
    const event = calls.at(-1)!;
    assert.equal(event[0], "event");
    assert.equal((event[2] as { send_to: string }).send_to, "AW-123456");
    provider.revoke();
    assert.equal(scripts.has("soso-marketing-google-ads"), false);
    assert.deepEqual((calls.at(-1)![2] as { ad_storage: string }).ad_storage, "denied");
    provider.resume("AW-123456");
    assert.equal(scripts.has("soso-marketing-google-ads"), true);
    assert.deepEqual((calls.at(-1)![2] as { ad_storage: string }).ad_storage, "granted");
  });
});

test("X removes its owned script on revocation and resumes the configured destination", () => {
  withBrowserGlobals((scope, scripts) => {
    const x = createXPixel();
    x.activate("abc12");
    assert.equal(scripts.has("soso-marketing-x"), true);
    const calls = (scope.twq as { queue: unknown[][] }).queue;
    assert.deepEqual(calls, [["config", "abc12"], ["consent", "grant"]]);
    x.revoke();
    assert.equal(scripts.has("soso-marketing-x"), false);
    assert.deepEqual(calls.at(-1), ["consent", "revoke"]);
    x.resume("abc12");
    assert.equal(scripts.has("soso-marketing-x"), true);
    assert.deepEqual(calls.at(-1), ["consent", "grant"]);
  });
});

test("X runtime withdrawal revokes before cleanup and re-grant resumes consented dispatch", () => {
  withBrowserGlobals((scope, scripts) => {
    const runtime = new MarketingPixelRuntime([createXPixel()]);
    const config = {
      schemaVersion: 1 as const,
      revision: 1,
      providers: {
        meta: null,
        googleAds: null,
        x: { pixelId: "abc12" },
        tiktok: null,
      },
    };
    runtime.setContext(true, "/shop");
    runtime.configure(config);
    const calls = (scope.twq as { queue: unknown[][] }).queue;
    assert.deepEqual(calls.slice(0, 3), [
      ["config", "abc12"],
      ["consent", "grant"],
      ["event", "PageView", {}],
    ]);

    runtime.setContext(false, "/shop");
    assert.deepEqual(calls.at(-1), ["consent", "revoke"]);
    assert.equal(scripts.has("soso-marketing-x"), false);

    runtime.setContext(true, "/shop");
    runtime.configure(config);
    assert.equal(scripts.has("soso-marketing-x"), true);
    assert.deepEqual(calls.slice(-2), [
      ["consent", "grant"],
      ["event", "PageView", {}],
    ]);
    assert.equal(calls.filter((call) => call[0] === "config").length, 1);
  });
});

test("TikTok emits the pixel-specific bootstrap and restores it after re-consent", () => {
  withBrowserGlobals((scope, scripts) => {
    const pixelId = "C123ABCD456EFGH789IJ";
    const tiktok = createTikTokPixel();
    tiktok.activate(pixelId);
    const initialScript = scripts.get("soso-marketing-tiktok");
    assert.equal(
      initialScript?.src,
      `https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${pixelId}&lib=ttq`,
    );
    assert.equal(scope.TiktokAnalyticsObject, "ttq");
    const queue = scope.ttq as unknown[][] & {
      _i: Record<string, unknown[] & { _u?: string }>;
      _t: Record<string, number>;
      _o: Record<string, Record<string, unknown>>;
    };
    assert.equal(queue._i[pixelId]?._u, "https://analytics.tiktok.com/i18n/pixel/events.js");
    assert.equal(typeof queue._t[pixelId], "number");
    assert.deepEqual(queue._o[pixelId], {});
    assert.deepEqual(queue.at(-1), ["grantConsent"]);

    tiktok.revoke();
    assert.equal(scripts.has("soso-marketing-tiktok"), false);
    assert.equal(queue.some((call) => call[0] === "revokeConsent"), true);

    tiktok.resume(pixelId);
    const resumedScript = scripts.get("soso-marketing-tiktok");
    assert.equal(resumedScript?.src, initialScript?.src);
    assert.deepEqual(queue.at(-1), ["grantConsent"]);

    tiktok.send({ name: "page_view", payload: {} });
    assert.deepEqual(queue.at(-1), ["page"]);
  });
});