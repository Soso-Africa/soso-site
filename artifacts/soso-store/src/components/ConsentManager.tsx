import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { usePlatformContent } from "@/data/platformContent";
import {
  getGetPublicMarketingPixelsQueryKey,
  useGetPublicMarketingPixels,
} from "@workspace/api-client-react";
import {
  isMarketingPixelEligiblePath,
  marketingConsentAllowsActivation,
  marketingConfigFromSuccessfulRefetch,
  marketingPixels,
} from "@/lib/marketing-pixels";
import {
  nextMeasurementGrantGeneration,
  pageViewRecordAfterSend,
  shouldRecordPageViewForGrant,
  type PageViewRecord,
} from "@/lib/page-view-lifecycle";
import {
  isRegionDefaultAnalytics,
  shouldAutomaticallyEnableAnalytics,
} from "@/lib/consent-region";

type ConsentState = "essential_only" | "analytics" | "marketing";
export type StorefrontEventName =
  | "page_view"
  | "session_started"
  | "active_time_heartbeat"
  | "product_view"
  | "product_image_viewed"
  | "size_guide_opened"
  | "size_selected"
  | "stylist_inquiry_started"
  | "stylist_inquiry_completed"
  | "add_to_bag"
  | "cart_opened"
  | "checkout_started"
  | "checkout_field_error"
  | "checkout_form_completed"
  | "payment_clicked"
  | "checkout_payment_unavailable"
  | "consent_banner_viewed"
  | "consent_updated"
  | "marketing_opt_out"
  | "blog_article_viewed"
  | "category_impression"
  | "faq_expanded"
  | "scroll_depth_reached"
  | "cta_clicked";

const CONSENT_KEY = "soso-consent-v1";
const CONSENT_SOURCE_KEY = "soso-consent-source-v1";
const VISITOR_KEY = "soso-visitor-id";
const SESSION_KEY = "soso-session-id";
const SESSION_FIRED_KEY = "soso-session-started-fired";
const SCROLL_DEPTHS_KEY = "soso-scroll-depths";
const ATTRIBUTION_KEY = "soso-first-touch-attribution";
const EDITORIAL_ORIGIN_KEY = "soso-editorial-origin";
const EVENT_VERSION = 1;
const MAX_ATTRIBUTION_VALUE_LENGTH = 120;
const MAX_EVENT_PROPERTY_KEYS = 30;
const MAX_EVENT_PROPERTY_ARRAY_ITEMS = 20;
const MAX_EVENT_PROPERTY_DEPTH = 3;
const MAX_EVENT_PROPERTY_STRING_LENGTH = 200;
const MAX_EVENT_PROPERTIES_BYTES = 8_000;
let inMemoryVisitorId: string | null = null;
let inMemorySessionId: string | null = null;
let inMemoryEditorialOrigin: string | null = null;
let regionDefaultValidated = false;

function apiUrl(path: string): string {
  const configuredBase = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "");
  return `${configuredBase ?? ""}/api${path}`;
}

function storageGet(storage: "local" | "session", key: string): string | null {
  try {
    return (storage === "local" ? window.localStorage : window.sessionStorage).getItem(key);
  } catch {
    return null;
  }
}

function storageSet(storage: "local" | "session", key: string, value: string): void {
  try {
    (storage === "local" ? window.localStorage : window.sessionStorage).setItem(key, value);
  } catch {
    // Storage can be blocked or full. Browsing and consent choices still work in memory.
  }
}

function storageRemove(storage: "local" | "session", key: string): void {
  try {
    (storage === "local" ? window.localStorage : window.sessionStorage).removeItem(key);
  } catch {
    // A malformed persisted value is harmless when it cannot be removed.
  }
}

function fallbackUuid(): string {
  const timestamp = Date.now().toString(16).padStart(12, "0").slice(-12);
  const randomHex = () => Math.floor(Math.random() * 16).toString(16);
  return `${timestamp.slice(0, 8)}-${timestamp.slice(8)}-4${Array.from({ length: 3 }, randomHex).join("")}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${Array.from({ length: 3 }, randomHex).join("")}-${Array.from({ length: 12 }, randomHex).join("")}`;
}

