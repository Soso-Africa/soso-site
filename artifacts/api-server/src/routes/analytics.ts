import { Router, type IRouter } from "express";
import {
  RecordAnalyticsEventBody,
  RecordAnalyticsEventResponse,
  RecordConsentBody,
  RecordConsentResponse,
} from "@workspace/api-zod";
import { analyticsEventsTable, consentRecordsTable, db } from "@workspace/db";

const router: IRouter = Router();

router.post("/analytics/events", async (req, res): Promise<void> => {
  const parsed = RecordAnalyticsEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid analytics event" });
    return;
  }

  await db.insert(analyticsEventsTable).values(parsed.data);
  res.status(202).json(RecordAnalyticsEventResponse.parse({ accepted: true }));
});

router.post("/consent", async (req, res): Promise<void> => {
  const parsed = RecordConsentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid consent decision" });
    return;
  }

  const [record] = await db
    .insert(consentRecordsTable)
    .values({ ...parsed.data, source: "storefront" })
    .returning();

  res.status(201).json(RecordConsentResponse.parse(record));
});

export default router;