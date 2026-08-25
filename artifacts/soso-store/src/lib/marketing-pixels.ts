import { createGoogleAdsPixel } from "./google-ads-pixel.ts";
import { createMetaPixel } from "./meta-pixel.ts";
import { createTikTokPixel } from "./tiktok-pixel.ts";
import { mapMarketingEvent, type MarketingPixelConfig, type MarketingProvider } from "./marketing-pixel-types.ts";
import { createXPixel } from "./x-pixel.ts";
import { isPrivateStorefrontPath } from "@workspace/api-client-react";

export function isMarketingPixelEligiblePath(pathname: string): boolean {
  return pathname.startsWith("/")
    && !pathname.includes("?")
    && !pathname.includes("#")
    && !isPrivateStorefrontPath(pathname);
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
      const pixelId = this.config?.providers[provider.name]?.pixelId;
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
      if (current === pixelId) continue;
      const initialized = this.initialized.get(provider.name);
      if (initialized && initialized !== pixelId) {
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
        if (initialized === pixelId) provider.resume(pixelId);
        else provider.activate(pixelId);
        this.initialized.set(provider.name, pixelId);
        this.active.set(provider.name, pixelId);
      } catch {
        this.active.delete(provider.name);
      }
    }
  }

  private sendCurrentPage(): void {
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