function createId(): string {
  try {
    const id = globalThis.crypto?.randomUUID?.();
    if (typeof id === "string" && id) return id;
  } catch {
    // Some privacy modes expose crypto but reject randomUUID().
  }
  return fallbackUuid();
}

function visitorId(): string {
  const saved = storageGet("local", VISITOR_KEY);
  if (saved) return saved;
  if (!inMemoryVisitorId) {
    inMemoryVisitorId = createId();
    storageSet("local", VISITOR_KEY, inMemoryVisitorId);
  }
  return inMemoryVisitorId;
}

function sessionId(): string {
  const saved = storageGet("session", SESSION_KEY);
  if (saved) return saved;
  if (!inMemorySessionId) {
    inMemorySessionId = createId();
    storageSet("session", SESSION_KEY, inMemorySessionId);
  }
  return inMemorySessionId;
}

type PersistedConsent = {
  available: boolean;
  consent: ConsentState | null;
  requiresRegionValidation: boolean;
};

function persistedConsent(): PersistedConsent {
  try {
    const saved = window.localStorage.getItem(CONSENT_KEY);
    const consent = saved === "essential_only" || saved === "analytics" || saved === "marketing"
      ? saved
      : null;
    const requiresRegionValidation = isRegionDefaultAnalytics(
      consent,
      window.localStorage.getItem(CONSENT_SOURCE_KEY),
    );
    return {
      available: true,
      consent: requiresRegionValidation && !regionDefaultValidated ? null : consent,
      requiresRegionValidation,
    };
  } catch {
    return { available: false, consent: null, requiresRegionValidation: false };
  }
}

function readConsent(): ConsentState | null {
  return persistedConsent().consent;
}

type MeasurementConsent = Exclude<ConsentState, "essential_only">;

// This is intentionally initialized outside React. Storefront page effects can
// run before ConsentManager's effects, while returning visitors must not lose
// their first event after already granting measurement consent.
let consentSource: ConsentState | null = null;
let measurementGrantGeneration = 0;
let recordedPageView: PageViewRecord | null = null;
let inMemorySessionStarted = false;

function updateConsentSource(consent: ConsentState | null): void {
  const previouslyAllowed = consentSource === "analytics" || consentSource === "marketing";
  const nowAllowed = consent === "analytics" || consent === "marketing";
  // A generation represents one continuous affirmative-measurement grant.
  // Re-rendering, remounting, or analytics <-> marketing changes remain in
  // the same generation; a genuine no/essential -> affirmative transition
  // starts a new one and may record the current pathname once.
  measurementGrantGeneration = nextMeasurementGrantGeneration(
    measurementGrantGeneration,
    previouslyAllowed,
    nowAllowed,
  );
  consentSource = consent;
  if (typeof window !== "undefined") {
    marketingPixels.setContext(consent === "marketing", window.location.pathname);
  }
}

updateConsentSource(typeof window === "undefined" ? null : readConsent());

/**
 * Storage is the durable cross-tab authority when readable. When it is not,
 * retain the in-memory decision so a visitor who accepted in this session can
 * still use measurement.
 */
function reconcileConsentSource(): ConsentState | null {
  const persisted = persistedConsent();
  if (persisted.available) updateConsentSource(persisted.consent);
  return consentSource;
}

function reconcileConsentUi(
  setConsent: (consent: ConsentState | null) => void,
  setVisible: (visible: boolean) => void,
): ConsentState | null {
  const consent = reconcileConsentSource();
  setConsent(consent);
  setVisible(!consent);
  return consent;
}

function measurementConsent(): MeasurementConsent | null {
  const consent = reconcileConsentSource();
  return consent === "analytics" || consent === "marketing"
    ? consent
    : null;
}

type Attribution = {
  source?: string;
  utmMedium?: string;
  utmCampaign?: string;
};

function capturedAttribution(): Attribution {
  try {
    const params = new URLSearchParams(window.location.search);
    const value = (name: string) => params.get(name)?.trim().slice(0, MAX_ATTRIBUTION_VALUE_LENGTH) || undefined;
    return {
      source: value("utm_source"),
      utmMedium: value("utm_medium"),
      utmCampaign: value("utm_campaign"),
    };
  } catch {
    return {};
  }
}

