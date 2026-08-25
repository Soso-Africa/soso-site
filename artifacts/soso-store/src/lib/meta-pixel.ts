import type { MarketingProvider, ProviderEvent } from "./marketing-pixel-types.ts";

const SCRIPT_ID = "soso-marketing-meta";
type MetaQueue = ((...args: unknown[]) => void) & { queue: unknown[][]; loaded?: boolean };

function fbq(...args: unknown[]): void {
  const command = (window as unknown as { fbq?: (...values: unknown[]) => void }).fbq;
  if (typeof command === "function") command(...args);
}

export function createMetaPixel(): MarketingProvider {
  let destination = "";
  const ensureScript = () => {
    if (document.getElementById(SCRIPT_ID)) return;
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(script);
  };
  return {
    name: "meta",
    activate(pixelId) {
      destination = pixelId;
      const scope = window as unknown as { fbq?: MetaQueue };
      if (!scope.fbq) {
        const queue = ((...args: unknown[]) => { queue.queue.push(args); }) as unknown as MetaQueue;
        queue.queue = [];
        scope.fbq = queue;
      }
      ensureScript();
      fbq("consent", "grant");
      fbq("init", pixelId);
    },
    resume(pixelId) {
      destination = pixelId;
      ensureScript();
      fbq("consent", "grant");
    },
    send(event: ProviderEvent) {
      const names = { page_view: "PageView", product_view: "ViewContent", add_to_bag: "AddToCart", checkout_started: "InitiateCheckout" };
      const { itemIds, ...numbers } = event.payload;
      if (!destination) return;
      fbq("trackSingle", destination, names[event.name], { ...numbers, ...(itemIds ? { content_ids: itemIds, content_type: "product" } : {}) });
    },
    revoke() {
      fbq("consent", "revoke");
      document.getElementById(SCRIPT_ID)?.remove();
    },
  };
}