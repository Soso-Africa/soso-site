import { isTrackableStorefrontPath } from "@workspace/api-zod";

const MAX_EVENT_FUTURE_MS = 5 * 60_000;
const MAX_EVENT_AGE_MS = 31 * 24 * 60 * 60_000;

export type AnalyticsEventValidationInput = {
  occurredAt: Date;
  path: string;
};

/**
 * Returns the API error for a timestamp or path that should not be stored.
 * Consent and body-shape validation remain in the route's generated schema.
 */
export function validateAnalyticsEvent(
  event: AnalyticsEventValidationInput,
  now = Date.now(),
): "timestamp" | "path" | null {
  const occurredAt = event.occurredAt.getTime();
  if (occurredAt > now + MAX_EVENT_FUTURE_MS || occurredAt < now - MAX_EVENT_AGE_MS) {
    return "timestamp";
  }

  if (!isTrackableStorefrontPath(event.path)) {
    return "path";
  }

  return null;
}