function savedAttribution(): Attribution | null {
  const saved = storageGet("session", ATTRIBUTION_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as Attribution;
      if (parsed && typeof parsed === "object") {
        const value = (name: keyof Attribution) => {
          const candidate = parsed[name];
          return typeof candidate === "string" ? candidate.trim().slice(0, MAX_ATTRIBUTION_VALUE_LENGTH) || undefined : undefined;
        };
        const attribution = { source: value("source"), utmMedium: value("utmMedium"), utmCampaign: value("utmCampaign") };
        if (attribution.source || attribution.utmMedium || attribution.utmCampaign) return attribution;
      }
    } catch {
      storageRemove("session", ATTRIBUTION_KEY);
    }
  }
  return null;
}

function persistFirstTouchAttribution(captured: Attribution): Attribution {
  const existing = savedAttribution();
  if (existing) return existing;
  if (captured.source || captured.utmMedium || captured.utmCampaign) {
    storageSet("session", ATTRIBUTION_KEY, JSON.stringify(captured));
  }
  return captured;
}

function firstTouchAttribution(): Attribution {
  return savedAttribution() ?? persistFirstTouchAttribution(capturedAttribution());
}

type SendEventOptions = {
  keepalive?: boolean;
  path?: string;
};

function boundedProperties(properties: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!properties) return undefined;
  const sanitize = (value: unknown, depth: number): unknown => {
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
    if (typeof value === "string") return value.slice(0, MAX_EVENT_PROPERTY_STRING_LENGTH);
    if (depth >= MAX_EVENT_PROPERTY_DEPTH) return undefined;
    if (Array.isArray(value)) {
      return value.slice(0, MAX_EVENT_PROPERTY_ARRAY_ITEMS).map((entry) => sanitize(entry, depth + 1)).filter((entry) => entry !== undefined);
    }
    if (typeof value === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(value).slice(0, MAX_EVENT_PROPERTY_KEYS)) {
        const clean = sanitize(entry, depth + 1);
        if (clean !== undefined) result[key.slice(0, MAX_EVENT_PROPERTY_STRING_LENGTH)] = clean;
      }
      return result;
    }
    return undefined;
  };
  try {
    const clean = sanitize(properties, 0);
    if (!clean || typeof clean !== "object" || Array.isArray(clean)) return undefined;
    return JSON.stringify(clean).length <= MAX_EVENT_PROPERTIES_BYTES ? clean as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function coarseBrowserFamily(): "chrome" | "safari" | "firefox" | "edge" | "opera" | "samsung internet" | "unknown" {
  const agent = navigator.userAgent.toLowerCase();
  if (agent.includes("samsungbrowser")) return "samsung internet";
  if (agent.includes("edg/")) return "edge";
  if (agent.includes("opr/") || agent.includes("opera")) return "opera";
  if (agent.includes("firefox/")) return "firefox";
  if (agent.includes("chrome/") || agent.includes("crios/")) return "chrome";
  if (agent.includes("safari/")) return "safari";
  return "unknown";
}

function sendEvent(
  consent: MeasurementConsent,
  eventName: StorefrontEventName,
  properties?: Record<string, unknown>,
  options?: SendEventOptions,
) {
  const attribution = firstTouchAttribution();
  const safeProperties = boundedProperties({
    ...(properties ?? {}),
    browser: coarseBrowserFamily(),
  });
  void fetch(apiUrl("/analytics/events"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventId: createId(),
      eventVersion: EVENT_VERSION,
      anonymousId: visitorId(),
      sessionId: sessionId(),
      eventName,
      path: options?.path ?? window.location.pathname,
      referrer: document.referrer || undefined,
      source: attribution.source,
      utmMedium: attribution.utmMedium,
      utmCampaign: attribution.utmCampaign,
      deviceType: window.innerWidth < 768 ? "mobile" : window.innerWidth < 1100 ? "tablet" : "desktop",
      consent,
      properties: safeProperties,
      occurredAt: new Date().toISOString(),
    }),
    keepalive: options?.keepalive,
  }).catch(() => {
    // Measurement must never interrupt browsing or checkout.
  });
}

/** Sends only while the synchronous consent source allows measurement. */
function sendConsentedEvent(
  eventName: StorefrontEventName,
  properties?: Record<string, unknown>,
  options?: SendEventOptions,
): boolean {
  const consent = measurementConsent();
  if (!consent) return false;
  sendEvent(consent, eventName, properties, options);
  return true;
}

