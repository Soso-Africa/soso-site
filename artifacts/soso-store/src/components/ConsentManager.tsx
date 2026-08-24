import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";

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
  | "faq_expanded"
  | "scroll_depth_reached"
  | "cta_clicked";

const CONSENT_KEY = "soso-consent-v1";
const VISITOR_KEY = "soso-visitor-id";
const SESSION_KEY = "soso-session-id";
const SESSION_FIRED_KEY = "soso-session-started-fired";
const SCROLL_DEPTHS_KEY = "soso-scroll-depths";
const ATTRIBUTION_KEY = "soso-first-touch-attribution";
const EVENT_VERSION = 1;
const MAX_ATTRIBUTION_VALUE_LENGTH = 120;
const MAX_EVENT_PROPERTY_KEYS = 30;
const MAX_EVENT_PROPERTY_ARRAY_ITEMS = 20;
const MAX_EVENT_PROPERTY_DEPTH = 3;
const MAX_EVENT_PROPERTY_STRING_LENGTH = 200;
const MAX_EVENT_PROPERTIES_BYTES = 8_000;
let inMemoryVisitorId: string | null = null;
let inMemorySessionId: string | null = null;

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

function readConsent(): ConsentState | null {
  const saved = storageGet("local", CONSENT_KEY);
  return saved === "essential_only" || saved === "analytics" || saved === "marketing"
    ? saved
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

function sendEvent(
  consent: Exclude<ConsentState, "essential_only">,
  eventName: StorefrontEventName,
  properties?: Record<string, unknown>,
  options?: SendEventOptions,
) {
  const attribution = firstTouchAttribution();
  const safeProperties = boundedProperties(properties);
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

export function trackStorefrontEvent(
  eventName: Exclude<StorefrontEventName, "page_view">,
  properties?: Record<string, unknown>,
) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("soso:storefront-event", {
      detail: { eventName, properties },
    }),
  );
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
      sendEvent(consent, "active_time_heartbeat", {
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
  const [consent, setConsent] = useState<ConsentState | null>(null);
  const [visible, setVisible] = useState(false);
  const [pathname] = useLocation();
  const bannerViewedRef = useRef(false);
  const landingAttributionRef = useRef<Attribution | null>(null);

  useEffect(() => {
    const saved = readConsent();
    setConsent(saved);
    setVisible(!saved);
    // Keep the landing campaign in memory only. It becomes session storage
    // only after the visitor has affirmatively chosen measurement.
    landingAttributionRef.current = capturedAttribution();
  }, []);

  // Fire consent_banner_viewed once when banner appears
  useEffect(() => {
    if (visible && !bannerViewedRef.current) {
      bannerViewedRef.current = true;
      // Banner shown — fire after a brief delay in case the user has consent already in another tab
      const saved = readConsent();
      if (saved === "analytics" || saved === "marketing") {
        sendEvent(saved, "consent_banner_viewed");
      }
    }
  }, [visible]);

  // Page view + session_started on navigation
  useEffect(() => {
    if (consent !== "analytics" && consent !== "marketing") return;
    sendEvent(consent, "page_view");

    // session_started fires once per session
    const alreadyFired = storageGet("session", SESSION_FIRED_KEY);
    if (!alreadyFired) {
      storageSet("session", SESSION_FIRED_KEY, "1");
      sendEvent(consent, "session_started");
    }
  }, [consent, pathname]);

  // Listen for tracked storefront events
  useEffect(() => {
    if (consent !== "analytics" && consent !== "marketing") return;

    const recordTrackedEvent = (event: Event) => {
      const detail = (event as CustomEvent<{
        eventName: Exclude<StorefrontEventName, "page_view">;
        properties?: Record<string, unknown>;
      }>).detail;
      if (detail?.eventName) sendEvent(consent, detail.eventName, detail.properties);
    };

    window.addEventListener("soso:storefront-event", recordTrackedEvent);
    return () => window.removeEventListener("soso:storefront-event", recordTrackedEvent);
  }, [consent]);

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

  const save = async (state: ConsentState) => {
    const previousConsent = readConsent();
    setVisible(false);

    if (state === "essential_only") {
       storageSet("local", CONSENT_KEY, state);
      // Fire marketing_opt_out if downgrading from analytics/marketing
      if (previousConsent === "analytics" || previousConsent === "marketing") {
        sendEvent(previousConsent, "marketing_opt_out");
      }
      setConsent(state);
      void fetch(apiUrl("/consent"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anonymousId: visitorId(),
          state,
          policyVersion: "draft-2026-08-21",
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
        }),
      });
      if (!response.ok) throw new Error("Consent could not be recorded");
       storageSet("local", CONSENT_KEY, state);
      persistFirstTouchAttribution(landingAttributionRef.current ?? capturedAttribution());
      setConsent(state);
      // Fire consent_updated if changing an existing preference
      if (previousConsent && previousConsent !== state) {
        sendEvent(state, "consent_updated", { previous: previousConsent, current: state });
      }
    } catch {
       storageSet("local", CONSENT_KEY, "essential_only");
      setConsent("essential_only");
      setVisible(true);
    }
  };

  if (!visible) return null;

  return (
    <section
      aria-label="Privacy choices"
      aria-live="polite"
      role="region"
      className="fixed bottom-4 left-4 right-4 z-[100] mx-auto max-w-xl border p-5 shadow-2xl md:left-auto"
      style={{
        background: "#17130e",
        borderColor: "rgba(184,145,47,0.45)",
        color: "#f6f1e7",
      }}
    >
      <p className="soso-display text-xl">Your privacy choices</p>
      <p className="mt-2 text-sm leading-6 text-[#d8ceb9]">
        Necessary storage keeps your bag and privacy choice working. Optional measurement helps SOSO understand which pages are useful; it stays off until you choose it.
      </p>
      <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]">
        <button
          onClick={() => void save("essential_only")}
          className="border border-[#b8912f]/70 px-4 py-3 text-[#f6f1e7] transition hover:bg-[#b8912f]/10"
        >
          Necessary only
        </button>
        <button
          onClick={() => void save("analytics")}
          className="bg-[#b8912f] px-4 py-3 text-[#100e0b] transition hover:bg-[#d4b45a]"
        >
          Allow measurement
        </button>
      </div>
      <details className="mt-3 text-[10px] text-[#a09070]">
        <summary className="cursor-pointer hover:text-[#c8b89a] select-none">Manage preference cookies</summary>
        <div className="mt-2 border border-[#b8912f]/20 p-3 space-y-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked disabled readOnly className="accent-[#b8912f]" />
            <span><strong>Necessary</strong> — bag, session, consent preference. Always active.</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={consent === "analytics" || consent === "marketing"}
              onChange={(e) => void save(e.target.checked ? "analytics" : "essential_only")}
              className="accent-[#b8912f]"
            />
            <span><strong>Measurement</strong> — anonymous page and product journey counts.</span>
          </label>
           <label className="flex items-center gap-2 opacity-70">
             <input type="checkbox" checked={false} disabled readOnly className="accent-[#b8912f]" />
             <span><strong>Marketing</strong> — no marketing technology or pixels are currently active.</span>
           </label>
        </div>
      </details>
      <p className="mt-3 text-[10px] text-[#a09070] leading-relaxed">
        You can change your choice at any time from the footer.{" "}
        <a href="/privacy" className="underline hover:text-[#f6f1e7]">
          Privacy notice
        </a>
      </p>
    </section>
  );
}
