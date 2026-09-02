import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import serverlessChromium from "@sparticuz/chromium";
import { PNG } from "pngjs";
import pg from "pg";

const storeRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const workspaceRoot = resolve(storeRoot, "../..");
const apiPort = 43181;
const storePort = 43182;
const apiOrigin = `http://127.0.0.1:${apiPort}`;
const storeOrigin = `http://127.0.0.1:${storePort}`;
const ownerEmail = `mask-owner-${randomUUID()}@example.test`;
const editorEmail = `mask-editor-${randomUUID()}@example.test`;
const ownerPassword = "MaskOwnerBrowser123!";
const editorPassword = "MaskEditorBrowser123!";
const bootstrapToken = `mask-bootstrap-${randomUUID()}`;
const baseAPath = "/api/storage/objects/uploads/browser-mask-base-a.png";
const baseBPath = "/api/storage/objects/uploads/browser-mask-base-b.png";
const approvedPath = "/api/storage/objects/uploads/browser-approved-garment-mask.png";
const initialMaskPath = "/api/storage/objects/uploads/existing-approved-garment-mask.png";
const children = [];
let ownerCookie = "";
let editorId = "";
let originalRow;
let browser;
let contentMutated = false;

function makePng(width, height) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const garment = x > 0 && x < width - 1 && y > 0 && y < height - 1;
      png.data[index] = garment ? 20 : 245;
      png.data[index + 1] = garment ? 40 : 245;
      png.data[index + 2] = garment ? 80 : 245;
      png.data[index + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

function makeMask(width, height) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const garment = x > 0 && x < width - 1 && y > 0 && y < height - 1;
      png.data[index] = 255;
      png.data[index + 1] = 255;
      png.data[index + 2] = 255;
      png.data[index + 3] = garment ? 255 : 0;
    }
  }
  return PNG.sync.write(png);
}

function start(command, args, options) {
  const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  children.push({ child, getOutput: () => output });
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
  return { response, value: text ? JSON.parse(text) : null };
}

function sessionCookie(response) {
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie, "Expected staff authentication to set a session cookie.");
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

async function replaceDraftFixture(content) {
  const database = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await database.connect();
  await database.query(
    `update soso_site_content
     set draft = $1::jsonb, draft_updated_at = now()
     where key = 'platform'`,
    [JSON.stringify(content)],
  );
  await database.end();
}

async function restoreContent() {
  if (!contentMutated || !originalRow || !ownerCookie) return;
  await replaceDraftFixture(originalRow.draft);
}