function pageViewNeedsRecording(pathname: string): boolean {
  return shouldRecordPageViewForGrant(recordedPageView, measurementGrantGeneration, pathname);
}

function recordPageView(pathname: string, sendSucceeded: boolean): void {
  recordedPageView = pageViewRecordAfterSend(
    recordedPageView,
    measurementGrantGeneration,
    pathname,
    sendSucceeded,
  );
}

export function trackStorefrontEvent(
  eventName: Exclude<StorefrontEventName, "page_view">,
  properties?: Record<string, unknown>,
) {
  if (typeof window === "undefined") return;
  sendConsentedEvent(eventName, properties);
  marketingPixels.track(eventName, properties);
}

/**
 * Carries a Journal article context across an in-app product handoff only
 * after the visitor has allowed optional measurement. This is intentionally
 * session-scoped and is never stored before consent.
 */
export function rememberEditorialOrigin(articleSlug: string): void {
  if (typeof window === "undefined" || !measurementConsent()) return;
  const cleanSlug = articleSlug.trim().slice(0, MAX_EVENT_PROPERTY_STRING_LENGTH);
  if (!cleanSlug) return;
  inMemoryEditorialOrigin = cleanSlug;
  storageSet("session", EDITORIAL_ORIGIN_KEY, cleanSlug);
}

export function editorialOrigin(): string | undefined {
  if (typeof window === "undefined" || !measurementConsent()) return undefined;
  const stored = storageGet("session", EDITORIAL_ORIGIN_KEY)?.trim().slice(0, MAX_EVENT_PROPERTY_STRING_LENGTH);
  return stored || inMemoryEditorialOrigin || undefined;
}

export function openPrivacyChoices() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("soso:open-privacy-choices"));
}

/** Records consented, visible time in bounded increments for the current page. */
function useActiveTimeHeartbeat(consent: ConsentState | null, enabled: boolean, pathname: string) {
  const visibleSinceRef = useRef<number | null>(null);
  const accumulatedRef = useRef(0);
  const reportedRef = useRef(0);

  useEffect(() => {
    if (!enabled || (consent !== "analytics" && consent !== "marketing")) return;
    const heartbeatMs = 60_000;
    const minimumReportMs = 15_000;

    const activeMs = () => accumulatedRef.current + (
      visibleSinceRef.current === null ? 0 : performance.now() - visibleSinceRef.current
    );
    const report = (keepalive = false) => {
      const totalMs = activeMs();
      const newMs = totalMs - reportedRef.current;
      if (newMs < minimumReportMs) return;
      reportedRef.current = totalMs;
      sendConsentedEvent("active_time_heartbeat", {
        active_seconds: Math.round(totalMs / 1000),
        interval_seconds: Math.round(newMs / 1000),
      }, { keepalive, path: pathname });
    };

    const onVisible = () => {
      if (visibleSinceRef.current === null) visibleSinceRef.current = performance.now();
    };
    const onHidden = () => {
      if (visibleSinceRef.current !== null) {
        accumulatedRef.current += performance.now() - visibleSinceRef.current;
        visibleSinceRef.current = null;
      }
      report(true);
    };
    const onVisibilityChange = () => {
      if (document.hidden) onHidden();
      else onVisible();
    };

    if (!document.hidden) visibleSinceRef.current = performance.now();

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onHidden);
    const heartbeat = window.setInterval(report, heartbeatMs);

    return () => {
      onHidden();
      window.clearInterval(heartbeat);
      window.removeEventListener("pagehide", onHidden);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      accumulatedRef.current = 0;
      reportedRef.current = 0;
    };
  }, [consent, enabled, pathname]);
}

