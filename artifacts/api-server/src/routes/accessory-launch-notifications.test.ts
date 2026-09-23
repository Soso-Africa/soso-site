import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import {
  CreateAccessoryLaunchNotificationBody,
  GetStaffAccessoryLaunchNotificationSummaryResponse,
  ListStaffAccessoryLaunchNotificationsResponse,
} from "@workspace/api-zod";
import {
  accessoryLaunchNotificationsTable,
  db,
  rateLimitBucketsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  ACCESSORY_LAUNCH_NOTIFICATION_POLICY_VERSION,
  isAuthorizedAccessoryLaunchNotificationReviewer,
  isPublishedUnavailableAccessory,
} from "../lib/accessory-launch-notifications";
import { isRateLimited } from "./content";
import {
  accessoryDemandExportAuditValues,
  accessoryDemandTrend,
  buildAccessoryLaunchNotificationSummaryCsv,
  getAccessoryLaunchNotificationSummary,
  resolveDateRange,
} from "./staff";

test("public accessory notification validation requires affirmative purpose-limited consent", () => {
  const valid = CreateAccessoryLaunchNotificationBody.safeParse({
    email: "shopper@example.com",
    productSlug: "woven-pouch",
    accessoryCategory: "Bags",
    emailNotificationConsent: true,
  });
  assert.equal(valid.success, true);

  const unchecked = CreateAccessoryLaunchNotificationBody.safeParse({
    email: "shopper@example.com",
    productSlug: "woven-pouch",
    accessoryCategory: "Bags",
    emailNotificationConsent: false,
  });
  const malformed = CreateAccessoryLaunchNotificationBody.safeParse({
    email: "not-an-email",
    productSlug: "Woven Pouch",
    accessoryCategory: "",
    emailNotificationConsent: true,
  });
  assert.equal(unchecked.success, false);
  assert.equal(malformed.success, false);
});

test("published accessory gating rejects non-accessory, available, and mismatched-category products", () => {
  const product = { department: "accessories", category: "Bags", fulfilmentState: "unavailable" };
  assert.equal(isPublishedUnavailableAccessory(product, "Bags"), true);
  assert.equal(isPublishedUnavailableAccessory({ ...product, fulfilmentState: "ready_now" }, "Bags"), false);
  assert.equal(isPublishedUnavailableAccessory({ ...product, department: "women" }, "Bags"), false);
  assert.equal(isPublishedUnavailableAccessory(product, "Jewellery"), false);
});

test("accessory launch rate limits use the DB-backed hashed source key", async () => {
  const namespace = `accessory-test-${randomUUID()}`;
  const ip = "198.51.100.14";
  const key = createHash("sha256").update(`${namespace}:ip:${ip}`).digest("hex");
  try {
    assert.equal(await isRateLimited(namespace, ip, 60_000, 1), false);
    assert.equal(await isRateLimited(namespace, ip, 60_000, 1), true);
  } finally {
    await db.delete(rateLimitBucketsTable).where(eq(rateLimitBucketsTable.key, key));
  }
});

test("duplicate accessory notification identities remain one staff-visible record", async () => {
  const email = `duplicate-${randomUUID()}@example.com`;
  const productSlug = `summary-pouch-${randomUUID()}`;
  const accessoryCategory = "Bags";
  try {
    const values = {
      email,
      productSlug,
      accessoryCategory,
      emailNotificationConsent: true,
    };
    await db.insert(accessoryLaunchNotificationsTable).values(values).onConflictDoNothing();
    await db.insert(accessoryLaunchNotificationsTable).values(values).onConflictDoNothing();
    const rows = await db.select().from(accessoryLaunchNotificationsTable).where(eq(accessoryLaunchNotificationsTable.email, email));
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.policyVersion, ACCESSORY_LAUNCH_NOTIFICATION_POLICY_VERSION);
    assert.deepEqual(ListStaffAccessoryLaunchNotificationsResponse.parse(rows), rows);
  } finally {
    await db.delete(accessoryLaunchNotificationsTable).where(eq(accessoryLaunchNotificationsTable.email, email));
  }
});

