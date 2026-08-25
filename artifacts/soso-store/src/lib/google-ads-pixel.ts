import type { MarketingProvider, ProviderEvent } from "./marketing-pixel-types.ts";

const SCRIPT_ID = "soso-marketing-google-ads";

function gtag(...args: unknown[]): void {
  const scope = window as unknown as { dataLayer?: unknown[][]; gtag?: (...values: unknown[]) => void };
  scope.dataLayer ??= [];
  const command = scope.gtag ?? ((...values: unknown[]) => scope.dataLayer?.push(values));
  scope.gtag = command;
  command(...args);
}

export function createGoogleAdsPixel(): MarketingProvider {
  let destination = "";
  const ensureScript = (pixelId: string) => {
    if (document.getElementById(SCRIPT_ID)) return;
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(pixelId)}`;
    document.head.appendChild(script);
  };
  return {
    name: "googleAds",
    activate(pixelId) {
      destination = pixelId;
      ensureScript(pixelId);
      gtag("js", new Date());
      gtag("consent", "update", { ad_storage: "granted", ad_user_data: "granted", ad_personalization: "granted" });
      gtag("config", pixelId, { send_page_view: false });
    },
    resume(pixelId) {
      destination = pixelId;
      ensureScript(pixelId);
      gtag("consent", "update", { ad_storage: "granted", ad_user_data: "granted", ad_personalization: "granted" });
    },
    send(event: ProviderEvent) {
      const names = { page_view: "page_view", product_view: "view_item", add_to_bag: "add_to_cart", checkout_started: "begin_checkout" };
      const { itemIds, quantity, itemCount, ...values } = event.payload;
      gtag("event", names[event.name], {
        send_to: destination,
        ...values,
        ...(itemCount ? { item_count: itemCount } : {}),
        ...(itemIds ? { items: itemIds.map((item_id) => ({ item_id, ...(quantity ? { quantity } : {}) })) } : {}),
      });
    },
    revoke() {
      destination = "";
      gtag("consent", "update", { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
      document.getElementById(SCRIPT_ID)?.remove();
    },
  };
}