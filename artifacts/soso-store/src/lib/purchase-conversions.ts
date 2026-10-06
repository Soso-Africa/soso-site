import { marketingPixels, isMarketingPixelEligiblePath } from "./marketing-pixels";
import { purchaseReceipt } from "./marketing-pixel-types";

let inFlight = false;
const PURCHASER_KEY = "soso-consented-purchaser-v1";

// No order IDs, return parameters, contact information or ownership tokens
// are read by this boundary. The HttpOnly cookie remains first-party only.
export async function checkVerifiedPurchase(apiBase: string, consent: () => string | null) {
  const allowed = () => consent() === "marketing"
    && isMarketingPixelEligiblePath(window.location.pathname)
    && marketingPixels.hasPurchaseDestination();
  if (!allowed() || inFlight) return;
  const generation = marketingPixels.getPurchaseGeneration();
  const stillAllowed = () => allowed() && generation === marketingPixels.getPurchaseGeneration();
  try {
    if (window.localStorage.getItem(PURCHASER_KEY) === "1") marketingPixels.suppressPurchaser();
  } catch { /* Runtime suppression still works with unavailable storage. */ }
  inFlight = true;
  try {
    const response = await fetch(`${apiBase}/payment/purchase-conversion`, {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marketingConsent: true, publicPath: window.location.pathname }),
    });
    if (!response.ok || !stillAllowed()) return;
    if (response.headers.get("X-SOSO-Verified-Purchaser") === "1") {
      marketingPixels.suppressPurchaser();
      try { window.localStorage.setItem(PURCHASER_KEY, "1"); } catch { /* No storage. */ }
    }
    if (response.status === 204) return;
    const receipt = purchaseReceipt(await response.json());
    if (!receipt || !stillAllowed()) return;
    marketingPixels.dispatchVerifiedPurchase(receipt);
    try { window.localStorage.setItem(PURCHASER_KEY, "1"); } catch { /* No durable browser storage. */ }
  } catch { /* Fail closed. A later public navigation can recheck verification. */ }
  finally { inFlight = false; }
}

export function clearPurchaserSuppression() {
  try { window.localStorage.removeItem(PURCHASER_KEY); } catch { /* No storage. */ }
}