test("staff accessory demand summary deduplicates identities and respects the date range", async () => {
  const identity = `summary-${randomUUID()}@example.com`;
  const productSlug = `summary-pouch-${randomUUID()}`;
  const accessoryCategory = "Bags";
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  try {
    await db.insert(accessoryLaunchNotificationsTable).values([
      { email: identity, productSlug, accessoryCategory, emailNotificationConsent: true, createdAt: now },
      { email: identity.toUpperCase(), productSlug, accessoryCategory, emailNotificationConsent: true, createdAt: now },
    ]);
    const range = resolveDateRange({ from: date, to: date });
    assert.ok(range);
    const summary = GetStaffAccessoryLaunchNotificationSummaryResponse.parse(
      await getAccessoryLaunchNotificationSummary(range),
    );
    assert.equal(JSON.stringify(summary).includes(identity), false);
    assert.equal(JSON.stringify(summary).includes("email"), false);
    assert.equal(summary.totalUniqueRequests, 1);
    assert.deepEqual(summary.items, [{
      accessoryCategory,
      productSlug,
      requestCount: 1,
      previousRequestCount: 0,
      change: 1,
      trend: "new",
    }]);

    const priorDate = new Date(now.getTime() - 2 * 86_400_000).toISOString().slice(0, 10);
    const priorRange = resolveDateRange({ from: priorDate, to: priorDate });
    assert.ok(priorRange);
    const priorSummary = await getAccessoryLaunchNotificationSummary(priorRange);
    assert.equal(priorSummary.totalUniqueRequests, 0);
    assert.deepEqual(priorSummary.items, []);
  } finally {
    await db.delete(accessoryLaunchNotificationsTable).where(eq(accessoryLaunchNotificationsTable.productSlug, productSlug));
  }
});

test("accessory demand trend distinguishes new, growth, decline, and no change", () => {
  assert.equal(accessoryDemandTrend(2, 0), "new");
  assert.equal(accessoryDemandTrend(3, 1), "growth");
  assert.equal(accessoryDemandTrend(1, 3), "decline");
  assert.equal(accessoryDemandTrend(2, 2), "no_change");
});

test("staff review access is limited to owner, administrator, and editor roles", () => {
  assert.equal(isAuthorizedAccessoryLaunchNotificationReviewer("owner"), true);
  assert.equal(isAuthorizedAccessoryLaunchNotificationReviewer("administrator"), true);
  assert.equal(isAuthorizedAccessoryLaunchNotificationReviewer("editor"), true);
  assert.equal(isAuthorizedAccessoryLaunchNotificationReviewer("operations"), false);
  assert.equal(isAuthorizedAccessoryLaunchNotificationReviewer("analyst"), false);
});

test("accessory demand CSV contains aggregate fields and reporting dates only", () => {
  const csv = buildAccessoryLaunchNotificationSummaryCsv({
    from: "2026-09-01",
    to: "2026-09-14",
    items: [{
      accessoryCategory: "=unsafe",
      productSlug: "@unsafe",
      requestCount: 1,
    }],
  });

  const audit = accessoryDemandExportAuditValues("staff_clerk_user", {
    from: "2026-09-01",
    to: "2026-09-14",
  });

  assert.equal(
    csv,
    "category,product_slug,deduplicated_request_count,reporting_from,reporting_to\r\n\"Bags, Pouches\",woven-pouch,3,2026-09-01,2026-09-14",
  );
  for (const identityField of ["email", "request_id", "consent", "created_at"]) {
    assert.equal(csv.toLowerCase().includes(identityField), false);
  }
});

test("accessory demand CSV neutralizes spreadsheet formulas", () => {
  const csv = buildAccessoryLaunchNotificationSummaryCsv({
    from: "2026-09-01",
    to: "2026-09-14",
    items: [{
      accessoryCategory: "=unsafe",
      productSlug: "@unsafe",
      requestCount: 1,
    }],
  });

  const audit = accessoryDemandExportAuditValues("staff_clerk_user", {
    from: "2026-09-01",
    to: "2026-09-14",
  });

  assert.deepEqual(audit, {
    actorClerkUserId: "staff_clerk_user",
    action: "staff.exported",
    entityType: "staff_export",
    entityId: null,
    metadata: {
      report: "accessory_demand",
      from: "2026-09-01",
      to: "2026-09-14",
    },
  });
  assert.deepEqual(Object.keys(audit.metadata).sort(), ["from", "report", "to"]);
});
