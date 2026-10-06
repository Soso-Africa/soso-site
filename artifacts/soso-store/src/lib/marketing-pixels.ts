import { createGoogleAdsPixel } from "./google-ads-pixel.ts";
import { createMetaPixel } from "./meta-pixel.ts";
import { createTikTokPixel } from "./tiktok-pixel.ts";
import { mapMarketingEvent, purchaseReceipt, type MarketingPixelConfig, type MarketingProvider } from "./marketing-pixel-types.ts";
import { createXPixel } from "./x-pixel.ts";
import { isPrivateAdvertisingPath } from "@workspace/api-client-react";

export function isMarketingPixelEligiblePath(pathname: string): boolean {
  return pathname.startsWith("/")
    && !pathname.includes("?")
    && !pathname.includes("#")
    && !isPrivateAdvertisingPath(pathname);
}

export function marketingConfigFromSuccessfulRefetch(result: {
  isSuccess: boolean;
  data?: MarketingPixelConfig;
}): MarketingPixelConfig | null {
  return result.isSuccess && result.data?.schemaVersion === 1 ? result.data : null;
}

export function marketingConsentAllowsActivation(
  renderedConsent: string | null,
  authoritativeConsent: string | null,
  eligiblePath: boolean,
): boolean {
  return renderedConsent === "marketing"
    && authoritativeConsent === "marketing"
    && eligiblePath;
}

export class MarketingPixelRuntime {
  private readonly providers: MarketingProvider[];
  private consent = false;
  private generation = 0;
  private pathname = "/";
  private config: MarketingPixelConfig | null = null;
  private active = new Map<string, string>();
  private initialized = new Map<string, string>();
  private blockedUntilReload = new Set<string>();
  private pageViews = new Map<string, string>();
  private purchaser = false;
  private purchases = new Set<string>();
  private purchaseGeneration = 0;

  getPurchaseGeneration(): number { return this.purchaseGeneration; }

  hasPurchaseDestination(): boolean {
    return this.consent && this.providers.some((provider) => {
      const config = this.config?.providers[provider.name];
      return this.active.has(provider.name) && provider.purchase && config
        && (provider.name !== "googleAds" || Boolean(config.conversionLabel))
        && (provider.name !== "x" || Boolean(config.purchaseEventId));
    });
  }

  dispatchVerifiedPurchase(input: unknown): void {
    if (!this.consent || !isMarketingPixelEligiblePath(this.pathname)) return;
    const receipt = purchaseReceipt(input);
    if (!receipt) return;
    this.purchaser = true;
    for (const provider of this.providers) {
      const config = this.config?.providers[provider.name];
      const key = `${provider.name}:${receipt.eventId}`;
      if (!config || !this.active.has(provider.name) || !provider.purchase || this.purchases.has(key)) continue;
      // Record the attempt before vendor code. Retrying cannot prove receipt.
      this.purchases.add(key);
      try { provider.purchase(receipt, config); } catch { /* At-most-once, isolated dispatch. */ }
    }
  }

  suppressPurchaser(): void { this.purchaser = true; }

  constructor(providers: MarketingProvider[]) {
    this.providers = providers;
  }

  setContext(consent: boolean, pathname: string): void {
    const eligible = isMarketingPixelEligiblePath(pathname);
    const nextConsent = consent && eligible;
    if (this.consent && !nextConsent) this.revoke();
    else if (!this.consent && nextConsent) {
      this.consent = true;
      this.generation += 1;
    }
    this.pathname = pathname;
    if (this.consent) {
      if (typeof window !== "undefined") {
        try {
          if (window.localStorage.getItem("soso-consented-purchaser-v1") === "1") this.purchaser = true;
        } catch { /* Runtime suppression remains usable without storage. */ }
      }
      this.activateConfigured();
      this.sendCurrentPage();
    }
  }

  configure(config: MarketingPixelConfig | null): void {
    this.config = config?.schemaVersion === 1 ? config : null;
    if (!this.consent) return;
    this.activateConfigured();
    this.sendCurrentPage();
  }

  track(eventName: string, properties?: Record<string, unknown>): void {
    if (!this.consent || !isMarketingPixelEligiblePath(this.pathname)) return;
    if (this.purchaser) return;
    const event = mapMarketingEvent(eventName, properties);
    if (!event) return;
    for (const provider of this.providers) {
      if (!this.active.has(provider.name)) continue;
      try {
        provider.send(event);
      } catch {
        // One blocked or faulty vendor must not affect other vendors or the UI.
      }
    }
  }

  revoke(): void {
    // Flip the gate before invoking vendor code so re-entrant sends are blocked.
    this.consent = false;
    this.purchaseGeneration += 1;
    this.purchaser = false;
    for (const provider of this.providers) {
      if (!this.active.has(provider.name)) continue;
      try {
        provider.revoke();
      } catch {
        // Best-effort cleanup remains isolated by provider.
      }
    }
    this.active.clear();
    this.config = null;
  }

  private activateConfigured(): void {
    for (const provider of this.providers) {
      const providerConfig = this.config?.providers[provider.name];
      const pixelId = providerConfig?.pixelId;
      const current = this.active.get(provider.name);
      if (!pixelId) {
        if (current) {
          try { provider.revoke(); } catch { /* Isolate vendor cleanup. */ }
          this.active.delete(provider.name);
          this.pageViews.delete(provider.name);
        }
        continue;
      }
      if (this.blockedUntilReload.has(provider.name)) continue;
      const destinationIdentity = JSON.stringify(providerConfig);
      const initialized = this.initialized.get(provider.name);
      if (current === pixelId && initialized === destinationIdentity) continue;
      if (initialized && initialized !== destinationIdentity) {
        if (current) {
          try { provider.revoke(); } catch { /* The runtime gate still blocks future dispatch. */ }
        }
        this.active.delete(provider.name);
        this.pageViews.delete(provider.name);
        // Vendor globals cannot reliably unregister an old destination. Keep
        // this provider off until a full page load creates a fresh SDK context.
        this.blockedUntilReload.add(provider.name);
        continue;
      }
      this.pageViews.delete(provider.name);
      try {
        if (initialized === destinationIdentity) provider.resume(pixelId);
        else provider.activate(pixelId);
        this.initialized.set(provider.name, destinationIdentity);
        this.active.set(provider.name, pixelId);
      } catch {
        this.active.delete(provider.name);
      }
    }
  }

  private sendCurrentPage(): void {
    if (this.purchaser) return;
    const event = mapMarketingEvent("page_view");
    if (!event) return;
    for (const provider of this.providers) {
      if (!this.active.has(provider.name)) continue;
      const key = `${this.generation}:${this.pathname}`;
      if (this.pageViews.get(provider.name) === key) continue;
      try {
        provider.send(event);
        this.pageViews.set(provider.name, key);
      } catch {
        // A later reconciliation can retry a failed page view.
      }
    }
  }
}

export const marketingPixels = new MarketingPixelRuntime(
  typeof window === "undefined"
    ? []
    : [createMetaPixel(), createGoogleAdsPixel(), createXPixel(), createTikTokPixel()],
);

export type { MarketingPixelConfig };