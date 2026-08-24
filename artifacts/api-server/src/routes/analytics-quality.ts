import {
  GetStaffAnalyticsQualityResponse,
  type AnalyticsQualityCheck,
} from "@workspace/api-zod";

export const QUALITY_EVENT_LIMIT = 10_000;

export type AnalyticsQualityJourneyRow = {
  sessionId: string | null;
  eventName: string;
  occurredAt: Date;
};

export type AnalyticsQualityFixture = {
  events24h: number;
  events7d: number;
  invalidPathCount: number;
  attributionCount: number;
  futureTimestampCount: number;
  journeyRows: AnalyticsQualityJourneyRow[];
  burstCount: number;
  generatedAt?: Date;
};

/**
 * Turns aggregate query results into the privacy-safe staff quality contract.
 * Raw visitor and session identifiers are used only to evaluate ordering; they
 * are intentionally absent from the returned report.
 */
export function buildAnalyticsQualityReport(fixture: AnalyticsQualityFixture) {
  const {
    events24h,
    events7d,
    invalidPathCount,
    attributionCount,
    futureTimestampCount,
    journeyRows,
    burstCount,
  } = fixture;
  const avgDaily = events7d / 7;
  const checks: AnalyticsQualityCheck[] = [];

  if (avgDaily > 0 && events24h > avgDaily * 5) {
    checks.push({
      check: "volume_spike",
      status: "review",
      detail: `Last 24 h events (${events24h}) are ${Math.round(events24h / avgDaily)}× the 7-day daily average (${Math.round(avgDaily)}).`,
      scope: "Consented events in the last 24 hours versus seven days.",
      nextAction: "Review campaign launches and deployment logs before using this period for decisions.",
    });
  } else {
    checks.push({
      check: "volume_spike",
      status: "ok",
      detail: `Event volume looks normal. Last 24 h: ${events24h}; 7-day daily avg: ${Math.round(avgDaily)}.`,
      scope: "Consented events in the last 24 hours versus seven days.",
      nextAction: "No action needed.",
    });
  }

  if (events7d < 10) {
    checks.push({
      check: "signal_volume",
      status: "review",
      detail: `Only ${events7d} consented events in the last 7 days — funnel data is not yet statistically meaningful.`,
      scope: "All consented events in the last seven days.",
      nextAction: "Wait for more consented traffic before treating trends as directional.",
    });
  } else {
    checks.push({
      check: "signal_volume",
      status: "ok",
      detail: `${events7d} consented events in the last 7 days.`,
      scope: "All consented events in the last seven days.",
      nextAction: "No action needed.",
    });
  }

  checks.push(
    invalidPathCount
      ? {
          check: "storefront_paths",
          status: "issue",
          detail: `${invalidPathCount} stored event${invalidPathCount === 1 ? "" : "s"} used a malformed path or a private storefront surface.`,
          scope: "Consented events in the last seven days.",
          nextAction: "Inspect the originating release before using affected path reports.",
        }
      : {
          check: "storefront_paths",
          status: "ok",
          detail: "All recent consented events use valid public storefront pathnames, including newly launched pages.",
          scope: "Consented events in the last seven days.",
          nextAction: "No action needed.",
        },
  );

  checks.push(
    attributionCount
      ? {
          check: "attribution_completeness",
          status: "review",
          detail: `${attributionCount} event${attributionCount === 1 ? "" : "s"} included a UTM medium or campaign without a source.`,
          scope: "Consented events in the last seven days with UTM fields.",
          nextAction: "Correct campaign links so source, medium, and campaign travel together.",
        }
      : {
          check: "attribution_completeness",
          status: "ok",
          detail: "No incomplete UTM attribution combinations were found.",
          scope: "Consented events in the last seven days with UTM fields.",
          nextAction: "No action needed.",
        },
  );

  checks.push(
    futureTimestampCount
      ? {
          check: "time_sanity",
          status: "issue",
          detail: `${futureTimestampCount} stored event${futureTimestampCount === 1 ? "" : "s"} is timestamped more than five minutes in the future.`,
          scope: "All consented stored events.",
          nextAction: "Investigate client clock or ingestion behavior before interpreting time-based reports.",
        }
      : {
          check: "time_sanity",
          status: "ok",
          detail: "No stored consented events are more than five minutes ahead of server time.",
          scope: "All consented stored events; new stale and future events are rejected at ingestion.",
          nextAction: "No action needed.",
        },
  );

  const journeyStates = new Map<
    string,
    { productViewed: boolean; addedToBag: boolean; checkoutStarted: boolean }
  >();
  let outOfOrderEvents = 0;
  for (const event of journeyRows.slice(0, QUALITY_EVENT_LIMIT)) {
    if (!event.sessionId) continue;
    const state = journeyStates.get(event.sessionId) ?? {
      productViewed: false,
      addedToBag: false,
      checkoutStarted: false,
    };
    if (event.eventName === "product_view") state.productViewed = true;
    if (event.eventName === "add_to_bag") {
      if (!state.productViewed) outOfOrderEvents += 1;
      state.addedToBag = true;
    }
    if (event.eventName === "checkout_started") {
      if (!state.addedToBag) outOfOrderEvents += 1;
      state.checkoutStarted = true;
    }
    if (event.eventName === "payment_clicked" && !state.checkoutStarted) {
      outOfOrderEvents += 1;
    }
    journeyStates.set(event.sessionId, state);
  }
  const journeySampled = journeyRows.length > QUALITY_EVENT_LIMIT;
  checks.push(
    outOfOrderEvents || journeySampled
      ? {
          check: "journey_order",
          status: "review",
          detail: `${outOfOrderEvents} event${outOfOrderEvents === 1 ? "" : "s"} did not have its expected preceding journey signal${journeySampled ? "; the seven-day review hit its sampling limit" : ""}.`,
          scope: "Product view → add to bag → checkout start → payment click, evaluated per session over the last seven days.",
          nextAction: "Review the affected client release and use funnel rates cautiously until the sequence is clean.",
        }
      : {
          check: "journey_order",
          status: "ok",
          detail: "Recent sampled journeys follow the expected storefront sequence.",
          scope: "Product view → add to bag → checkout start → payment click, evaluated per session over the last seven days.",
          nextAction: "No action needed.",
        },
  );

  checks.push(
    burstCount
      ? {
          check: "automation_bursts",
          status: "review",
          detail: `${burstCount} session-minute bucket${burstCount === 1 ? "" : "s"} exceeded 60 consented events.`,
          scope: "Consented sessions in the last 24 hours; identifiers are not exposed.",
          nextAction: "Review release behavior and traffic patterns; exclude confirmed internal or automated traffic from decisions.",
        }
      : {
          check: "automation_bursts",
          status: "ok",
          detail: "No consented session exceeded 60 events in a one-minute bucket.",
          scope: "Consented sessions in the last 24 hours; identifiers are not exposed.",
          nextAction: "No action needed.",
        },
  );

  const status = checks.some((check) => check.status === "issue")
    ? "issue"
    : checks.some((check) => check.status === "review")
      ? "review"
      : "ok";

  return GetStaffAnalyticsQualityResponse.parse({
    status,
    checks,
    generatedAt: fixture.generatedAt ?? new Date(),
  });
}