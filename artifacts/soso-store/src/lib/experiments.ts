/**
 * Local, fail-closed experiment configuration.
 *
 * This module deliberately has no tracking, provider, storage, or rendering side
 * effects. A caller must opt an experiment into a product surface separately;
 * while `enabled` is false no anonymous identifier is read or bucketed.
 */
export type ExperimentId = "purchase_confidence_placement";
export type ExperimentStatus = "disabled" | "enabled" | "paused" | "stopped";
export type ExperimentVariantId = "control" | "treatment";

export type ExperimentVariant = Readonly<{
  id: ExperimentVariantId;
  label: string;
  allocation: number;
}>;

export type ExperimentStoppingRule = Readonly<{
  minimumConsentedParticipants: number;
  minimumRuntimeDays: number;
  maximumRuntimeDays: number;
  decision: string;
}>;

export type ExperimentGuardrail = Readonly<{
  metric: "payment_failure_rate" | "refund_request_rate" | "support_contact_rate" | "page_speed";
  trigger: string;
  response: "pause_and_review";
}>;

export type ExperimentDefinition = Readonly<{
  id: ExperimentId;
  name: string;
  hypothesis: string;
  status: ExperimentStatus;
  enabled: boolean;
  owner: "owner_and_analyst";
  variants: readonly ExperimentVariant[];
  stoppingRule: ExperimentStoppingRule;
  guardrails: readonly ExperimentGuardrail[];
  reportingSegments: readonly ("mobile" | "desktop")[];
  activationRequirements: readonly string[];
  measurementNote: string;
}>;

const registry = [
  {
    id: "purchase_confidence_placement",
    name: "Purchase confidence placement",
    hypothesis: "Moving the existing approved confidence strip may improve purchase confidence without worsening payment, support, refund, or speed guardrails.",
    status: "disabled",
    enabled: false,
    owner: "owner_and_analyst",
    variants: [
      { id: "control", label: "Current approved placement", allocation: 0.5 },
      { id: "treatment", label: "Candidate placement; no copy change", allocation: 0.5 },
    ],
    stoppingRule: {
      minimumConsentedParticipants: 500,
      minimumRuntimeDays: 14,
      maximumRuntimeDays: 28,
      decision: "Stop at the maximum runtime, or after the minimum sample and runtime when the predeclared decision review is complete.",
    },
    guardrails: [
      { metric: "payment_failure_rate", trigger: "Any material increase versus control.", response: "pause_and_review" },
      { metric: "refund_request_rate", trigger: "Any material increase versus control.", response: "pause_and_review" },
      { metric: "support_contact_rate", trigger: "Any material increase versus control.", response: "pause_and_review" },
      { metric: "page_speed", trigger: "Any regression in the approved performance budget.", response: "pause_and_review" },
    ],
    reportingSegments: ["mobile", "desktop"],
    activationRequirements: [
      "Live payment and a verified conversion source are available.",
      "An owner approves the hypothesis, treatment placement, and unchanged approved copy.",
      "Consented traffic is sufficient for the predeclared sample and runtime.",
      "A reviewer is assigned to monitor every guardrail.",
    ],
    measurementNote: "No experiment-specific analytics are collected by this registry. Any future analysis must use the existing consented first-party reporting process.",
  },
] as const satisfies readonly ExperimentDefinition[];

export const experimentRegistry: readonly ExperimentDefinition[] = registry;

export type ExperimentAssignment =
  | Readonly<{ kind: "inactive"; experimentId: ExperimentId }>
  | Readonly<{ kind: "assigned"; experimentId: ExperimentId; variantId: ExperimentVariantId }>;

function hashBucket(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0x1_0000_0000;
}

/**
 * Assigns a stable anonymous bucket only for an explicitly enabled experiment.
 * Disabled, paused, and stopped definitions return before hashing the ID.
 */
export function assignExperiment(experimentId: ExperimentId, anonymousId: string): ExperimentAssignment {
  const experiment = experimentRegistry.find((candidate) => candidate.id === experimentId);
  if (!experiment || !experiment.enabled || experiment.status !== "enabled") {
    return { kind: "inactive", experimentId };
  }

  const bucket = hashBucket(`${experiment.id}:${anonymousId}`);
  let cumulativeAllocation = 0;
  for (const variant of experiment.variants) {
    cumulativeAllocation += variant.allocation;
    if (bucket < cumulativeAllocation) {
      return { kind: "assigned", experimentId, variantId: variant.id };
    }
  }

  // Definitions must cover the entire bucket range before they are enabled.
  return { kind: "inactive", experimentId };
}