/** Scroll-depth tracker: fires at 25 / 50 / 75 / 90% once per public page. */
function useScrollDepth(consent: ConsentState | null, pathname: string) {
  useEffect(() => {
    if (consent !== "analytics" && consent !== "marketing") return;

    const storageKey = `${SCROLL_DEPTHS_KEY}:${pathname}`;
    const savedDepths = storageGet("session", storageKey);
    let firedDepths = new Set<number>();
    try {
      const parsed = JSON.parse(savedDepths ?? "[]") as unknown;
      if (Array.isArray(parsed)) {
        firedDepths = new Set(parsed.filter((depth): depth is number => typeof depth === "number" && [25, 50, 75, 90].includes(depth)));
      }
    } catch {
      storageRemove("session", storageKey);
    }
    const thresholds = [25, 50, 75, 90];

    const check = () => {
      const scrolled = window.scrollY + window.innerHeight;
      const total = document.documentElement.scrollHeight;
      const pct = total > 0 ? (scrolled / total) * 100 : 0;

      for (const t of thresholds) {
        if (pct >= t && !firedDepths.has(t)) {
          firedDepths.add(t);
          storageSet("session", storageKey, JSON.stringify([...firedDepths]));
          trackStorefrontEvent("scroll_depth_reached", { depth_pct: t, path: window.location.pathname });
        }
      }
    };

    window.addEventListener("scroll", check, { passive: true });
    return () => window.removeEventListener("scroll", check);
  }, [consent, pathname]);
}

