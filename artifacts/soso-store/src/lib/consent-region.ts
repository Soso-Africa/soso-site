export type ConsentRegionDecision = {
  region: "regulated" | "non_regulated" | "unknown";
  consentRequired: boolean;
};

export function shouldAutomaticallyEnableAnalytics(value: unknown): value is ConsentRegionDecision {
  if (!value || typeof value !== "object") return false;
  const decision = value as Partial<ConsentRegionDecision>;
  return decision.region === "non_regulated" && decision.consentRequired === false;
}

export function isRegionDefaultAnalytics(
  consent: string | null,
  source: string | null,
): boolean {
  return consent === "analytics" && source === "region_default";
}