import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";

type ApiResponse = {
  status: number;
  body: unknown;
};

type StaffProfile = {
  role?: string;
  email?: string;
};

type AccessPackageResponse = {
  packageId?: string;
  expiresAt?: string;
  downloadedAt?: string | null;
  rowCounts?: unknown;
  downloadPath?: string;
  payload?: unknown;
};

type AuditRow = {
  action: string;
  metadata: Record<string, unknown>;
};

const mutableMethods = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const safePackageResponseFields = new Set(["packageId", "expiresAt", "downloadedAt", "rowCounts", "downloadPath"]);
const safeAuditMetadataFields = new Set(["packageId", "packageHash", "rowCounts", "expiresAt", "requestStatus"]);

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function asObject(value: unknown): Record<string, unknown> {
  assert(typeof value === "object" && value !== null && !Array.isArray(value), "Expected a JSON object response.");
  return value as Record<string, unknown>;
}

async function api(
  apiOrigin: string,
  token: string | null,
  path: string,
  init: RequestInit = {},
): Promise<ApiResponse> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (init.body) headers.set("content-type", "application/json");
  if (mutableMethods.has(method)) headers.set("origin", apiOrigin);

  const response = await fetch(new URL(path, apiOrigin), { ...init, method, headers });
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: response.status, body };
}

function expectStatus(response: ApiResponse, status: number, message: string): void {
  assert(response.status === status, `${message} Expected ${status}, received ${response.status}.`);
}

