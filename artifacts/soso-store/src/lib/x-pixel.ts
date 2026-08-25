import type { MarketingProvider, ProviderEvent } from "./marketing-pixel-types.ts";

const SCRIPT_ID = "soso-marketing-x";
type XQueue = ((...args: unknown[]) => void) & { queue: unknown[][] };

function twq(...args: unknown[]): void {
  const command = (window as unknown as { twq?: (...values: unknown[]) => void }).twq;
  if (typeof command === "function") command(...args);
}

export function createXPixel(): MarketingProvider {
  const ensureScript = () => {
    if (document.getElementById(SCRIPT_ID)) return;
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = "https://static.ads-twitter.com/uwt.js";
    document.head.appendChild(script);
  };
  return {
    name: "x",
    activate(pixelId) {
      const scope = window as unknown as { twq?: XQueue };
      if (!scope.twq) {
        const queue = ((...args: unknown[]) => { queue.queue.push(args); }) as unknown as XQueue;
        queue.queue = [];
        scope.twq = queue;
      }
      ensureScript();
      twq("config", pixelId);
      twq("consent", "grant");
    },
    resume() {
      ensureScript();
      twq("consent", "grant");
    },
    send(event: ProviderEvent) {
      const names = { page_view: "PageView", product_view: "ViewContent", add_to_bag: "AddToCart", checkout_started: "InitiateCheckout" };
      const { itemIds, itemCount, ...values } = event.payload;
      twq("event", names[event.name], { ...values, ...(itemIds ? { content_ids: itemIds } : {}), ...(itemCount ? { num_items: itemCount } : {}) });
    },
    revoke() {
      twq("consent", "revoke");
      document.getElementById(SCRIPT_ID)?.remove();
    },
  };
}