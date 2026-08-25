import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { and, eq } from "drizzle-orm";
import { auditLogsTable, db, staffSessionsTable, staffUsersTable } from "@workspace/db";
import app from "../app";
import { setManagedStaffPassword } from "./staff-auth";

const password = "AtelierOwner2026!";
const replacementPassword = "NewAtelierOwner2026!";

type ApiResponse = {
  status: number;
  body: unknown;
  cookie?: string;
  setCookie?: string;
};

function cookieValue(setCookie: string | null): string | undefined {
  return setCookie?.match(/^soso_staff_session=([^;]+)/)?.[1];
}

async function request(
  baseUrl: string,
  path: string,
  options: { method?: string; body?: unknown; cookie?: string } = {},
): Promise<ApiResponse> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...(["POST", "PUT", "PATCH", "DELETE"].includes(options.method ?? "GET") ? { origin: baseUrl } : {}),
      ...(options.cookie ? { cookie: `soso_staff_session=${options.cookie}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const setCookie = response.headers.get("set-cookie") ?? undefined;
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : undefined,
    cookie: cookieValue(setCookie ?? null),
    setCookie,
  };
}

async function listen(): Promise<{ server: Server; baseUrl: string }> {
  const server = app.listen(0);
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

test("staff auth rejects anonymous protected requests without account details", async () => {
  const { server, baseUrl } = await listen();
  try {
    const response = await request(baseUrl, "/api/staff/access");
    assert.equal(response.status, 401);
    assert.deepEqual(response.body, { error: "Authentication required" });
    assert.equal(response.setCookie, undefined);
    assert.equal(JSON.stringify(response.body).includes("email"), false);
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("staff login and logout cookies are secure in production", async () => {
  const email = `secure-cookie-test-${randomBytes(8).toString("hex")}@example.com`;
  const clerkUserId = `secure-cookie-test-${randomBytes(8).toString("hex")}`;
  const productionSetting = process.env.NODE_ENV;
  let userId: string | undefined;
  let server: Server | undefined;

  try {
    process.env.NODE_ENV = "production";
    const inserted = await db.insert(staffUsersTable).values({
      clerkUserId,
      email,
      role: "owner",
      isActive: true,
    }).returning({ id: staffUsersTable.id });
    userId = inserted[0]!.id;
    await setManagedStaffPassword(userId, password);

    const running = await listen();
    server = running.server;
    const login = await request(running.baseUrl, "/api/staff-auth/login", {
      method: "POST",
      body: { email, password },
    });
    assert.equal(login.status, 200);
    assert.ok(login.cookie);
    assert.match(login.setCookie ?? "", /^soso_staff_session=[^;]+;/i);
    assert.match(login.setCookie ?? "", /Path=\//i);
    assert.match(login.setCookie ?? "", /HttpOnly/i);
    assert.match(login.setCookie ?? "", /SameSite=Lax/i);
    assert.match(login.setCookie ?? "", /Secure/i);

    const logout = await request(running.baseUrl, "/api/staff-auth/logout", {
      method: "POST",
      cookie: login.cookie,
    });
    assert.equal(logout.status, 204);
    assert.match(logout.setCookie ?? "", /^soso_staff_session=;/i);
    assert.match(logout.setCookie ?? "", /Path=\//i);
    assert.match(logout.setCookie ?? "", /HttpOnly/i);
    assert.match(logout.setCookie ?? "", /SameSite=Lax/i);
    assert.match(logout.setCookie ?? "", /Secure/i);
  } finally {
    if (server) {
      server.close();
      await once(server, "close");
    }
    if (userId) {
      await db.delete(staffSessionsTable).where(eq(staffSessionsTable.staffUserId, userId));
      await db.delete(auditLogsTable).where(eq(auditLogsTable.entityId, userId));
      await db.delete(staffUsersTable).where(eq(staffUsersTable.id, userId));
    }
    if (productionSetting === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = productionSetting;
    }
  }
});

test("staff login, bootstrap guard, status, logout, reset, disable, and session expiry are enforced", async () => {
  const email = `auth-test-${randomBytes(8).toString("hex")}@example.com`;
  const clerkUserId = `auth-test-${randomBytes(8).toString("hex")}`;
  const unrelatedEmail = `auth-unrelated-${randomBytes(8).toString("hex")}@example.com`;
  const unrelatedClerkUserId = `auth-unrelated-${randomBytes(8).toString("hex")}`;
  let userId: string | undefined;
  let unrelatedUserId: string | undefined;
  let server: Server | undefined;

  try {
    const inserted = await db.insert(staffUsersTable).values([
      {
        clerkUserId,
        email,
        role: "owner",
        isActive: true,
      },
      // This deliberately remains passwordless. It models independently
      // created staff fixtures and ensures bootstrap is not based on a global
      // passwordless-user query.
      {
        clerkUserId: unrelatedClerkUserId,
        email: unrelatedEmail,
        role: "administrator",
        isActive: true,
      },
    ]).returning({ id: staffUsersTable.id, email: staffUsersTable.email });
    userId = inserted[0]!.id;
    unrelatedUserId = inserted[1]!.id;
    const running = await listen();
    server = running.server;

    const invalidLogin = await request(running.baseUrl, "/api/staff-auth/login", {
      method: "POST",
      body: { email, password: "wrong" },
    });
    assert.equal(invalidLogin.status, 401);
    assert.equal(invalidLogin.cookie, undefined);

    const invalidBootstrap = await request(running.baseUrl, "/api/staff-auth/bootstrap", {
      method: "POST",
      body: { token: "wrong-token", email, password },
    });
    assert.equal(invalidBootstrap.status, 400);
    assert.equal(invalidBootstrap.cookie, undefined);

    const ineligibleBootstrap = await request(running.baseUrl, "/api/staff-auth/bootstrap", {
      method: "POST",
      body: { token: process.env.STAFF_BOOTSTRAP_TOKEN, email: unrelatedEmail, password },
    });
    assert.equal(ineligibleBootstrap.status, 403);
    assert.equal(ineligibleBootstrap.cookie, undefined);

    const bootstrap = await request(running.baseUrl, "/api/staff-auth/bootstrap", {
      method: "POST",
      body: { token: process.env.STAFF_BOOTSTRAP_TOKEN, email, password },
    });
    assert.equal(bootstrap.status, 201);
    assert.deepEqual(bootstrap.body, { id: userId, email, role: "owner" });
    assert.ok(bootstrap.cookie);
    assert.match(bootstrap.setCookie ?? "", /HttpOnly/i);
    assert.match(bootstrap.setCookie ?? "", /SameSite=Lax/i);
    assert.doesNotMatch(bootstrap.setCookie ?? "", /Secure/i);

    const secondBootstrap = await request(running.baseUrl, "/api/staff-auth/bootstrap", {
      method: "POST",
      body: { token: process.env.STAFF_BOOTSTRAP_TOKEN, email, password },
    });
    assert.equal(secondBootstrap.status, 409);
    assert.equal(secondBootstrap.cookie, undefined);

    const status = await request(running.baseUrl, "/api/staff-auth/status", { cookie: bootstrap.cookie });
    assert.equal(status.status, 200);
    assert.deepEqual(status.body, { id: userId, email, role: "owner" });

    const protectedAccess = await request(running.baseUrl, "/api/staff/access", { cookie: bootstrap.cookie });
    assert.equal(protectedAccess.status, 200);
    assert.ok(Array.isArray(protectedAccess.body));

    const logout = await request(running.baseUrl, "/api/staff-auth/logout", {
      method: "POST",
      cookie: bootstrap.cookie,
    });
    assert.equal(logout.status, 204);
    assert.match(logout.setCookie ?? "", /soso_staff_session=;/i);
    assert.match(logout.setCookie ?? "", /Expires=Thu, 01 Jan 1970 00:00:00 GMT/i);
    const statusAfterLogout = await request(running.baseUrl, "/api/staff-auth/status", { cookie: bootstrap.cookie });
    assert.equal(statusAfterLogout.status, 401);
    const protectedAfterLogout = await request(running.baseUrl, "/api/staff/access", { cookie: bootstrap.cookie });
    assert.equal(protectedAfterLogout.status, 401);

    await setManagedStaffPassword(userId, password);
    const login = await request(running.baseUrl, "/api/staff-auth/login", {
      method: "POST",
      body: { email: `  ${email.toUpperCase()} `, password },
    });
    assert.equal(login.status, 200);
    assert.ok(login.cookie);
    assert.match(login.setCookie ?? "", /HttpOnly/i);
    assert.doesNotMatch(login.setCookie ?? "", /Domain=/i);

    const reset = await request(running.baseUrl, `/api/staff/access/${userId}/password`, {
      method: "POST",
      cookie: login.cookie,
      body: { password: replacementPassword },
    });
    assert.equal(reset.status, 204);
    assert.equal((await request(running.baseUrl, "/api/staff-auth/status", { cookie: login.cookie })).status, 401);

    const oldPassword = await request(running.baseUrl, "/api/staff-auth/login", {
      method: "POST",
      body: { email, password },
    });
    assert.equal(oldPassword.status, 401);
    const newPassword = await request(running.baseUrl, "/api/staff-auth/login", {
      method: "POST",
      body: { email, password: replacementPassword },
    });
    assert.equal(newPassword.status, 200);

    await db.update(staffUsersTable).set({ isActive: false }).where(eq(staffUsersTable.id, userId));
    const disabledLogin = await request(running.baseUrl, "/api/staff-auth/login", {
      method: "POST",
      body: { email, password: replacementPassword },
    });
    assert.equal(disabledLogin.status, 401);
    assert.equal(disabledLogin.cookie, undefined);
    assert.equal((await request(running.baseUrl, "/api/staff-auth/status", { cookie: newPassword.cookie })).status, 401);

    await db.update(staffUsersTable).set({ isActive: true }).where(eq(staffUsersTable.id, userId));
    const expiredToken = randomBytes(32).toString("base64url");
    await db.insert(staffSessionsTable).values({
      staffUserId: userId,
      tokenHash: createHash("sha256").update(expiredToken).digest("hex"),
      expiresAt: new Date(Date.now() - 1_000),
    });
    assert.equal((await request(running.baseUrl, "/api/staff-auth/status", { cookie: expiredToken })).status, 401);
  } finally {
    if (server) {
      server.close();
      await once(server, "close");
    }
    if (userId) {
      await db.delete(staffSessionsTable).where(eq(staffSessionsTable.staffUserId, userId));
      await db.delete(auditLogsTable).where(eq(auditLogsTable.entityId, userId));
      await db.delete(staffUsersTable).where(eq(staffUsersTable.id, userId));
    }
    if (unrelatedUserId) await db.delete(staffUsersTable).where(eq(staffUsersTable.id, unrelatedUserId));
    await db.delete(staffUsersTable).where(and(eq(staffUsersTable.email, email), eq(staffUsersTable.clerkUserId, clerkUserId)));
    await db.delete(staffUsersTable).where(and(eq(staffUsersTable.email, unrelatedEmail), eq(staffUsersTable.clerkUserId, unrelatedClerkUserId)));
  }
});