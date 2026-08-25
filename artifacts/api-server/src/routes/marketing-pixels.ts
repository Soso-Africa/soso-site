import { Router, type IRouter } from "express";
import {
  GetPublicMarketingPixelsResponse,
  GetStaffMarketingPixelsResponse,
  ListStaffMarketingPixelRevisionsResponse,
  UpdateStaffMarketingPixelsBody,
  UpdateStaffMarketingPixelsResponse,
} from "@workspace/api-zod";
import {
  auditLogsTable,
  db,
  marketingPixelSettingRevisionsTable,
  marketingPixelSettingsTable,
} from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireStaff, requireStaffRoles } from "../middlewares/staff";

const router: IRouter = Router();
const SETTINGS_KEY = "storefront";

const providerSetting = (label: string, pattern: RegExp, example: string) => z.object({
  pixelId: z.string()
    .trim()
    .regex(pattern, `${label} must match ${example}`)
    .nullable(),
  enabled: z.boolean(),
}).strict().superRefine((value, ctx) => {
  if (value.enabled && !value.pixelId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["pixelId"],
      message: `${label} is required before this provider can be enabled`,
    });
  }
});

export const MarketingPixelSettingsSchema = z.object({
  schemaVersion: z.literal(1),
  meta: providerSetting("Meta Pixel ID", /^[0-9]{5,20}$/, "5–20 digits"),
  googleAds: providerSetting("Google Ads tag ID", /^AW-[0-9]{6,20}$/, "AW- followed by 6–20 digits"),
  x: providerSetting("X/Twitter Pixel ID", /^[A-Za-z0-9]{5,20}$/, "5–20 letters or digits"),
  tiktok: providerSetting("TikTok Pixel ID", /^[A-Za-z0-9]{10,30}$/, "10–30 letters or digits"),
}).strict();

export type MarketingPixelSettingsDocument = z.infer<typeof MarketingPixelSettingsSchema>;

export const DEFAULT_MARKETING_PIXEL_SETTINGS: MarketingPixelSettingsDocument = {
  schemaVersion: 1,
  meta: { pixelId: null, enabled: false },
  googleAds: { pixelId: null, enabled: false },
  x: { pixelId: null, enabled: false },
  tiktok: { pixelId: null, enabled: false },
};

export function publicMarketingPixelSettings(
  settings: unknown,
  revision = 0,
) {
  const parsed = MarketingPixelSettingsSchema.safeParse(settings);
  if (!parsed.success) {
    return {
      schemaVersion: 1 as const,
      revision: 0,
      providers: { meta: null, googleAds: null, x: null, tiktok: null },
    };
  }
  const provider = (value: { pixelId: string | null; enabled: boolean }) => (
    value.enabled && value.pixelId ? { pixelId: value.pixelId } : null
  );
  return {
    schemaVersion: 1 as const,
    revision,
    providers: {
      meta: provider(parsed.data.meta),
      googleAds: provider(parsed.data.googleAds),
      x: provider(parsed.data.x),
      tiktok: provider(parsed.data.tiktok),
    },
  };
}

function staffSettingsResponse(row?: {
  settings: Record<string, unknown>;
  revision: number;
  updatedAt: Date;
  updatedByClerkUserId: string;
}) {
  if (!row) {
    return {
      settings: DEFAULT_MARKETING_PIXEL_SETTINGS,
      revision: 0,
      updatedAt: null,
      updatedByClerkUserId: null,
    };
  }
  const parsed = MarketingPixelSettingsSchema.safeParse(row.settings);
  if (!parsed.success) return null;
  return {
    settings: parsed.data,
    revision: row.revision,
    updatedAt: row.updatedAt,
    updatedByClerkUserId: row.updatedByClerkUserId,
  };
}

export function marketingPixelAuditSummary(
  previous: MarketingPixelSettingsDocument,
  next: MarketingPixelSettingsDocument,
) {
  const providers = ["meta", "googleAds", "x", "tiktok"] as const;
  return {
    changedProviders: providers.filter((provider) => (
      previous[provider].pixelId !== next[provider].pixelId
      || previous[provider].enabled !== next[provider].enabled
    )),
    configuredProviders: providers.filter((provider) => Boolean(next[provider].pixelId)),
    activeProviders: providers.filter((provider) => next[provider].enabled && Boolean(next[provider].pixelId)),
  };
}

export function marketingPixelRevisionMatches(
  currentRevision: number | undefined,
  expectedRevision: number,
): boolean {
  return Number.isInteger(expectedRevision) && (currentRevision ?? 0) === expectedRevision;
}

