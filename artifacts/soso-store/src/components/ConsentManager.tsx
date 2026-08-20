import { useEffect, useState } from "react";

type ConsentState = "essential_only" | "analytics" | "marketing";

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

export function ConsentManager() {
  const [consent, setConsent] = useState<ConsentState | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const saved = readConsent();
    setConsent(saved);
    setVisible(!saved);
  }, []);

  useEffect(() => {
    if (consent !== "analytics" && consent !== "marketing") return;

    void fetch(apiUrl("/analytics/events"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        anonymousId: visitorId(),
        eventName: "page_view",
        path: window.location.pathname,
        referrer: document.referrer || undefined,
        deviceType: window.innerWidth < 768 ? "mobile" : window.innerWidth < 1100 ? "tablet" : "desktop",
        consent,
      }),
    }).catch(() => {
      // Analytics must never interrupt the store when the analytics service is unavailable.
    });
  }, [consent]);

  const save = (state: ConsentState) => {
    localStorage.setItem(CONSENT_KEY, state);
    setConsent(state);
    setVisible(false);

    void fetch(apiUrl("/consent"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        anonymousId: visitorId(),
        state,
        policyVersion: "v1-pending-legal-approval",
      }),
    }).catch(() => {
      // The preference remains stored locally and can be sent on a later visit.
    });
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