export function ConsentManager() {
  const platform = usePlatformContent();
  const [consent, setConsent] = useState<ConsentState | null>(() => consentSource);
  const [visible, setVisible] = useState(false);
  const [regionResolutionRequest, requestRegionResolution] = useState(0);
  const [pathname] = useLocation();
  const bannerViewedRef = useRef(false);
  const landingAttributionRef = useRef<Attribution | null>(null);
  const marketingContextActiveRef = useRef(false);
  const marketingConfigReadyRef = useRef(false);
  const marketingRequestGenerationRef = useRef(0);
  const consentSaveGenerationRef = useRef(0);
  const marketingEligible = isMarketingPixelEligiblePath(pathname);
  const marketingConfig = useGetPublicMarketingPixels({
    query: {
      queryKey: getGetPublicMarketingPixelsQueryKey(),
      enabled: consent === "marketing" && marketingEligible,
      staleTime: 0,
      refetchOnWindowFocus: true,
      refetchInterval: 60_000,
    },
  });

  useEffect(() => {
    const shouldActivate = marketingConsentAllowsActivation(
      consent,
      consentSource,
      marketingEligible,
    );
    if (!shouldActivate) {
      marketingRequestGenerationRef.current += 1;
      marketingContextActiveRef.current = false;
      marketingConfigReadyRef.current = false;
      marketingPixels.setContext(false, pathname);
      return;
    }

    if (marketingConfig.isError) {
      marketingRequestGenerationRef.current += 1;
      marketingContextActiveRef.current = false;
      marketingConfigReadyRef.current = false;
      marketingPixels.setContext(false, pathname);
      return;
    }

    if (!marketingContextActiveRef.current) {
      const requestGeneration = marketingRequestGenerationRef.current + 1;
      marketingRequestGenerationRef.current = requestGeneration;
      marketingContextActiveRef.current = true;
      marketingConfigReadyRef.current = false;
      // Never reactivate from cached settings after a revocation or private
      // surface. Fetch the current public projection before loading a vendor.
      marketingPixels.setContext(false, pathname);
      marketingPixels.configure(null);
      marketingPixels.setContext(true, pathname);
      void marketingConfig.refetch().then((result) => {
        const freshConfig = marketingConfigFromSuccessfulRefetch(result);
        if (
          !freshConfig
          ||
          marketingRequestGenerationRef.current !== requestGeneration
          || consentSource !== "marketing"
          || !isMarketingPixelEligiblePath(window.location.pathname)
        ) return;
        marketingConfigReadyRef.current = true;
        marketingPixels.setContext(true, window.location.pathname);
        marketingPixels.configure(freshConfig);
      }).catch(() => {
        // A missing configuration response keeps every provider off.
      });
      return;
    }

    marketingPixels.setContext(true, pathname);
    if (marketingConfigReadyRef.current && marketingConfig.data) {
      marketingPixels.configure(marketingConfig.data);
    }
  }, [consent, consentSource, marketingConfig.data, marketingConfig.isError, marketingEligible, pathname]);

  useEffect(() => () => {
    marketingRequestGenerationRef.current += 1;
    marketingContextActiveRef.current = false;
    marketingConfigReadyRef.current = false;
    marketingPixels.setContext(false, window.location.pathname);
  }, []);

  // Fire consent_banner_viewed once when banner appears
  useEffect(() => {
    if (visible && !bannerViewedRef.current) {
      bannerViewedRef.current = true;
      // Banner shown — fire after a brief delay in case the user has consent already in another tab
      const saved = reconcileConsentUi(setConsent, setVisible);
      if (saved === "analytics" || saved === "marketing") {
        sendConsentedEvent("consent_banner_viewed");
      }
    }
  }, [visible]);

  // Page view + session_started on navigation
  useEffect(() => {
    const hasMeasurementConsent = consent === "analytics" || consent === "marketing";
    if (!hasMeasurementConsent) return;

    if (pageViewNeedsRecording(pathname)) {
      const sendSucceeded = sendConsentedEvent("page_view");
      recordPageView(pathname, sendSucceeded);
      if (!sendSucceeded) {
        // The sender may have synchronously observed a cross-tab revocation;
        // only a successful consent-aware send records this pathname.
        return;
      }
    }

    // sessionStorage shares this marker across normal reloads. The in-memory
    // marker prevents blocked/unavailable sessionStorage from sending again
    // on each navigation or consent re-render.
    const alreadyFired = inMemorySessionStarted || Boolean(storageGet("session", SESSION_FIRED_KEY));
    if (alreadyFired) {
      inMemorySessionStarted = true;
    } else if (sendConsentedEvent("session_started")) {
      inMemorySessionStarted = true;
      storageSet("session", SESSION_FIRED_KEY, "1");
    }
  }, [consent, pathname]);

  useEffect(() => {
    const syncConsent = (event: StorageEvent) => {
      if (event.key && event.key !== CONSENT_KEY) return;
      const persisted = persistedConsent();
      if (persisted.requiresRegionValidation && !persisted.consent) {
        setVisible(false);
        requestRegionResolution((request) => request + 1);
        return;
      }
      reconcileConsentUi(setConsent, setVisible);
    };

    window.addEventListener("storage", syncConsent);
    return () => window.removeEventListener("storage", syncConsent);
  }, []);

  // Reopen on privacy-choices event
  useEffect(() => {
    const reopen = () => setVisible(true);
    window.addEventListener("soso:open-privacy-choices", reopen);
    return () => window.removeEventListener("soso:open-privacy-choices", reopen);
  }, []);

  // Active-time heartbeat
  useActiveTimeHeartbeat(consent, true, pathname);

  // Scroll depth
  useScrollDepth(consent, pathname);

  const save = async (state: ConsentState, source: "banner" | "region_default" = "banner") => {
    const previousConsent = consentSource;
    const saveGeneration = consentSaveGenerationRef.current + 1;
    consentSaveGenerationRef.current = saveGeneration;
    setVisible(false);
    if (state === "essential_only" && (previousConsent === "analytics" || previousConsent === "marketing")) {
      sendConsentedEvent("marketing_opt_out");
    }
    if (previousConsent === "marketing" && state !== "marketing") {
      // Withdrawal is synchronously authoritative. No route change, cached
      // query result, or older consent request may reopen the vendor gate.
      marketingRequestGenerationRef.current += 1;
      marketingContextActiveRef.current = false;
      marketingConfigReadyRef.current = false;
      marketingPixels.setContext(false, window.location.pathname);
      storageSet("local", CONSENT_KEY, state);
      updateConsentSource(state);
      setConsent(state);
    }

    if (state === "essential_only") {
      regionDefaultValidated = false;
      storageSet("local", CONSENT_SOURCE_KEY, "banner");
      storageSet("local", CONSENT_KEY, state);
      updateConsentSource(state);
      setConsent(state);
      void fetch(apiUrl("/consent"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anonymousId: visitorId(),
          state,
          policyVersion: "draft-2026-08-21",
          source,
        }),
      }).catch(() => {});
      return;
    }

    try {
      const response = await fetch(apiUrl("/consent"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anonymousId: visitorId(),
          state,
          policyVersion: "draft-2026-08-21",
          source,
        }),
      });
      if (!response.ok) throw new Error("Consent could not be recorded");
      if (consentSaveGenerationRef.current !== saveGeneration) return;
      regionDefaultValidated = source === "region_default";
      storageSet("local", CONSENT_SOURCE_KEY, source);
      storageSet("local", CONSENT_KEY, state);
      updateConsentSource(state);
      persistFirstTouchAttribution(landingAttributionRef.current ?? capturedAttribution());
      setConsent(state);
      // Fire consent_updated if changing an existing preference
      if (previousConsent && previousConsent !== state) {
        sendConsentedEvent("consent_updated", { previous: previousConsent, current: state });
      }
    } catch {
      if (consentSaveGenerationRef.current !== saveGeneration) return;
      if (source === "region_default") {
        regionDefaultValidated = false;
        storageRemove("local", CONSENT_SOURCE_KEY);
        updateConsentSource(null);
        setConsent(null);
        setVisible(true);
        return;
      }
      storageSet("local", CONSENT_KEY, "essential_only");
      updateConsentSource("essential_only");
      setConsent("essential_only");
      setVisible(true);
    }
  };

  useEffect(() => {
    const persisted = persistedConsent();
    const saved = reconcileConsentSource();
    setConsent(saved);
    setVisible(false);
    // Keep the landing campaign in memory only. It becomes session storage
    // only after measurement is allowed.
    landingAttributionRef.current = capturedAttribution();
    if (saved && !persisted.requiresRegionValidation) return undefined;

    const controller = new AbortController();
    void fetch(apiUrl("/privacy/consent-region"), {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error("Consent region could not be resolved");
      const decision: unknown = await response.json();
      if (shouldAutomaticallyEnableAnalytics(decision)) {
        if (persisted.requiresRegionValidation) {
          regionDefaultValidated = true;
          updateConsentSource("analytics");
          setConsent("analytics");
          setVisible(false);
          return;
        }
        await save("analytics", "region_default");
        return;
      }
      if (persisted.requiresRegionValidation) {
        regionDefaultValidated = false;
        storageRemove("local", CONSENT_KEY);
        storageRemove("local", CONSENT_SOURCE_KEY);
        updateConsentSource(null);
        setConsent(null);
      }
      setVisible(true);
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setVisible(true);
    });

    return () => controller.abort();
  }, [regionResolutionRequest]);

  if (!visible || !platform.data) return null;
  const copy = platform.data.content.site.consent;

  return (
    <section
      aria-label={copy.regionLabel}
      aria-live="polite"
      role="region"
      className="fixed bottom-4 left-4 right-4 z-[100] mx-auto max-w-xl border border-border bg-background p-5 text-foreground shadow-[0_20px_60px_rgba(0,0,0,0.14)] md:left-auto"
    >
      <p className="soso-display text-xl">{copy.title}</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {copy.body}
      </p>
      <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]">
        <button
          onClick={() => void save("essential_only")}
          className="border border-foreground/30 px-4 py-3 text-foreground transition hover:bg-muted"
        >
          {copy.essentialLabel}
        </button>
        <button
          onClick={() => void save("analytics")}
          className="bg-foreground px-4 py-3 text-background transition hover:bg-foreground/85"
        >
          {copy.analyticsLabel}
        </button>
        <button
          onClick={() => void save("marketing")}
          className="border border-foreground/30 px-4 py-3 text-foreground transition hover:bg-muted"
        >
          {copy.marketingLabel}
        </button>
      </div>
      <details className="mt-3 text-[10px] text-muted-foreground">
        <summary className="cursor-pointer select-none hover:text-foreground">{copy.manageLabel}</summary>
        <div className="mt-2 space-y-2 border border-border p-3">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked disabled readOnly className="accent-[#b8912f]" />
            <span>{copy.necessaryDescription}</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={consent === "analytics" || consent === "marketing"}
              onChange={(e) => void save(e.target.checked ? "analytics" : "essential_only")}
              className="accent-[#b8912f]"
            />
            <span>{copy.measurementDescription}</span>
          </label>
           <label className="flex items-center gap-2">
             <input
               type="checkbox"
               checked={consent === "marketing"}
               onChange={(e) => void save(e.target.checked ? "marketing" : "analytics")}
               className="accent-[#b8912f]"
             />
              <span>{copy.marketingDescription}</span>
           </label>
        </div>
      </details>
      <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
         {copy.footerText}{" "}
         <a href={copy.privacyLink.href} className="underline hover:text-foreground">
           {copy.privacyLink.label}
        </a>
      </p>
    </section>
  );
}
