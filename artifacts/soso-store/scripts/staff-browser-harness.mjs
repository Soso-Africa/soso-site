import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import net from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import serverlessChromium from "@sparticuz/chromium";
import pg from "pg";

const storeRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const workspaceRoot = resolve(storeRoot, "../..");
const mutatingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

async function reservePort() {
  const server = net.createServer();
  let released = false;
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    port: address.port,
    release: () => {
      if (released) return Promise.resolve();
      released = true;
      return new Promise((resolveClose, reject) =>
        server.close((error) => error ? reject(error) : resolveClose()));
    },
  };
}


function sessionCookie(response) {
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie, "Expected staff authentication to set a session cookie.");
  return setCookie.split(";", 1)[0];
}

async function stopProcess(record) {
  const { child } = record;
  if (child.exitCode !== null || child.signalCode !== null) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
  const stopped = await Promise.race([
    new Promise((resolveExit) => child.once("exit", () => resolveExit(true))),
    new Promise((resolveWait) => setTimeout(() => resolveWait(false), 3_000)),
  ]);
  if (!stopped && child.exitCode === null && child.signalCode === null) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
    await new Promise((resolveExit) => child.once("exit", resolveExit));
  }
}

export async function createStaffBrowserHarness({ prefix, ownerPassword }) {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required.");
  const apiReservation = await reservePort();
  const storeReservation = await reservePort();
  const apiPort = apiReservation.port;
  const storePort = storeReservation.port;
  const apiOrigin = `http://127.0.0.1:${apiPort}`;
  const storeOrigin = `http://127.0.0.1:${storePort}`;
  const ownerEmail = `${prefix}-owner-${randomUUID()}@example.test`;
  const bootstrapToken = `${prefix}-bootstrap-${randomUUID()}`;
  const children = [];
  const temporaryStaffIds = [];
  let ownerCookie = "";
  let originalPlatformRow;
  let originalPlatformSnapshot;
  let browser;
  let cleanupPromise;

  function start(command, args, options) {
    const child = spawn(command, args, {
      ...options,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    const record = { child, getOutput: () => output };
    children.push(record);
    return record;
  }

  async function waitFor(url, record) {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (record.child.exitCode !== null) {
        throw new Error(`Process exited before ${url} was ready.\n${record.getOutput()}`);
      }
      try {
        const response = await fetch(url);
        if (response.status < 500) return;
      } catch {
        // The server is still starting.
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    }
    throw new Error(`Timed out waiting for ${url}.\n${record.getOutput()}`);
  }

  async function api(path, { cookie = "", method = "GET", body } = {}) {
    const response = await fetch(`${apiOrigin}${path}`, {
      method,
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(mutatingMethods.has(method) ? { origin: apiOrigin } : {}),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return { response, value: text ? JSON.parse(text) : null };
  }

  async function currentPlatformRow(cookie = ownerCookie) {
    const result = await api("/api/staff/content/platform", { cookie });
    assert.equal(result.response.status, 200, JSON.stringify(result.value));
    return result.value;
  }

  async function savePlatformContent(cookie, content, expectedDraftUpdatedAt) {
    return api("/api/staff/content/platform", {
      cookie,
      method: "PUT",
      body: { content, expectedDraftUpdatedAt },
    });
  }

  async function replaceDraftFixture(content) {
    const database = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await database.connect();
    try {
      await database.query(
        `update soso_site_content set draft = $1::jsonb, draft_updated_at = now() where key = 'platform'`,
        [JSON.stringify(content)],
      );
    } finally {
      await database.end();
    }
  }

  async function restorePlatformContent() {
    if (!originalPlatformSnapshot) return;
    const database = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await database.connect();
    try {
      await database.query(
        `update soso_site_content
         set draft = $1, published = $2, draft_updated_at = $3, published_at = $4,
             updated_by_clerk_user_id = $5, published_by_clerk_user_id = $6
         where key = 'platform'`,
        [
          originalPlatformSnapshot.draft,
          originalPlatformSnapshot.published,
          originalPlatformSnapshot.draft_updated_at,
          originalPlatformSnapshot.published_at,
          originalPlatformSnapshot.updated_by_clerk_user_id,
          originalPlatformSnapshot.published_by_clerk_user_id,
        ],
      );
    } finally {
      await database.end();
    }
  }

  async function startServers() {
    const database = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await database.connect();
    try {
      await database.query(
        `insert into soso_staff_users (clerk_user_id, email, role, is_active) values ($1, $2, 'owner', true)`,
        [`${prefix}-owner-${randomUUID()}`, ownerEmail],
      );
    } finally {
      await database.end();
    }

    await apiReservation.release();
    const apiProcess = start("node", ["--enable-source-maps", "dist/index.mjs"], {
      cwd: resolve(workspaceRoot, "artifacts/api-server"),
      env: { ...process.env, NODE_ENV: "development", PORT: String(apiPort), STAFF_BOOTSTRAP_TOKEN: bootstrapToken },
    });
    await waitFor(`${apiOrigin}/api/content/platform`, apiProcess);
    const bootstrap = await api("/api/staff-auth/bootstrap", {
      method: "POST",
      body: { email: ownerEmail, password: ownerPassword, token: bootstrapToken },
    });
    assert.equal(bootstrap.response.status, 201, JSON.stringify(bootstrap.value));
    ownerCookie = sessionCookie(bootstrap.response);
    originalPlatformRow = await currentPlatformRow();
    const snapshotDatabase = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await snapshotDatabase.connect();
    try {
      const snapshot = await snapshotDatabase.query(`select * from soso_site_content where key = 'platform'`);
      assert.equal(snapshot.rowCount, 1, "The isolated storefront fixture must contain platform content.");
      [originalPlatformSnapshot] = snapshot.rows;
    } finally {
      await snapshotDatabase.end();
    }

    await storeReservation.release();
    const storeProcess = start(
      "pnpm",
      ["exec", "vite", "--config", "vite.config.ts", "--host", "127.0.0.1", "--port", String(storePort), "--strictPort"],
      {
        cwd: storeRoot,
        env: { ...process.env, NODE_ENV: "development", PORT: String(storePort), SOSO_API_PROXY_TARGET: apiOrigin },
      },
    );
    await waitFor(storeOrigin, storeProcess);
  }

  async function createStaffUser({ label, password, role = "editor" }) {
    const email = `${prefix}-${label}-${randomUUID()}@example.test`;
    const created = await api("/api/staff/access", {
      cookie: ownerCookie,
      method: "POST",
      body: { email, password, role },
    });
    assert.equal(created.response.status, 201, JSON.stringify(created.value));
    temporaryStaffIds.push(created.value.id);
    const login = await api("/api/staff-auth/login", { method: "POST", body: { email, password } });
    assert.equal(login.response.status, 200, JSON.stringify(login.value));
    return { id: created.value.id, email, cookie: sessionCookie(login.response) };
  }

  async function launchBrowser() {
    browser = await chromium.launch({ headless: true, executablePath: await serverlessChromium.executablePath() });
    return browser;
  }

  async function performCleanup() {
    const errors = [];
    await apiReservation.release().catch((error) => errors.push(error));
    await storeReservation.release().catch((error) => errors.push(error));
    if (browser) await browser.close().catch((error) => errors.push(error));
    await restorePlatformContent().catch((error) => errors.push(error));
    const database = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await database.connect().then(async () => {
      await database.query(
        `delete from soso_staff_users where id = any($1::uuid[]) or email = $2`,
        [temporaryStaffIds, ownerEmail],
      );
    }).catch((error) => errors.push(error)).finally(() => database.end().catch((error) => errors.push(error)));
    for (const record of children.reverse()) {
      await stopProcess(record).catch((error) => errors.push(error));
    }
    if (errors.length) throw new AggregateError(errors, "Staff browser harness cleanup failed");
  }

  function cleanup() {
    cleanupPromise ??= performCleanup();
    return cleanupPromise;
  }

  const signalHandlers = new Map(["SIGINT", "SIGTERM"].map((signal) => [
    signal,
    async () => {
      await cleanup().catch((error) => console.error(error));
      process.kill(process.pid, signal);
    },
  ]));
  for (const [signal, handler] of signalHandlers) process.once(signal, handler);
  process.once("exit", () => {
    for (const record of children) {
      if (record.child.exitCode === null && record.child.signalCode === null) {
        try {
          process.kill(-record.child.pid, "SIGKILL");
        } catch {
          // The process group already exited.
        }
      }
    }
  });

  return {
    api,
    apiOrigin,
    cleanup: async () => {
      for (const [signal, handler] of signalHandlers) process.off(signal, handler);
      return cleanup();
    },
    createStaffUser,
    currentPlatformRow,
    get originalPlatformRow() { return originalPlatformRow; },
    launchBrowser,
    ownerCookie: () => ownerCookie,
    replaceDraftFixture,
    savePlatformContent,
    startServers,
    storeOrigin,
  };
}