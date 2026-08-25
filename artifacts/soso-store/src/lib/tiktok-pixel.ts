import type { MarketingProvider, ProviderEvent } from "./marketing-pixel-types.ts";

const SCRIPT_ID = "soso-marketing-tiktok";
const SCRIPT_BASE_URL = "https://analytics.tiktok.com/i18n/pixel/events.js";
const DEFERRED_METHODS = [
  "page",
  "track",
  "identify",
  "instances",
  "debug",
  "on",
  "off",
  "once",
  "ready",
  "alias",
  "group",
  "enableCookie",
  "disableCookie",
  "holdConsent",
  "revokeConsent",
  "grantConsent",
] as const;

type TikTokQueue = unknown[][] & {
  methods?: readonly string[];
  setAndDefer?: (queue: TikTokQueue, method: string) => void;
  instance?: (id: string) => TikTokQueue;
  load?: (id: string, options?: Record<string, unknown>) => void;
  page?: () => void;
  track?: (name: string, payload?: Record<string, unknown>) => void;
  disableCookie?: () => void;
  revokeConsent?: () => void;
  grantConsent?: () => void;
  _i?: Record<string, TikTokQueue & { _u?: string }>;
  _t?: Record<string, number>;
  _o?: Record<string, Record<string, unknown>>;
};

export function createTikTokPixel(): MarketingProvider {
  const scope = () => window as unknown as {
    TiktokAnalyticsObject?: string;
    ttq?: TikTokQueue;
  };
  const queue = () => scope().ttq;
  const ensureScript = (pixelId: string) => {
    if (document.getElementById(SCRIPT_ID)) return;
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `${SCRIPT_BASE_URL}?sdkid=${encodeURIComponent(pixelId)}&lib=ttq`;
    document.head.appendChild(script);
  };
  const ensureQueue = () => {
    const currentScope = scope();
    currentScope.TiktokAnalyticsObject = "ttq";
    const pending = currentScope.ttq ?? ([] as unknown as TikTokQueue);
    currentScope.ttq = pending;
    pending.methods ??= DEFERRED_METHODS;
    pending.setAndDefer ??= (target, method) => {
      (target as unknown as Record<string, (...args: unknown[]) => void>)[method] ??= (...args) => {
        target.push([method, ...args]);
      };
    };
    for (const method of pending.methods) pending.setAndDefer(pending, method);
    pending.instance ??= (pixelId) => {
      pending._i ??= {};
      const instance = pending._i[pixelId] ?? ([] as unknown as TikTokQueue);
      pending._i[pixelId] = instance;
      for (const method of pending.methods ?? DEFERRED_METHODS) {
        pending.setAndDefer?.(instance, method);
      }
      return instance;
    };
    pending.load ??= (pixelId, options = {}) => {
      pending._i ??= {};
      const instance = pending._i[pixelId] ?? ([] as unknown as TikTokQueue & { _u?: string });
      instance._u = SCRIPT_BASE_URL;
      pending._i[pixelId] = instance;
      pending._t ??= {};
      pending._t[pixelId] = Date.now();
      pending._o ??= {};
      pending._o[pixelId] = options;
      ensureScript(pixelId);
    };
    return pending;
  };
  return {
    name: "tiktok",
    activate(pixelId) {
      const pending = ensureQueue();
      pending.load?.(pixelId);
      pending.grantConsent?.();
    },
    resume(pixelId) {
      const pending = ensureQueue();
      if (!pending._i?.[pixelId]) pending.load?.(pixelId);
      else ensureScript(pixelId);
      pending.grantConsent?.();
    },
    send(event: ProviderEvent) {
      if (event.name === "page_view") {
        queue()?.page?.();
        return;
      }
      const names = { product_view: "ViewContent", add_to_bag: "AddToCart", checkout_started: "InitiateCheckout" };
      const { itemIds, itemCount, ...values } = event.payload;
      queue()?.track?.(names[event.name], {
        ...values,
        ...(itemIds ? { content_id: itemIds.join(","), content_type: "product" } : {}),
        ...(itemCount ? { content_quantity: itemCount } : {}),
      });
    },
    revoke() {
      queue()?.revokeConsent?.();
      queue()?.disableCookie?.();
      document.getElementById(SCRIPT_ID)?.remove();
    },
  };
}