router.get("/marketing-pixels", async (_req, res): Promise<void> => {
  const [row] = await db.select({
    settings: marketingPixelSettingsTable.settings,
    revision: marketingPixelSettingsTable.revision,
  }).from(marketingPixelSettingsTable).where(eq(marketingPixelSettingsTable.key, SETTINGS_KEY)).limit(1);
  res.set("Cache-Control", "no-store");
  res.json(GetPublicMarketingPixelsResponse.parse(
    row ? publicMarketingPixelSettings(row.settings, row.revision) : publicMarketingPixelSettings(null),
  ));
});

router.use("/staff/marketing-pixels", requireStaff);
const pixelRoles = requireStaffRoles("owner", "administrator");

router.get("/staff/marketing-pixels", pixelRoles, async (_req, res): Promise<void> => {
  const [row] = await db.select().from(marketingPixelSettingsTable)
    .where(eq(marketingPixelSettingsTable.key, SETTINGS_KEY)).limit(1);
  const response = staffSettingsResponse(row);
  if (!response) {
    res.status(503).json({ error: "Stored marketing pixel settings are invalid and have been kept inactive" });
    return;
  }
  res.json(GetStaffMarketingPixelsResponse.parse(response));
});

router.put("/staff/marketing-pixels", pixelRoles, async (req, res): Promise<void> => {
  const generated = UpdateStaffMarketingPixelsBody.safeParse(req.body);
  const parsed = generated.success
    ? MarketingPixelSettingsSchema.safeParse(generated.data.settings)
    : null;
  if (!generated.success || !parsed?.success || !Number.isInteger(generated.data.expectedRevision)) {
    const issues = !generated.success ? generated.error.issues : parsed && !parsed.success ? parsed.error.issues : undefined;
    res.status(400).json({
      error: "Provide valid public tag identifiers and an integer expectedRevision",
      issues,
    });
    return;
  }

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"soso-marketing-pixels:" + SETTINGS_KEY}))`);
    const [current] = await tx.select().from(marketingPixelSettingsTable)
      .where(eq(marketingPixelSettingsTable.key, SETTINGS_KEY)).limit(1);
    if (!marketingPixelRevisionMatches(current?.revision, generated.data.expectedRevision)) return null;

    const previous = current
      ? MarketingPixelSettingsSchema.safeParse(current.settings)
      : { success: true as const, data: DEFAULT_MARKETING_PIXEL_SETTINGS };
    if (!previous.success) return { kind: "invalid_current" as const };

    const revision = generated.data.expectedRevision + 1;
    const now = new Date();
    const values = {
      key: SETTINGS_KEY,
      schemaVersion: parsed.data.schemaVersion,
      revision,
      settings: parsed.data,
      updatedByClerkUserId: req.staff!.clerkUserId,
      updatedAt: now,
    };
    const [saved] = current
      ? await tx.update(marketingPixelSettingsTable).set(values)
        .where(eq(marketingPixelSettingsTable.key, SETTINGS_KEY)).returning()
      : await tx.insert(marketingPixelSettingsTable).values(values)
        .onConflictDoNothing({ target: marketingPixelSettingsTable.key }).returning();
    if (!saved) return null;

    const [history] = await tx.insert(marketingPixelSettingRevisionsTable).values({
      settingsKey: SETTINGS_KEY,
      revision,
      snapshot: parsed.data,
      createdByClerkUserId: req.staff!.clerkUserId,
      createdAt: now,
    }).returning({ id: marketingPixelSettingRevisionsTable.id });
    await tx.insert(auditLogsTable).values({
      actorClerkUserId: req.staff!.clerkUserId,
      action: "marketing_pixels.updated",
      entityType: "marketing_pixel_settings",
      entityId: SETTINGS_KEY,
      metadata: {
        revision,
        historyId: history!.id,
        ...marketingPixelAuditSummary(previous.data, parsed.data),
      },
    });
    return { kind: "saved" as const, row: saved };
  });

  if (!result) {
    res.status(409).json({ error: "Marketing pixel settings changed while you were editing. Reload before saving." });
    return;
  }
  if (result.kind === "invalid_current") {
    res.status(503).json({ error: "Stored marketing pixel settings are invalid and have been kept inactive" });
    return;
  }
  res.json(UpdateStaffMarketingPixelsResponse.parse(staffSettingsResponse(result.row)));
});

router.get("/staff/marketing-pixels/history", pixelRoles, async (_req, res): Promise<void> => {
  const rows = await db.select().from(marketingPixelSettingRevisionsTable)
    .where(eq(marketingPixelSettingRevisionsTable.settingsKey, SETTINGS_KEY))
    .orderBy(desc(marketingPixelSettingRevisionsTable.createdAt))
    .limit(100);
  const response = rows.map((row) => ({
    id: row.id,
    revision: row.revision,
    settings: row.snapshot,
    createdByClerkUserId: row.createdByClerkUserId,
    createdAt: row.createdAt,
  }));
  res.json(ListStaffMarketingPixelRevisionsResponse.parse(response));
});

export default router;