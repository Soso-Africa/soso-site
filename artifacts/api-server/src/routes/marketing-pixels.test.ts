import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import fs from "node:fs";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { eq } from "drizzle-orm";
import {
  auditLogsTable,
  db,
  marketingPixelSettingRevisionsTable,
  marketingPixelSettingsTable,
  staffSessionsTable,
  staffUsersTable,
} from "@workspace/db";
import app from "../app";
import {
  DEFAULT_MARKETING_PIXEL_SETTINGS,
  MarketingPixelSettingsSchema,
  marketingPixelAuditSummary,
  marketingPixelRevisionMatches,
  publicMarketingPixelSettings,
} from "./marketing-pixels";

test("marketing pixel settings accept only governed public tag identifiers", () => {
  assert.equal(MarketingPixelSettingsSchema.safeParse({
    schemaVersion: 1,
    meta: { pixelId: "123456789", enabled: true },
    googleAds: { pixelId: "AW-123456789", enabled: true },
    x: { pixelId: "abc12", enabled: true },
    tiktok: { pixelId: "C123ABCD456EFGH789IJ", enabled: true },
  }).success, true);

  for (const [provider, pixelId] of [
    ["meta", "<script>alert(1)</script>"],
    ["googleAds", "https://www.googletagmanager.com/gtag/js"],
    ["x", "secret_token-123"],
    ["tiktok", "C123 ABCD 456"],
  ] as const) {
    const settings = structuredClone(DEFAULT_MARKETING_PIXEL_SETTINGS);
    settings[provider].pixelId = pixelId;
    assert.equal(MarketingPixelSettingsSchema.safeParse(settings).success, false, provider);
  }
});

test("enabled providers require a valid identifier", () => {
  const settings = structuredClone(DEFAULT_MARKETING_PIXEL_SETTINGS);
  settings.meta.enabled = true;
  const parsed = MarketingPixelSettingsSchema.safeParse(settings);
  assert.equal(parsed.success, false);
  assert.match(parsed.success ? "" : parsed.error.issues[0]?.message ?? "", /required before.*enabled/i);
});

test("public settings expose only valid enabled identifiers and otherwise fail closed", () => {
  const settings = structuredClone(DEFAULT_MARKETING_PIXEL_SETTINGS);
  settings.meta = { pixelId: "123456789", enabled: true };
  settings.googleAds = { pixelId: "AW-123456789", enabled: false };
  assert.deepEqual(publicMarketingPixelSettings(settings, 4), {
    schemaVersion: 1,
    revision: 4,
    providers: {
      meta: { pixelId: "123456789" },
      googleAds: null,
      x: null,
      tiktok: null,
    },
  });
  assert.deepEqual(publicMarketingPixelSettings({ arbitraryScript: "<script />" }, 99), {
    schemaVersion: 1,
    revision: 0,
    providers: { meta: null, googleAds: null, x: null, tiktok: null },
  });
});

test("optimistic revision checks reserve zero for an absent configuration", () => {
  assert.equal(marketingPixelRevisionMatches(undefined, 0), true);
  assert.equal(marketingPixelRevisionMatches(2, 2), true);
  assert.equal(marketingPixelRevisionMatches(2, 1), false);
  assert.equal(marketingPixelRevisionMatches(2, 2.5), false);
});

test("audit summaries identify changed and active providers without retaining identifiers", () => {
  const next = structuredClone(DEFAULT_MARKETING_PIXEL_SETTINGS);
  next.meta = { pixelId: "123456789", enabled: true };
  const summary = marketingPixelAuditSummary(DEFAULT_MARKETING_PIXEL_SETTINGS, next);
  assert.deepEqual(summary, {
    changedProviders: ["meta"],
    configuredProviders: ["meta"],
    activeProviders: ["meta"],
  });
  assert.equal(JSON.stringify(summary).includes("123456789"), false);
});

test("marketing pixel routes apply owner and administrator authorization", () => {
  const source = fs.readFileSync(new URL("./marketing-pixels.ts", import.meta.url), "utf8");
  assert.equal(source.includes('requireStaffRoles("owner", "administrator")'), true);
  assert.equal(source.includes('router.get("/staff/marketing-pixels", pixelRoles'), true);
  assert.equal(source.includes('router.put("/staff/marketing-pixels", pixelRoles'), true);
  assert.equal(source.includes('router.get("/staff/marketing-pixels/history", pixelRoles'), true);
});

type ApiResponse = { status: number; body: unknown };

