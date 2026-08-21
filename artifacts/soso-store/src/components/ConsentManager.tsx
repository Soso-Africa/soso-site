import { useEffect, useState } from "react";
import { useLocation } from "wouter";

type ConsentState = "essential_only" | "analytics" | "marketing";
export type StorefrontEventName =
  | "page_view"
  | "product_view"
  | "size_guide_opened"
  | "add_to_bag"
  | "cart_opened"
  | "checkout_started"
  | "checkout_payment_unavailable";

const CONSENT_KEY = "soso-consent-v1";
const VISITOR_KEY = "soso-visitor-id";

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
  void fetch(apiUrl("/analytics/events"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      anonymousId: visitorId(),
      eventName,
      path: window.location.pathname,
      referrer: document.referrer || undefined,
      deviceType: window.innerWidth < 768 ? "mobile" : window.innerWidth < 1100 ? "tablet" : "desktop",
      consent,
      properties,
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

export function ConsentManager() {
  const [consent, setConsent] = useState<ConsentState | null>(null);
  const [visible, setVisible] = useState(false);
  const [pathname] = useLocation();

  useEffect(() => {
    const saved = readConsent();
    setConsent(saved);
    setVisible(!saved);
  }, []);

  useEffect(() => {
    if (consent !== "analytics" && consent !== "marketing") return;

    sendEvent(consent, "page_view");
  }, [consent, pathname]);

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

  useEffect(() => {
    const reopen = () => setVisible(true);
    window.addEventListener("soso:open-privacy-choices", reopen);
    return () => window.removeEventListener("soso:open-privacy-choices", reopen);
  }, []);

  const save = async (state: ConsentState) => {
    setVisible(false);

    if (state === "essential_only") {
      localStorage.setItem(CONSENT_KEY, state);
      setConsent(state);
      void fetch(apiUrl("/consent"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anonymousId: visitorId(),
          state,
          policyVersion: "draft-2026-08-21",
        }),
      }).catch(() => {
        // This preference remains active locally even if the record cannot be saved.
      });
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
    } catch {
      // Do not begin optional measurement if affirmative consent was not recorded.
      localStorage.setItem(CONSENT_KEY, "essential_only");
      setConsent("essential_only");
      setVisible(true);
    }
  };

  if (!visible) return null;

  return (
    <section
      aria-label="Privacy choices"
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
          onClick={() => save("essential_only")}
          className="border border-[#b8912f]/70 px-4 py-3 text-[#f6f1e7] transition hover:bg-[#b8912f]/10"
        >
          Necessary only
        </button>
        <button
          onClick={() => save("analytics")}
          className="bg-[#b8912f] px-4 py-3 text-[#100e0b] transition hover:bg-[#d4b45a]"
        >
          Allow measurement
        </button>
      </div>
    </section>
  );
}