async function insertAccessRequest(requesterEmail: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO soso_privacy_requests (request_type, requester_email, policy_version, status)
     VALUES ('access', $1, 'privacy-access-package-e2e', 'received')
     RETURNING id`,
    [requesterEmail],
  );
  const id = result.rows[0]?.id;
  assert(id, "Failed to create temporary privacy request.");
  return id;
}

async function cleanup(requestIds: string[]): Promise<void> {
  if (!requestIds.length) return;
  await pool.query("BEGIN");
  try {
    await pool.query(
      `DELETE FROM soso_audit_logs
       WHERE entity_type = 'privacy_request' AND entity_id = ANY($1::text[])`,
      [requestIds],
    );
    await pool.query("DELETE FROM soso_privacy_requests WHERE id = ANY($1::uuid[])", [requestIds]);
    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
}

async function main(): Promise<void> {
  const apiOrigin = required("SOSO_PRIVACY_TEST_API_ORIGIN").replace(/\/+$/, "");
  const ownerToken = required("SOSO_PRIVACY_TEST_OWNER_TOKEN");
  const nonOwnerToken = required("SOSO_PRIVACY_TEST_NON_OWNER_TOKEN");
  const requesterEmail = `privacy-access-e2e-${randomUUID()}@example.invalid`;
  const requestIds: string[] = [];

  try {
    const ownerProfileResponse = await api(apiOrigin, ownerToken, "/api/staff/me");
    expectStatus(ownerProfileResponse, 200, "Owner session must resolve to an active staff profile.");
    const ownerProfile = asObject(ownerProfileResponse.body) as StaffProfile;
    assert(ownerProfile.role === "owner", "SOSO_PRIVACY_TEST_OWNER_TOKEN must belong to an active owner.");
    assert(typeof ownerProfile.email === "string", "Owner profile must include an email.");
    const ownerStaff = await pool.query<{ clerk_user_id: string }>(
      "SELECT clerk_user_id FROM soso_staff_users WHERE email = $1 AND is_active = true",
      [ownerProfile.email],
    );
    const ownerClerkUserId = ownerStaff.rows[0]?.clerk_user_id;
    assert(ownerClerkUserId, "Owner profile must have an active staff mapping.");

    const nonOwnerProfileResponse = await api(apiOrigin, nonOwnerToken, "/api/staff/me");
    expectStatus(nonOwnerProfileResponse, 200, "Non-owner session must resolve to an active staff profile.");
    const nonOwnerProfile = asObject(nonOwnerProfileResponse.body) as StaffProfile;
    assert(nonOwnerProfile.role && nonOwnerProfile.role !== "owner", "SOSO_PRIVACY_TEST_NON_OWNER_TOKEN must belong to an active non-owner.");

    const firstRequestId = await insertAccessRequest(requesterEmail);
    requestIds.push(firstRequestId);

    const unauthenticatedGenerate = await api(apiOrigin, null, `/api/staff/privacy-requests/${firstRequestId}/access-package`, { method: "POST" });
    expectStatus(unauthenticatedGenerate, 401, "Unauthenticated package generation must be denied.");

    const unverifiedGenerate = await api(apiOrigin, ownerToken, `/api/staff/privacy-requests/${firstRequestId}/access-package`, { method: "POST" });
    expectStatus(unverifiedGenerate, 400, "An owner must record identity verification before package generation.");
    const beforeVerificationCount = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM soso_privacy_access_packages WHERE privacy_request_id = $1",
      [firstRequestId],
    );
    assert(beforeVerificationCount.rows[0]?.count === "0", "An unverified request must not create a package row.");

    const verification = await api(apiOrigin, ownerToken, `/api/staff/privacy-requests/${firstRequestId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "identity_verified", verificationNote: "Development identity evidence recorded for access-package test." }),
    });
    expectStatus(verification, 200, "Owner identity verification update must succeed.");

    const generated = await api(apiOrigin, ownerToken, `/api/staff/privacy-requests/${firstRequestId}/access-package`, { method: "POST" });
    expectStatus(generated, 201, "A verified request must generate an access package for an owner.");
    const generatedBody = asObject(generated.body) as AccessPackageResponse;
    assert(Object.keys(generatedBody).every((field) => safePackageResponseFields.has(field)), "Package generation response must not include package contents.");
    assert(!("payload" in generatedBody), "Package generation response must not include a payload.");
    assert(typeof generatedBody.packageId === "string" && typeof generatedBody.downloadPath === "string", "Package generation response is missing its one-time download reference.");

    const unauthenticatedDownload = await api(apiOrigin, null, generatedBody.downloadPath);
    expectStatus(unauthenticatedDownload, 401, "Unauthenticated package download must be denied.");

    const firstDownload = await api(apiOrigin, ownerToken, generatedBody.downloadPath);
    expectStatus(firstDownload, 200, "Owner must receive the generated package once.");
    const firstDownloadBody = asObject(firstDownload.body);
    assert(firstDownloadBody.format === "soso-subject-access-package-v1", "Downloaded package has an unexpected format.");
    assert(firstDownloadBody.requesterEmail === requesterEmail, "Downloaded package does not belong to the tested request.");
    assert(!("audit" in firstDownloadBody) && !("staff" in firstDownloadBody), "Downloaded package must not contain staff or audit records.");

    const claimedDownload = await api(apiOrigin, ownerToken, generatedBody.downloadPath);
    expectStatus(claimedDownload, 404, "A claimed package must not be downloadable again.");
    const claimedRow = await pool.query<{ downloaded_at: Date | null; downloaded_by_clerk_user_id: string | null }>(
      "SELECT downloaded_at, downloaded_by_clerk_user_id FROM soso_privacy_access_packages WHERE id = $1",
      [generatedBody.packageId],
    );
    assert(claimedRow.rows[0]?.downloaded_at, "The first download must be recorded as claimed.");
    assert(
      claimedRow.rows[0]?.downloaded_by_clerk_user_id === ownerClerkUserId,
      "The one-time download must be claimed by the authenticated owner.",
    );

    const secondRequestId = await insertAccessRequest(`${randomUUID()}@example.invalid`);
    requestIds.push(secondRequestId);
    const secondVerification = await api(apiOrigin, ownerToken, `/api/staff/privacy-requests/${secondRequestId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "identity_verified", verificationNote: "Development identity evidence recorded for access-package test." }),
    });
    expectStatus(secondVerification, 200, "Owner must be able to verify the non-owner test request.");

    const nonOwnerGenerate = await api(apiOrigin, nonOwnerToken, `/api/staff/privacy-requests/${secondRequestId}/access-package`, { method: "POST" });
    expectStatus(nonOwnerGenerate, 403, "A non-owner must not generate an access package.");
    const nonOwnerPackageCount = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM soso_privacy_access_packages WHERE privacy_request_id = $1",
      [secondRequestId],
    );
    assert(nonOwnerPackageCount.rows[0]?.count === "0", "A denied non-owner generation attempt must not create a package row.");

    const secondGenerated = await api(apiOrigin, ownerToken, `/api/staff/privacy-requests/${secondRequestId}/access-package`, { method: "POST" });
    expectStatus(secondGenerated, 201, "Owner must generate the second package for access-control checks.");
    const secondGeneratedBody = asObject(secondGenerated.body) as AccessPackageResponse;
    assert(typeof secondGeneratedBody.packageId === "string" && typeof secondGeneratedBody.downloadPath === "string", "Second package response is missing its download reference.");

    const nonOwnerDownload = await api(apiOrigin, nonOwnerToken, secondGeneratedBody.downloadPath);
    expectStatus(nonOwnerDownload, 403, "A non-owner must not download an owner package.");

    const expiredDownloadAuditCount = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM soso_audit_logs
       WHERE entity_type = 'privacy_request' AND entity_id = $1 AND action = 'privacy_request.access_package_downloaded'`,
      [secondRequestId],
    );
    await pool.query(
      "UPDATE soso_privacy_access_packages SET expires_at = now() - interval '1 minute' WHERE id = $1",
      [secondGeneratedBody.packageId],
    );
    const expiredDownload = await api(apiOrigin, ownerToken, secondGeneratedBody.downloadPath);
    expectStatus(expiredDownload, 404, "An expired package must not be downloadable.");
    const expiredDownloadAuditCountAfter = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM soso_audit_logs
       WHERE entity_type = 'privacy_request' AND entity_id = $1 AND action = 'privacy_request.access_package_downloaded'`,
      [secondRequestId],
    );
    assert(
      expiredDownloadAuditCountAfter.rows[0]?.count === expiredDownloadAuditCount.rows[0]?.count,
      "An expired download attempt must not create a download audit event.",
    );

    const auditRows = await pool.query<AuditRow>(
      `SELECT action, metadata FROM soso_audit_logs
       WHERE entity_type = 'privacy_request'
         AND entity_id = ANY($1::text[])
         AND action LIKE 'privacy_request.access_package_%'`,
      [requestIds],
    );
    assert(auditRows.rows.length >= 3, "Expected package generation and download audit events.");
    for (const row of auditRows.rows) {
      assert(
        Object.keys(row.metadata).every((field) => safeAuditMetadataFields.has(field)),
        `Audit event ${row.action} includes data outside the permitted package metadata.`,
      );
      const serializedMetadata = JSON.stringify(row.metadata);
      assert(!serializedMetadata.includes(requesterEmail), `Audit event ${row.action} leaked requester data.`);
      assert(!serializedMetadata.includes("\"payload\""), `Audit event ${row.action} leaked package contents.`);
      assert(
        !/(payment_reference|ownership_token|idempotency_token|credential|secret)/i.test(serializedMetadata),
        `Audit event ${row.action} leaked sensitive payment or credential data.`,
      );
    }

    console.log("Privacy access-package verification passed.");
    console.log("Verified: verification gate, authenticated owner download, unauthenticated and non-owner denial, one-time claim, expiry, and audit metadata redaction.");
  } finally {
    await cleanup(requestIds);
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});