try {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required.");
  const database = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await database.connect();
  await database.query(
    `insert into soso_staff_users (clerk_user_id, email, role, is_active)
     values ($1, $2, 'owner', true)`,
    [`mask-owner-${randomUUID()}`, ownerEmail],
  );
  await database.end();

  start("node", ["--enable-source-maps", "dist/index.mjs"], {
    cwd: resolve(workspaceRoot, "artifacts/api-server"),
    env: { ...process.env, NODE_ENV: "development", PORT: String(apiPort), STAFF_BOOTSTRAP_TOKEN: bootstrapToken },
  });
  await waitFor(`${apiOrigin}/api/content/platform`, children[0]);

  const bootstrap = await api("/api/staff-auth/bootstrap", {
    method: "POST",
    body: { email: ownerEmail, password: ownerPassword, token: bootstrapToken },
  });
  assert.equal(bootstrap.response.status, 201, JSON.stringify(bootstrap.value));
  ownerCookie = sessionCookie(bootstrap.response);
  originalRow = await currentRow(ownerCookie);
  assert.ok(originalRow.draft?.products?.length, "The isolated fixture must contain a catalogue product.");

  const product = originalRow.draft.products[0];
  const seededContent = structuredClone(originalRow.draft);
  seededContent.products[0].colourVisualizer = {
    baseImageSrc: baseAPath,
    garmentMaskSrc: initialMaskPath,
  };
  await replaceDraftFixture(seededContent);
  contentMutated = true;

  const created = await api("/api/staff/access", {
    cookie: ownerCookie,
    method: "POST",
    body: { email: editorEmail, password: editorPassword, role: "editor" },
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.value));
  editorId = created.value.id;

  start("pnpm", ["exec", "vite", "--config", "vite.config.ts", "--host", "127.0.0.1", "--port", String(storePort)], {
    cwd: storeRoot,
    env: { ...process.env, NODE_ENV: "development", PORT: String(storePort), SOSO_API_PROXY_TARGET: apiOrigin },
  });
  await waitFor(storeOrigin, children[1]);

  browser = await chromium.launch({ headless: true, executablePath: await serverlessChromium.executablePath() });
  const context = await browser.newContext();
  const page = await context.newPage();
  const basePng = makePng(8, 8);
  const matchingMask = makeMask(8, 8);
  const mismatchedMask = makeMask(7, 8);
  let delayBaseA = true;
  let uploadRequests = 0;

  await page.route(`**${baseAPath}`, async (route) => {
    if (delayBaseA) await new Promise((resolveWait) => setTimeout(resolveWait, 500));
    await route.fulfill({ status: 200, contentType: "image/png", body: basePng });
  });
  await page.route(`**${baseBPath}`, (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: basePng }));
  await page.route("**/api/storage/uploads/request-url", async (route) => {
    uploadRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        uploadURL: `${storeOrigin}/mask-test/upload`,
        uploadMethod: "POST",
        uploadFields: {},
        objectPath: approvedPath,
      }),
    });
  });
  await page.route("**/mask-test/upload", (route) => route.fulfill({ status: 204 }));
  await page.route("**/api/storage/uploads/finalize", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ objectPath: approvedPath }) }));

  await page.goto(`${storeOrigin}/sign-in`);
  await page.getByLabel("Staff email").fill(editorEmail);
  await page.getByLabel("Password").fill(editorPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/staff");
  await page.getByRole("button", { name: "Platform content" }).click();
  await page.getByText("Draft and published content are versioned separately.").waitFor();
  await page.getByTestId("platform-section-catalogue").click();
  await page.getByTestId(`catalogue-product-header-${product.slug}`).click();

  const baseInput = page.getByTestId(`input-mask-base-${product.slug}`);
  const approvedOutput = page.getByTestId(`mask-approved-path-${product.slug}`);
  const prepareButton = page.getByTestId(`button-mask-prepare-${product.slug}`);
  const draft = page.getByTestId(`mask-draft-${product.slug}`);
  const reviewInput = page.getByTestId(`input-mask-review-${product.slug}`);

  await approvedOutput.getByText(initialMaskPath, { exact: true }).waitFor();
  await prepareButton.click();
  await baseInput.fill(baseBPath);
  await page.waitForTimeout(650);
  assert.equal(await draft.count(), 0, "A draft prepared for a replaced base image must be discarded.");
  await approvedOutput.getByText("None — live recolouring remains off", { exact: true }).waitFor();

  delayBaseA = false;
  await baseInput.fill(baseAPath);
  await prepareButton.click();
  await draft.waitFor();
  assert.equal(uploadRequests, 0, "Preparing a draft must not upload or assign a mask.");
  await approvedOutput.getByText("None — live recolouring remains off", { exact: true }).waitFor();
  await page.getByTestId(`button-mask-discard-${product.slug}`).click();
  assert.equal(await draft.count(), 0, "Discard draft must remove the pending review.");

  await reviewInput.setInputFiles({ name: "wrong-size.png", mimeType: "image/png", buffer: mismatchedMask });
  await page.getByTestId(`mask-error-${product.slug}`)
    .getByText("The mask dimensions must exactly match the selected base image.", { exact: true }).waitFor();
  assert.equal(await page.getByTestId(`button-mask-approve-${product.slug}`).count(), 0);
  assert.equal(uploadRequests, 0, "A dimension-mismatched PNG must never reach upload.");

  await reviewInput.setInputFiles({ name: "matching-mask.png", mimeType: "image/png", buffer: matchingMask });
  await draft.waitFor();
  assert.equal(uploadRequests, 0, "Reviewing a valid PNG must remain local until explicit approval.");
  await approvedOutput.getByText("None — live recolouring remains off", { exact: true }).waitFor();

  await page.getByTestId(`button-mask-approve-${product.slug}`).click();
  await approvedOutput.getByText(approvedPath, { exact: true }).waitFor();
  assert.equal(uploadRequests, 1, "Only Approve & use mask may start the governed upload.");
  assert.equal(await draft.count(), 0, "Approval must clear the reviewed draft.");

  await context.close();
  console.log("Garment mask browser approval regressions passed.");
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