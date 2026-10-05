import { isDeepStrictEqual } from "node:util";
import type { JusticeSureFulfillment } from "./justicesureCommerce";

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const result = value.trim();
  return result && result.length <= max ? result : undefined;
}

/** Delivery is Nigeria-only; do not infer international readiness from discovery. */
export function domesticFulfillment(value: unknown): JusticeSureFulfillment | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (input.type === "pickup") {
    const locationId = text(input.locationId, 64);
    if (!locationId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(locationId)
      || (input.destinationCountry !== undefined && input.destinationCountry !== "NG")
      || input.shippingAddress !== undefined || input.address !== undefined) return null;
    return { type: "pickup", locationId };
  }
  if (input.type !== "delivery" || input.destinationCountry !== "NG" || input.locationId !== undefined) return null;
  const raw = input.shippingAddress;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const address = raw as Record<string, unknown>;
  const region = text(address.region, 80);
  const city = text(address.city, 120);
  const recipientName = text(address.recipientName, 160);
  const recipientPhone = text(address.recipientPhone, 80);
  const postalCode = typeof address.postalCode === "string" ? address.postalCode.trim() : undefined;
  if (address.country !== "NG" || !region || !city || !recipientName || !recipientPhone
    || postalCode === undefined || !/^(?:[0-9]{6})?$/.test(postalCode)
    || !Array.isArray(address.addressLines) || address.addressLines.length < 1 || address.addressLines.length > 3) return null;
  const addressLines = address.addressLines.map((line) => text(line, 250));
  if (addressLines.some((line) => !line)) return null;
  const deliveryInstructions = address.deliveryInstructions === undefined ? undefined : text(address.deliveryInstructions, 1_000);
  if (address.deliveryInstructions !== undefined && !deliveryInstructions) return null;
  const canonicalAddress = [...addressLines, city, region, "Nigeria"].join(", ");
  // Bind any supplied flat address to the same structured destination.
  if (input.address !== undefined && input.address !== canonicalAddress) return null;
  return {
    type: "delivery", destinationCountry: "NG", address: canonicalAddress,
    shippingAddress: {
      country: "NG", region, city, postalCode, addressLines: addressLines as string[],
      recipientName, recipientPhone, ...(deliveryInstructions ? { deliveryInstructions } : {}),
    },
  };
}

export function domesticFulfillmentOptions(options: readonly string[], country = "NG"): Array<"pickup" | "delivery"> {
  if (country !== "NG") return [];
  return (["pickup", "delivery"] as const).filter((option) => options.includes(option));
}

export function fulfillmentUnavailable(
  fulfillment: JusticeSureFulfillment,
  options: readonly string[],
  validPickupLocation: boolean,
): string | null {
  if (fulfillment.type === "delivery") {
    return fulfillment.destinationCountry === "NG" && fulfillment.shippingAddress?.country === "NG" && options.includes("delivery")
      ? null : "Domestic delivery is not enabled for this SOSO store. Choose collection instead. No payment has been taken.";
  }
  return options.includes("pickup") && validPickupLocation
    ? null : "Select the current valid SOSO HQ pickup location. No payment has been taken.";
}

export function deliveryQuoteMatches(actual: Record<string, unknown>, expected: JusticeSureFulfillment): boolean {
  if (expected.type !== "delivery") return true;
  if (actual.destinationCountry !== "NG" || !actual.shippingAddress || typeof actual.shippingAddress !== "object") return false;
  const address = actual.shippingAddress as Record<string, unknown>;
  const fields = expected.shippingAddress!;
  return Object.entries(fields).every(([key, value]) => isDeepStrictEqual(address[key], value))
    && (address.deliveryInstructions ?? "") === (fields.deliveryInstructions ?? "");
}
