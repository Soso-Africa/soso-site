import { Router, type IRouter } from "express";
import { createHash } from "node:crypto";
import {
  GetConsentRegionResponse,
  RecordAnalyticsEventBody,
  RecordAnalyticsEventResponse,
  RecordConsentBody,
  RecordConsentResponse,
} from "@workspace/api-zod";
import {
  analyticsEventsTable,
  consentRecordsTable,
  db,
  rateLimitBucketsTable,
} from "@workspace/db";
import { desc, eq, lt, sql } from "drizzle-orm";
import { validateAnalyticsEvent } from "./analytics-validation";
import { canRecordRegionDefaultConsent, classifyConsentRegion } from "./consent-region";

const router: IRouter = Router();
const RATE_WINDOW_MS = 60_000;
const MAX_EVENTS_PER_IP_WINDOW = 600;
const MAX_EVENTS_PER_ANONYMOUS_WINDOW = 120;
const MAX_PRECONSENT_EVENTS_PER_IP_WINDOW = MAX_EVENTS_PER_IP_WINDOW;
const MAX_CONSENT_PER_IP_WINDOW = 40;
const MAX_CONSENT_PER_ANONYMOUS_WINDOW = 6;

router.get("/privacy/consent-region", (req, res): void => {
  const classification = classifyConsentRegion(req.headers);
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Vary", "X-Vercel-IP-Country");
  res.json(GetConsentRegionResponse.parse({
    region: classification.region,
    consentRequired: classification.consentRequired,
  }));
});

async function consumeRateLimit(scope: string, identifier: string, limit: number): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + RATE_WINDOW_MS);
  const key = createHash("sha256").update(`${scope}:${identifier}`).digest("hex");

  await db.delete(rateLimitBucketsTable).where(lt(rateLimitBucketsTable.expiresAt, now));

  const [bucket] = await db
    .insert(rateLimitBucketsTable)
    .values({ key, requestCount: 1, expiresAt })
    .onConflictDoUpdate({
      target: rateLimitBucketsTable.key,
      set: {
        requestCount: sql<number>`case
          when ${rateLimitBucketsTable.expiresAt} <= ${now} then 1
          else ${rateLimitBucketsTable.requestCount} + 1
        end`,
        expiresAt: sql<Date>`case
          when ${rateLimitBucketsTable.expiresAt} <= ${now} then ${expiresAt}
          else ${rateLimitBucketsTable.expiresAt}
        end`,
      },
    })
    .returning({ requestCount: rateLimitBucketsTable.requestCount });

  return (bucket?.requestCount ?? 0) > limit;
}

router.post("/analytics/events", async (req, res): Promise<void> => {
  const parsed = RecordAnalyticsEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid analytics event" });
    return;
  }

  const validationError = validateAnalyticsEvent(parsed.data);
  if (validationError === "timestamp") {
    res.status(400).json({ error: "Analytics event timestamp is outside the accepted window" });
    return;
  }

  if (validationError === "path") {
    res.status(400).json({ error: "Analytics event path is not a valid public storefront pathname" });
    return;
  }

  if (parsed.data.consent !== "analytics" && parsed.data.consent !== "marketing") {
    res.status(403).json({ error: "Optional measurement requires affirmative consent" });
    return;
  }

  if (
    await consumeRateLimit(
      "events:preconsent-ip",
      req.ip ?? "unknown",
      MAX_PRECONSENT_EVENTS_PER_IP_WINDOW,
    )
  ) {
    res.status(429).json({ error: "Too many measurement events" });
    return;
  }
  const [latestConsent] = await db
    .select({
      state: consentRecordsTable.state,
      source: consentRecordsTable.source,
    })
    .from(consentRecordsTable)
    .where(eq(consentRecordsTable.anonymousId, parsed.data.anonymousId))
    .orderBy(desc(consentRecordsTable.createdAt))
    .limit(1);

  if (!latestConsent || latestConsent.state !== parsed.data.consent) {
    res.status(403).json({ error: "Measurement consent has not been recorded" });
    return;
  }
  if (
    latestConsent.source === "region_default"
    && classifyConsentRegion(req.headers).consentRequired
  ) {
    res.status(403).json({ error: "Automatic measurement is not valid in the current region" });
    return;
  }

  if (
    (await consumeRateLimit("events:ip", req.ip ?? "unknown", MAX_EVENTS_PER_IP_WINDOW)) ||
    (await consumeRateLimit("events:anonymous", parsed.data.anonymousId, MAX_EVENTS_PER_ANONYMOUS_WINDOW))
  ) {
    res.status(429).json({ error: "Too many measurement events" });
    return;
  }

  // Enrich with a validated country from trusted platform edge headers only.
  const country = classifyConsentRegion(req.headers).countryCode;
  const enrichedData = country
    ? { ...parsed.data, properties: { ...(parsed.data.properties ?? {}), _country: country } }
    : parsed.data;

  const [event] = await db
    .insert(analyticsEventsTable)
    .values(enrichedData)
    .onConflictDoNothing({ target: analyticsEventsTable.eventId })
    .returning({ id: analyticsEventsTable.id });

  res.status(event ? 202 : 200).json(RecordAnalyticsEventResponse.parse({ accepted: Boolean(event) }));
});

router.post("/consent", async (req, res): Promise<void> => {
  const parsed = RecordConsentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid consent decision" });
    return;
  }

  if (
    (await consumeRateLimit("consent:ip", req.ip ?? "unknown", MAX_CONSENT_PER_IP_WINDOW)) ||
    (await consumeRateLimit("consent:anonymous", parsed.data.anonymousId, MAX_CONSENT_PER_ANONYMOUS_WINDOW))
  ) {
    res.status(429).json({ error: "Too many consent requests" });
    return;
  }

  const classification = classifyConsentRegion(req.headers);
  if (
    parsed.data.source === "region_default"
    && !canRecordRegionDefaultConsent(parsed.data.state, classification)
  ) {
    res.status(403).json({ error: "Automatic measurement requires a verified non-regulated region" });
    return;
  }
  const { source, region: _untrustedRegion, ...consent } = parsed.data;
  const [record] = await db
    .insert(consentRecordsTable)
    .values({
      ...consent,
      region: classification.countryCode,
      source: source === "region_default" ? "region_default" : "storefront",
    })
    .returning();

  res.status(201).json(RecordConsentResponse.parse(record));
});

export default router;
