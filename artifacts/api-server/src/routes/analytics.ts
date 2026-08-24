import { Router, type IRouter } from "express";
import { createHash } from "node:crypto";
import {
  RecordAnalyticsEventBody,
  RecordAnalyticsEventResponse,
  RecordConsentBody,
  RecordConsentResponse,
  isTrackableStorefrontPath,
} from "@workspace/api-zod";
import {
  analyticsEventsTable,
  consentRecordsTable,
  db,
  rateLimitBucketsTable,
} from "@workspace/db";
import { desc, eq, lt, sql } from "drizzle-orm";

const router: IRouter = Router();
const RATE_WINDOW_MS = 60_000;
const MAX_EVENTS_PER_IP_WINDOW = 600;
const MAX_EVENTS_PER_ANONYMOUS_WINDOW = 120;
const MAX_PRECONSENT_EVENTS_PER_IP_WINDOW = MAX_EVENTS_PER_IP_WINDOW;
const MAX_CONSENT_PER_IP_WINDOW = 40;
const MAX_CONSENT_PER_ANONYMOUS_WINDOW = 6;
const MAX_EVENT_FUTURE_MS = 5 * 60_000;
const MAX_EVENT_AGE_MS = 31 * 24 * 60 * 60_000;

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

  const now = Date.now();
  const occurredAt = parsed.data.occurredAt.getTime();
  if (occurredAt > now + MAX_EVENT_FUTURE_MS || occurredAt < now - MAX_EVENT_AGE_MS) {
    res.status(400).json({ error: "Analytics event timestamp is outside the accepted window" });
    return;
  }

  if (!isTrackableStorefrontPath(parsed.data.path)) {
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
    .select({ state: consentRecordsTable.state })
    .from(consentRecordsTable)
    .where(eq(consentRecordsTable.anonymousId, parsed.data.anonymousId))
    .orderBy(desc(consentRecordsTable.createdAt))
    .limit(1);

  if (!latestConsent || latestConsent.state !== parsed.data.consent) {
    res.status(403).json({ error: "Measurement consent has not been recorded" });
    return;
  }

  if (
    (await consumeRateLimit("events:ip", req.ip ?? "unknown", MAX_EVENTS_PER_IP_WINDOW)) ||
    (await consumeRateLimit("events:anonymous", parsed.data.anonymousId, MAX_EVENTS_PER_ANONYMOUS_WINDOW))
  ) {
    res.status(429).json({ error: "Too many measurement events" });
    return;
  }

  // Enrich with server-side country from Cloudflare or CDN headers (never from untrusted client input)
  const country = (req.headers["cf-ipcountry"] as string | undefined)
    ?? (req.headers["x-country"] as string | undefined);
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

  const [record] = await db
    .insert(consentRecordsTable)
    .values({ ...parsed.data, source: "storefront" })
    .returning();

  res.status(201).json(RecordConsentResponse.parse(record));
});

export default router;