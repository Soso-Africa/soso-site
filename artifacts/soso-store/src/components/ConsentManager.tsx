import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";

type ConsentState = "essential_only" | "analytics" | "marketing";
export type StorefrontEventName =
  | "page_view"
  | "session_started"
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
const EVENT_VERSION = 1;

function apiUrl(path: string): string {
  const configuredBase = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "");
  return `${configuredBase ?? ""}/api${path}`;
}

function visitorId(): string {
  const saved = localStorage.getItem(VISITOR_KEY);
  if (saved) return saved;
  const id = crypto.randomUUID();
  localStorage.setItem(VISITOR_KEY, id);
  return id;
}

function sessionId(): string {
  const saved = sessionStorage.getItem(SESSION_KEY);
  if (saved) return saved;
  const id = crypto.randomUUID();
  sessionStorage.setItem(SESSION_KEY, id);
  return id;
}

function readConsent(): ConsentState | null {
  const saved = localStorage.getItem(CONSENT_KEY);
  return saved === "essential_only" || saved === "analytics" || saved === "marketing"
    ? saved
    : null;
}

function sendEvent(
  consent: Exclude<ConsentState, "essential_only">,
  eventName: StorefrontEventName,
  properties?: Record<string, unknown>,
) {
  const params = new URLSearchParams(window.location.search);
  void fetch(apiUrl("/analytics/events"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventId: crypto.randomUUID(),
      eventVersion: EVENT_VERSION,
      anonymousId: visitorId(),
      sessionId: sessionId(),
      eventName,
      path: window.location.pathname,
      referrer: document.referrer || undefined,
      source: params.get("utm_source") || undefined,
      utmMedium: params.get("utm_medium") || undefined,
      utmCampaign: params.get("utm_campaign") || undefined,
      deviceType: window.innerWidth < 768 ? "mobile" : window.innerWidth < 1100 ? "tablet" : "desktop",
      consent,
      properties,
      occurredAt: new Date().toISOString(),
    }),
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

/** Active-time heartbeat: tracks visible time on page. */
function useActiveTimeHeartbeat(consent: ConsentState | null, enabled: boolean) {
  const visibleSinceRef = useRef<number | null>(null);
  const accumulatedRef = useRef(0);

  useEffect(() => {
    if (!enabled || (consent !== "analytics" && consent !== "marketing")) return;

    const onVisible = () => {
      visibleSinceRef.current = performance.now();
    };
    const onHidden = () => {
      if (visibleSinceRef.current !== null) {
        accumulatedRef.current += performance.now() - visibleSinceRef.current;
        visibleSinceRef.current = null;
      }
    };

    if (!document.hidden) visibleSinceRef.current = performance.now();

    document.addEventListener("visibilitychange", () => {
      document.hidden ? onHidden() : onVisible();
    });

    return () => {
      onHidden();
      accumulatedRef.current = 0;
    };
  }, [consent, enabled]);
}

/** Scroll-depth tracker: fires at 25 / 50 / 75 / 90% once per page. */
function useScrollDepth(consent: ConsentState | null) {
  useEffect(() => {
    if (consent !== "analytics" && consent !== "marketing") return;

    const firedDepths = new Set<number>(
      JSON.parse(sessionStorage.getItem(SCROLL_DEPTHS_KEY) ?? "[]") as number[],
    );
    const thresholds = [25, 50, 75, 90];

    const check = () => {
      const scrolled = window.scrollY + window.innerHeight;
      const total = document.documentElement.scrollHeight;
      const pct = total > 0 ? (scrolled / total) * 100 : 0;

      for (const t of thresholds) {
        if (pct >= t && !firedDepths.has(t)) {
          firedDepths.add(t);
          sessionStorage.setItem(SCROLL_DEPTHS_KEY, JSON.stringify([...firedDepths]));
          trackStorefrontEvent("scroll_depth_reached", { depth_pct: t, path: window.location.pathname });
        }
      }
    };

    window.addEventListener("scroll", check, { passive: true });
    return () => window.removeEventListener("scroll", check);
  }, [consent]);
}

export function ConsentManager() {
  const [consent, setConsent] = useState<ConsentState | null>(null);
  const [visible, setVisible] = useState(false);
  const [pathname] = useLocation();
  const bannerViewedRef = useRef(false);

  useEffect(() => {
    const saved = readConsent();
    setConsent(saved);
    setVisible(!saved);
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
    const alreadyFired = sessionStorage.getItem(SESSION_FIRED_KEY);
    if (!alreadyFired) {
      sessionStorage.setItem(SESSION_FIRED_KEY, "1");
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
  useActiveTimeHeartbeat(consent, true);

  // Scroll depth
  useScrollDepth(consent);

  const save = async (state: ConsentState) => {
    const previousConsent = readConsent();
    setVisible(false);

    if (state === "essential_only") {
      localStorage.setItem(CONSENT_KEY, state);
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
      localStorage.setItem(CONSENT_KEY, state);
      setConsent(state);
      // Fire consent_updated if changing an existing preference
      if (previousConsent && previousConsent !== state) {
        sendEvent(state, "consent_updated", { previous: previousConsent, current: state });
      }
    } catch {
      localStorage.setItem(CONSENT_KEY, "essential_only");
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