async function request(
  baseUrl: string,
  path: string,
  options: { method?: string; body?: unknown; token?: string } = {},
): Promise<ApiResponse> {
  const method = options.method ?? "GET";
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...(["POST", "PUT", "PATCH", "DELETE"].includes(method) ? { origin: baseUrl } : {}),
      ...(options.token ? { cookie: `soso_staff_session=${options.token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : undefined };
}

async function listen(): Promise<{ server: Server; baseUrl: string }> {
  const server = app.listen(0);
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

test("marketing pixel API enforces roles, validation, revisions, audit history, and public fail-closed projection", async () => {
  const suffix = randomBytes(8).toString("hex");
  const administratorClerkId = `marketing-pixel-admin-${suffix}`;
  const operationsClerkId = `marketing-pixel-operations-${suffix}`;
  const administratorToken = randomBytes(32).toString("base64url");
  const operationsToken = randomBytes(32).toString("base64url");
  const [previousSetting] = await db.select().from(marketingPixelSettingsTable)
    .where(eq(marketingPixelSettingsTable.key, "storefront")).limit(1);
  const previousRevisions = await db.select().from(marketingPixelSettingRevisionsTable)
    .where(eq(marketingPixelSettingRevisionsTable.settingsKey, "storefront"));
  let server: Server | undefined;
  let administratorId: string | undefined;
  let operationsId: string | undefined;

  try {
    await db.delete(marketingPixelSettingsTable).where(eq(marketingPixelSettingsTable.key, "storefront"));
    const users = await db.insert(staffUsersTable).values([
      {
        clerkUserId: administratorClerkId,
        email: `${administratorClerkId}@example.com`,
        role: "administrator",
        isActive: true,
      },
      {
        clerkUserId: operationsClerkId,
        email: `${operationsClerkId}@example.com`,
        role: "operations",
        isActive: true,
      },
    ]).returning({ id: staffUsersTable.id, clerkUserId: staffUsersTable.clerkUserId });
    administratorId = users.find((user) => user.clerkUserId === administratorClerkId)!.id;
    operationsId = users.find((user) => user.clerkUserId === operationsClerkId)!.id;
    await db.insert(staffSessionsTable).values([
      {
        staffUserId: administratorId,
        tokenHash: createHash("sha256").update(administratorToken).digest("hex"),
        expiresAt: new Date(Date.now() + 60_000),
      },
      {
        staffUserId: operationsId,
        tokenHash: createHash("sha256").update(operationsToken).digest("hex"),
        expiresAt: new Date(Date.now() + 60_000),
      },
    ]);

    const running = await listen();
    server = running.server;
    assert.equal((await request(running.baseUrl, "/api/staff/marketing-pixels")).status, 401);
    assert.equal((await request(running.baseUrl, "/api/staff/marketing-pixels", { token: operationsToken })).status, 403);

    const initial = await request(running.baseUrl, "/api/staff/marketing-pixels", { token: administratorToken });
    assert.equal(initial.status, 200);
    assert.equal((initial.body as { revision: number }).revision, 0);

    const invalid = structuredClone(DEFAULT_MARKETING_PIXEL_SETTINGS);
    invalid.meta.pixelId = "<script>alert(1)</script>";
    assert.equal((await request(running.baseUrl, "/api/staff/marketing-pixels", {
      method: "PUT",
      token: administratorToken,
      body: { settings: invalid, expectedRevision: 0 },
    })).status, 400);

    const active = structuredClone(DEFAULT_MARKETING_PIXEL_SETTINGS);
    active.meta = { pixelId: "123456789", enabled: true };
    active.googleAds = { pixelId: "AW-123456789", enabled: false };
    const saved = await request(running.baseUrl, "/api/staff/marketing-pixels", {
      method: "PUT",
      token: administratorToken,
      body: { settings: active, expectedRevision: 0 },
    });
    assert.equal(saved.status, 200);
    assert.equal((saved.body as { revision: number }).revision, 1);

    const publicActive = await request(running.baseUrl, "/api/marketing-pixels");
    assert.deepEqual(publicActive.body, {
      schemaVersion: 1,
      revision: 1,
      providers: {
        meta: { pixelId: "123456789" },
        googleAds: null,
        x: null,
        tiktok: null,
      },
    });

    const conflict = await request(running.baseUrl, "/api/staff/marketing-pixels", {
      method: "PUT",
      token: administratorToken,
      body: { settings: DEFAULT_MARKETING_PIXEL_SETTINGS, expectedRevision: 0 },
    });
    assert.equal(conflict.status, 409);

    const history = await request(running.baseUrl, "/api/staff/marketing-pixels/history", { token: administratorToken });
    assert.equal(history.status, 200);
    assert.equal((history.body as unknown[]).length, 1);
    const [audit] = await db.select().from(auditLogsTable)
      .where(eq(auditLogsTable.actorClerkUserId, administratorClerkId));
    assert.equal(audit?.action, "marketing_pixels.updated");
    assert.equal(JSON.stringify(audit?.metadata).includes("123456789"), false);

    const disabled = await request(running.baseUrl, "/api/staff/marketing-pixels", {
      method: "PUT",
      token: administratorToken,
      body: { settings: DEFAULT_MARKETING_PIXEL_SETTINGS, expectedRevision: 1 },
    });
    assert.equal(disabled.status, 200);
    assert.deepEqual((await request(running.baseUrl, "/api/marketing-pixels")).body, {
      schemaVersion: 1,
      revision: 2,
      providers: { meta: null, googleAds: null, x: null, tiktok: null },
    });
  } finally {
    if (server) {
      server.close();
      await once(server, "close");
    }
    await db.delete(marketingPixelSettingsTable).where(eq(marketingPixelSettingsTable.key, "storefront"));
    await db.delete(auditLogsTable).where(eq(auditLogsTable.actorClerkUserId, administratorClerkId));
    if (administratorId) await db.delete(staffSessionsTable).where(eq(staffSessionsTable.staffUserId, administratorId));
    if (operationsId) await db.delete(staffSessionsTable).where(eq(staffSessionsTable.staffUserId, operationsId));
    if (administratorId) await db.delete(staffUsersTable).where(eq(staffUsersTable.id, administratorId));
    if (operationsId) await db.delete(staffUsersTable).where(eq(staffUsersTable.id, operationsId));
    if (previousSetting) {
      await db.insert(marketingPixelSettingsTable).values(previousSetting);
      if (previousRevisions.length) await db.insert(marketingPixelSettingRevisionsTable).values(previousRevisions);
    }
  }
});