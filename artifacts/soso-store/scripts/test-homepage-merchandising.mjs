import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import serverlessChromium from "@sparticuz/chromium";
import pg from "pg";

const storeRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const workspaceRoot = resolve(storeRoot, "../..");
const apiPort = 43171;
const storePort = 43172;
const apiOrigin = `http://127.0.0.1:${apiPort}`;
const storeOrigin = `http://127.0.0.1:${storePort}`;
const ownerEmail = `homepage-owner-${randomUUID()}@example.test`;
const editorEmail = `homepage-editor-${randomUUID()}@example.test`;
const ownerPassword = "HomepageOwner123!";
const editorPassword = "HomepageEditor123!";
const bootstrapToken = `homepage-bootstrap-${randomUUID()}`;
const children = [];
let ownerCookie = "";
let editorCookie = "";
let editorId = "";
let originalRow;
let browser;
let contentMutated = false;

function start(command, args, options) {
  const child = spawn(command, args, {
    ...options,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  children.push({ child, getOutput: () => output });
  return child;
}

async function waitFor(url, processRecord) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (processRecord.child.exitCode !== null) {
      throw new Error(`Process exited before ${url} was ready.\n${processRecord.getOutput()}`);
    }
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Timed out waiting for ${url}.\n${processRecord.getOutput()}`);
}

async function api(path, { cookie = "", method = "GET", body } = {}) {
  const response = await fetch(`${apiOrigin}${path}`, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(["POST", "PUT", "PATCH", "DELETE"].includes(method) ? { origin: apiOrigin } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const value = text ? JSON.parse(text) : null;
  return { response, value };
}

function sessionCookie(response) {
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie, "Expected the staff login to set a session cookie.");
  return setCookie.split(";", 1)[0];
}

async function currentRow(cookie) {
  const result = await api("/api/staff/content/platform", { cookie });
  assert.equal(result.response.status, 200, JSON.stringify(result.value));
  return result.value;
}

async function saveContent(cookie, content, expectedDraftUpdatedAt) {
  return api("/api/staff/content/platform", {
    cookie,
    method: "PUT",
    body: { content, expectedDraftUpdatedAt },
  });
}

async function restoreContent() {
  if (!contentMutated || !originalRow || !ownerCookie) return;
  let row = await currentRow(ownerCookie);
  if (originalRow.published) {
    const publicDraft = await saveContent(ownerCookie, originalRow.published, row.draftUpdatedAt);
    assert.equal(publicDraft.response.status, 200, JSON.stringify(publicDraft.value));
    const published = await api("/api/staff/content/platform/publish", {
      cookie: ownerCookie,
      method: "POST",
      body: { expectedDraftUpdatedAt: publicDraft.value.draftUpdatedAt },
    });
    assert.equal(published.response.status, 200, JSON.stringify(published.value));
    row = published.value;
  } else {
    const unpublished = await api("/api/staff/content/platform/unpublish", {
      cookie: ownerCookie,
      method: "POST",
      body: { expectedDraftUpdatedAt: row.draftUpdatedAt },
    });
    assert.equal(unpublished.response.status, 200, JSON.stringify(unpublished.value));
    row = unpublished.value;
  }
  if (originalRow.draft) {
    const restoredDraft = await saveContent(ownerCookie, originalRow.draft, row.draftUpdatedAt);
    assert.equal(restoredDraft.response.status, 200, JSON.stringify(restoredDraft.value));
  }
}

async function merchandisingValues(page, prefix, length) {
  return Promise.all(Array.from({ length }, (_, index) =>
    page.getByTestId(`${prefix}-${index}`).getAttribute("data-merchandising-value")));
}

try {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required.");
  const database = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await database.connect();
  await database.query(
    `insert into soso_staff_users (clerk_user_id, email, role, is_active)
     values ($1, $2, 'owner', true)`,
    [`homepage-owner-${randomUUID()}`, ownerEmail],
  );
  await database.end();

  start("node", ["--enable-source-maps", "dist/index.mjs"], {
    cwd: resolve(workspaceRoot, "artifacts/api-server"),
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: String(apiPort),
      STAFF_BOOTSTRAP_TOKEN: bootstrapToken,
    },
  });
  await waitFor(`${apiOrigin}/api/content/platform`, children[0]);

  const bootstrap = await api("/api/staff-auth/bootstrap", {
    method: "POST",
    body: { email: ownerEmail, password: ownerPassword, token: bootstrapToken },
  });
  assert.equal(bootstrap.response.status, 201, JSON.stringify(bootstrap.value));
  ownerCookie = sessionCookie(bootstrap.response);
  originalRow = await currentRow(ownerCookie);
  assert.ok(originalRow.draft && originalRow.published, "The isolated storefront fixture must start with draft and published content.");

  const created = await api("/api/staff/access", {
    cookie: ownerCookie,
    method: "POST",
    body: { email: editorEmail, password: editorPassword, role: "editor" },
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.value));
  editorId = created.value.id;
  const editorLogin = await api("/api/staff-auth/login", {
    method: "POST",
    body: { email: editorEmail, password: editorPassword },
  });
  assert.equal(editorLogin.response.status, 200, JSON.stringify(editorLogin.value));
  editorCookie = sessionCookie(editorLogin.response);

  start("pnpm", ["exec", "vite", "--config", "vite.config.ts", "--host", "127.0.0.1", "--port", String(storePort)], {
    cwd: storeRoot,
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: String(storePort),
      SOSO_API_PROXY_TARGET: apiOrigin,
    },
  });
  await waitFor(storeOrigin, children[1]);

  browser = await chromium.launch({
    headless: true,
    executablePath: await serverlessChromium.executablePath(),
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${storeOrigin}/sign-in`);
  await page.getByLabel("Staff email").fill(editorEmail);
  await page.getByLabel("Password").fill(editorPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/staff");

  const [browserPlatformResponse] = await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === "/api/staff/content/platform" && response.request().method() === "GET"),
    page.getByRole("button", { name: "Platform content" }).click(),
  ]);
  const browserPlatformRow = await browserPlatformResponse.json();
  await page.getByText("Draft and published content are versioned separately.").waitFor();
  await page.getByTestId("platform-section-homepage").click();
  await page.getByTestId("homepage-structured-editor").waitFor();

  const initialCategories = await merchandisingValues(page, "homepage-category", 4);
  const initialFeatured = await merchandisingValues(page, "homepage-featured", 4);
  const initialOccasions = await merchandisingValues(page, "homepage-occasion", 2);
  const initialArrival = await page.getByTestId("homepage-new-arrival-product").inputValue();
  const alternateArrival = originalRow.draft.products
    .map((product) => product.slug)
    .find((slug) => slug !== initialArrival);
  assert.ok(alternateArrival, "Expected an alternate published product for New Arrival.");
  const productNameBySlug = new Map(originalRow.draft.products.map((product) => [product.slug, product.name]));

  await page.getByTestId("homepage-category-0").getByRole("button", { name: "Move down" }).click();
  await page.getByTestId("homepage-featured-0").getByRole("button", { name: "Move down" }).click();
  await page.getByTestId("homepage-occasion-0").getByRole("button", { name: "Move down" }).click();
  await page.getByTestId("homepage-new-arrival-product").selectOption(alternateArrival);

  const expectedCategories = [initialCategories[1], initialCategories[0], ...initialCategories.slice(2)];
  const expectedFeatured = [initialFeatured[1], initialFeatured[0], ...initialFeatured.slice(2)];
  const expectedOccasions = [initialOccasions[1], initialOccasions[0]];
  assert.deepEqual(await merchandisingValues(page, "homepage-category", 4), expectedCategories);
  assert.deepEqual(await merchandisingValues(page, "homepage-featured", 4), expectedFeatured);
  assert.deepEqual(await merchandisingValues(page, "homepage-occasion", 2), expectedOccasions);
  await page.getByTestId("homepage-summary-categories").getByText(String(expectedCategories[0]), { exact: false }).waitFor();
  await page.getByTestId("homepage-summary-new-arrival").getByText(productNameBySlug.get(alternateArrival), { exact: false }).waitFor();
  await page.getByTestId("homepage-summary-featured").getByText(String(productNameBySlug.get(expectedFeatured[0])), { exact: false }).waitFor();
  await page.getByTestId("homepage-summary-occasions").getByText(String(expectedOccasions[0]), { exact: false }).waitFor();

  const rowBeforeSave = await currentRow(editorCookie);
  assert.deepEqual(rowBeforeSave.draft, browserPlatformRow.draft, "Platform default merging must be idempotent.");
  assert.equal(rowBeforeSave.draftUpdatedAt, browserPlatformRow.draftUpdatedAt, "The draft changed after the browser loaded it.");
  const [saveResponse] = await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === "/api/staff/content/platform" && response.request().method() === "PUT"),
    page.getByTestId("btn-save-draft").click(),
  ]);
  assert.equal(saveResponse.status(), 200, await saveResponse.text());
  contentMutated = true;

  const savedRow = await currentRow(editorCookie);
  const invalidContent = structuredClone(savedRow.draft);
  invalidContent.homepage.featured.productSlugs[1] = invalidContent.homepage.featured.productSlugs[0];
  const rejected = await saveContent(editorCookie, invalidContent, savedRow.draftUpdatedAt);
  assert.equal(rejected.response.status, 400, "Publication safeguards must reject duplicate featured products.");

  const [publishResponse] = await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === "/api/staff/content/platform/publish"),
    page.getByTestId("btn-publish").click(),
  ]);
  assert.equal(publishResponse.status(), 200, await publishResponse.text());
  await page.goto(storeOrigin);
  await page.getByTestId("link-home-hero-primary").waitFor();
  assert.deepEqual(await merchandisingValues(page, "home-category", 4), expectedCategories);
  assert.equal(await page.getByTestId("home-new-arrival").getAttribute("data-merchandising-value"), alternateArrival);
  assert.deepEqual(await merchandisingValues(page, "home-featured", 4), expectedFeatured);
  assert.deepEqual(await merchandisingValues(page, "home-occasion", 2), expectedOccasions);
  await context.close();
  console.log("Homepage merchandising browser regression passed.");
} finally {
  if (browser) await browser.close().catch(() => {});
  await restoreContent().catch((error) => {
    console.error("Failed to restore platform content:", error);
    process.exitCode = 1;
  });
  if (editorId && ownerCookie) {
    const deactivated = await api(`/api/staff/access/${editorId}`, {
      cookie: ownerCookie,
      method: "PATCH",
      body: { isActive: false },
    }).catch(() => null);
    if (!deactivated || deactivated.response.status !== 200) {
      console.error("Failed to deactivate the temporary editor.");
      process.exitCode = 1;
    }
  }
  for (const { child } of children.reverse()) {
    if (child.exitCode === null) child.kill("SIGTERM");
  }
}