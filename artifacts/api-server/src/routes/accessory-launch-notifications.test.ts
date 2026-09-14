import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import {
  CreateAccessoryLaunchNotificationBody,
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
  const productSlug = "woven-pouch";
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

test("staff review access is limited to owner, administrator, and editor roles", () => {
  assert.equal(isAuthorizedAccessoryLaunchNotificationReviewer("owner"), true);
  assert.equal(isAuthorizedAccessoryLaunchNotificationReviewer("administrator"), true);
  assert.equal(isAuthorizedAccessoryLaunchNotificationReviewer("editor"), true);
  assert.equal(isAuthorizedAccessoryLaunchNotificationReviewer("operations"), false);
  assert.equal(isAuthorizedAccessoryLaunchNotificationReviewer("analyst"), false);
});