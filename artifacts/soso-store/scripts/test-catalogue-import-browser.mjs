import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createStaffBrowserHarness } from "./staff-browser-harness.mjs";

const root = resolve(new URL("../../..", import.meta.url).pathname);
const workbook = resolve(root, "attached_assets/0_SOSO_Online_Stock_Catalogue_-_New_Drive_Collection_-_Draft_1792484546301.xlsx");
const out = resolve(root, process.env.CATALOGUE_PILOT_OUTPUT_DIR ?? "generated-artifacts/catalogue-import-pilot");
const createdPathsFile = resolve(out, "created-paths.json");
const outstandingPathsFile = resolve(out, "outstanding-paths.json");
const rights = "Merchant-supplied for isolated draft verification; publication rights not yet confirmed.";
const password = "PilotOwnerBrowser2026!";
const runId = process.env.CATALOGUE_PILOT_RUN_ID ?? `catalogue-import-${randomUUID()}`;
const startedAt = new Date().toISOString();
const report = { runId, startedAt, updatedAt: startedAt, workbook: "0_SOSO_Online_Stock_Catalogue_-_New_Drive_Collection_-_Draft_1792484546301.xlsx", checks: {}, selected: [], driveCounts: [], errors: [], consoleErrors: [] };
const createdPaths = new Set();
const pathCleanup = new Map();
const pendingResponseTasks = new Set();
let persistPaths = Promise.resolve();
let browser;
let page;
let harness;
let originalDraft;
let parsedRows = [];

async function writeReport() {
  report.updatedAt = new Date().toISOString();
  await writeFile(resolve(out, "report.json"), JSON.stringify(report, null, 2));
}

function persistCreatedPaths() {
  persistPaths = persistPaths.then(() => writeFile(createdPathsFile, JSON.stringify({
    runId,
    createdPaths: [...createdPaths],
    cleanup: Object.fromEntries(pathCleanup),
  }, null, 2)));
  return persistPaths;
}

function safeChildError(text) {
  let safe = String(text ?? "");
  for (const name of ["DATABASE_URL", "CLOUDINARY_URL", "CLOUDINARY_API_SECRET", "AWS_SECRET_ACCESS_KEY", "R2_SECRET_ACCESS_KEY"]) {
    const value = process.env[name];
    if (value) safe = safe.replaceAll(value, "[redacted]");
  }
  return safe.replace(/https?:\/\/\S+/g, "[url]")
    .replace(/\b(Bearer|token|secret|password|cookie)\s*[:=]?\s*\S+/gi, "$1 [redacted]")
    .slice(0, 800);
}

// Validate a prior journal before entering the run's cleanup/finally block.
// Refusing a run must not overwrite the identities that still need cleanup.
await mkdir(out, { recursive: true });
  try {
    const previous = JSON.parse(await readFile(createdPathsFile, "utf8"));
    assert.ok((previous.createdPaths ?? []).every((path) => previous.cleanup?.[path]?.deleted === true),
      "Previously recorded media paths must be confirmed deleted before another pilot.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  try {
    const previous = JSON.parse(await readFile(outstandingPathsFile, "utf8"));
    assert.equal(previous.length, 0, "Outstanding media paths from a prior run must be handled before another pilot.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
try {
  await writeReport();
  await writeFile(createdPathsFile, JSON.stringify({ runId, createdPaths: [], cleanup: {} }, null, 2));
  await writeFile(outstandingPathsFile, JSON.stringify([], null, 2));
  await persistCreatedPaths();
  harness = await createStaffBrowserHarness({ prefix: "cataloguepilot", ownerPassword: password });
  await harness.startServers();
  const original = harness.originalPlatformRow;
  originalDraft = structuredClone(original.draft);
  const originalPublished = structuredClone(original.published);
  const originalProducts = originalDraft.products ?? [];
  const user = await harness.createStaffUser({ label: "pilot", password, role: "editor" });
  browser = await harness.launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  page = await context.newPage();
  page.on("console", (message) => { if (message.type() === "error") report.consoleErrors.push(message.text().slice(0, 500)); });
  page.on("pageerror", (error) => report.consoleErrors.push(error.message.slice(0, 500)));
  page.on("response", (response) => {
    const task = (async () => {
      const url = new URL(response.url());
      if (url.pathname.endsWith("/api/staff/catalogue-import/sheet") && response.ok()) {
        try { parsedRows = (await response.json()).rows ?? []; } catch {}
      }
      if (url.pathname.endsWith("/api/storage/uploads/request-url") && response.ok()) {
        try {
          const value = await response.json();
          // Persist only the durable objectPath immediately; never persist upload URLs or finalize tokens.
          if (typeof value.objectPath === "string" && value.objectPath.startsWith("/api/storage/objects/uploads/")) {
            createdPaths.add(value.objectPath);
            pathCleanup.set(value.objectPath, { deleted: false, state: "created" });
            await persistCreatedPaths();
          }
        } catch {}
      }
      if (url.pathname.startsWith("/api/") && response.status() >= 400) {
        let body;
        try { body = await response.json(); } catch {}
        const error = typeof body?.error === "string" ? body.error.slice(0, 800) : undefined;
        const issues = Array.isArray(body?.issues) ? body.issues : undefined;
        report.errors.push({
          route: url.pathname, status: response.status(),
          ...(error ? { error } : {}),
          ...(issues ? { issues } : {}),
        });
      }
    })();
    pendingResponseTasks.add(task);
    task.then(() => pendingResponseTasks.delete(task), (error) => {
      pendingResponseTasks.delete(task);
      report.pathTrackingError = safeChildError(error);
    });
  });
  await page.goto(`${harness.storeOrigin}/sign-in`);
  await page.getByLabel("Staff email").fill(user.email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/staff");
  await page.getByRole("button", { name: "Platform content" }).click();
  await page.getByTestId("status-message").getByText("Draft and published content are versioned separately.").waitFor({ timeout: 20_000 });
  await page.getByTestId("platform-section-catalogue").click();
  await page.getByTestId("button-toggle-importer").click();
  await page.getByTestId("catalogue-importer").waitFor();
  const guide = page.getByTestId("catalogue-import-guide");
  await guide.locator("summary").click();
  const guidePhrases = [
    "unpublished drafts, not live products",
    "Otherwise download the photos from Drive",
    "Choose Men, Women or Accessories",
    "placeholder/unavailable",
    "deliberately publish the product",
  ];
  for (const phrase of guidePhrases) await guide.getByText(phrase, { exact: false }).waitFor();
  report.checks.guidePhrases = guidePhrases;
  await page.screenshot({ path: resolve(out, "guide-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const phrase of guidePhrases) assert.ok(await guide.getByText(phrase, { exact: false }).isVisible(), `Guide phrase not visible on phone: ${phrase}`);
  await page.screenshot({ path: resolve(out, "guide-phone.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await guide.locator("summary").click();
  await page.getByTestId("input-sheet").setInputFiles(workbook);
  await page.getByTestId("text-sheet-name").waitFor();
  const sheetText = await page.getByTestId("text-sheet-name").textContent();
  report.checks.readRows = sheetText;
  assert.match(sheetText ?? "", /162 rows/, "Expected the real workbook to parse as 162 rows.");
  assert.equal(parsedRows.length, 162, "The real sheet API should return all 162 product groups.");
  const firstRow = parsedRows[0];
  report.firstRow = { row: firstRow.rowNumber, name: firstRow.name, department: firstRow.department, rawCategory: firstRow.category };
  assert.notEqual(firstRow.category, "Kaftans", "The first spreadsheet row is the unsupported-category control case.");
  await page.getByTestId(`button-expand-${firstRow.rowNumber}`).click();
  const firstCategory = page.getByTestId(`select-category-${firstRow.rowNumber}`);
  assert.equal(await firstCategory.inputValue(), "", "Unsupported first-row category must remain unresolved.");
  assert.match(await page.getByTestId(`list-blockers-${firstRow.rowNumber}`).innerText(), /existing collection category/i);
  report.checks.unsupportedFirstRowRequiresExplicitCategory = true;
  await page.getByTestId(`button-expand-${firstRow.rowNumber}`).click();
  const existingSlugs = new Set(originalProducts.map((product) => product.slug));
  const rawKaftans = parsedRows.filter((row) => String(row.department ?? "").trim().toLowerCase() === "men" && row.category === "Kaftans");
  assert.equal(rawKaftans.length, 104, "Expected exactly 104 raw Men / Kaftans groups in this workbook.");
  const folderCounts = new Map();
  for (const row of parsedRows) if (row.driveFolderId) folderCounts.set(row.driveFolderId, (folderCounts.get(row.driveFolderId) ?? 0) + 1);
  assert.ok(originalDraft.collections?.some((collection) => collection.department === "men" && collection.category === "Kaftans"),
    "The chosen category must be an existing Men collection in the isolated draft.");
  const candidates = rawKaftans
    .filter((row) => row.driveFolderId && folderCounts.get(row.driveFolderId) === 1 && !existingSlugs.has(row.slug))
    .map((row) => ({ number: row.rowNumber, slug: row.slug, name: row.name, driveFolderId: row.driveFolderId }));
  assert.ok(candidates.length >= 5, `Only ${candidates.length} non-conflicting Men / Kaftans rows have unique Drive folders.`);
  report.rawMenKaftansCount = rawKaftans.length;
  report.candidateCount = candidates.length;
  const rowNodes = page.locator('[data-testid^="row-import-"]');
  const count = await rowNodes.count();
  // Start from a known clean selection, then explicitly choose five supported, non-conflicting Drive rows.
  for (let i = 0; i < count; i++) {
    const checkbox = page.getByTestId(`checkbox-select-${Number((await rowNodes.nth(i).getAttribute("data-testid")).replace("row-import-", ""))}`);
    if (await checkbox.isChecked()) await checkbox.uncheck();
  }
  const chosen = [];
  for (const item of candidates) {
    if (chosen.length === 5) break;
    await page.getByTestId(`button-expand-${item.number}`).click();
    if (!(await page.getByTestId(`button-scan-${item.number}`).count())) continue;
    const checkbox = page.getByTestId(`checkbox-select-${item.number}`);
    if (!(await checkbox.isChecked())) await checkbox.check();
    await page.getByTestId(`input-rights-${item.number}`).fill(rights);
    const department = await page.getByTestId(`select-department-${item.number}`).inputValue();
    assert.equal(department, "men", "The pilot selects only raw Men groups.");
    const category = page.getByTestId(`select-category-${item.number}`);
    assert.ok(await category.locator("option").evaluateAll((opts) => opts.some((option) => option.textContent?.trim() === "Kaftans")), "Kaftans must be a selectable existing category.");
    await category.selectOption({ label: "Kaftans" });
    assert.equal(await category.locator("option:checked").textContent(), "Kaftans");
    chosen.push({ number: item.number, department: "men", category: "Kaftans", slug: item.slug, name: item.name, folderId: item.driveFolderId });
    report.selected.push({ row: item.number, department: "men", category: "Kaftans", group: item.name, slug: item.slug });
  }
  assert.equal(chosen.length, 5, "Select five supported spreadsheet groups with real Drive folders.");
  // Save the review state and take requested signed-in screenshots before the expensive real uploads.
  await page.screenshot({ path: resolve(out, "catalogue-import-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve(out, "catalogue-import-phone.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByTestId("button-scan-selected").click();
  await page.getByTestId("button-scan-selected").getByText("Scan Drive for 5 selected", { exact: true }).waitFor({ timeout: 180_000 });
  for (const item of chosen) {
    await page.getByTestId(`button-expand-${item.number}`).click();
    const row = page.getByTestId(`row-import-${item.number}`);
    const photos = row.locator('[data-testid^="photo-"]');
    const total = await photos.count();
    assert.ok(total > 0, `Drive returned no photos for row ${item.number}.`);
    report.driveCounts.push({ row: item.number, listed: total });
    await page.getByTestId(`button-thumbs-${item.number}`).click();
    await page.getByTestId(`photo-${item.number}-0`).waitFor();
    // One original per group, with a second in one group to verify gallery order.
    const includeCount = item.number === chosen[0].number && total > 1 ? 2 : 1;
    for (let i = includeCount; i < total; i++) await page.getByTestId(`button-include-${item.number}-${i}`).click();
    await page.getByTestId(`button-cover-${item.number}-0`).click();
    await page.getByTestId(`checkbox-accept-${item.number}`).check();
  }
  await page.getByTestId("input-shared-fabric").fill("");
  await page.getByTestId("input-shared-fit").fill("");
  await page.getByTestId("input-shared-sizes").fill("");
  await page.getByTestId("input-shared-rights").fill("");
  const draftBefore = await harness.currentPlatformRow(user.cookie);
  assert.deepEqual(draftBefore.draft, originalDraft, "Reviewing import must not mutate the draft before explicit save.");
  report.checks.preSaveUntouched = true;

  await page.getByTestId("button-upload-save").click();
  await page.getByTestId("text-import-success").waitFor({ timeout: 180_000 });
  const after = await harness.currentPlatformRow(user.cookie);
  assert.equal(after.draft.products.length, originalProducts.length + 5);
  assert.deepEqual(after.published, originalPublished, "Import must not publish.");
  const added = after.draft.products.filter((p) => !originalProducts.some((old) => old.slug === p.slug));
  assert.equal(added.length, 5);
  for (const product of added) {
    assert.equal(product.releaseState, "placeholder");
    assert.equal(product.fulfilmentState, "unavailable");
    assert.equal(product.price, 1);
    assert.equal(product.standardEligible, false);
    assert.equal(product.customEligible, false);
    assert.equal(product.commerceProductId, undefined);
    assert.equal(product.commerceVariantIds, undefined);
    assert.equal(product.standardSizes?.length ?? 0, 0);
    assert.equal(product.readyNowSizes?.length ?? 0, 0);
    assert.equal(product.category, "Kaftans");
    assert.ok(product.images.length === (product.slug === chosen[0].slug && (report.driveCounts.find((entry) => chosen[0].number === entry.row)?.listed ?? 0) > 1 ? 2 : 1));
    assert.ok(product.images.every((image) => image.provenance?.rights === rights));
    for (const image of product.images) {
      assert.ok(createdPaths.has(image.src), "Every saved image path must have been journaled from this run's upload authorization.");
    }
  }
  assert.deepEqual(after.published, originalPublished);
  report.checks.savedProducts = added.map((p) => ({ slug: p.slug, photos: p.images.length, department: p.department, placeholder: p.releaseState, fulfilment: p.fulfilmentState }));
  report.checks.publishedUnchanged = true;
  report.checks.draftExistingRowsUnchanged = originalProducts.every((p) => JSON.stringify(after.draft.products.find((x) => x.slug === p.slug)) === JSON.stringify(p));
  assert.ok(report.checks.draftExistingRowsUnchanged);
  report.uploadPathCount = createdPaths.size;
  await page.reload();
  await page.getByRole("button", { name: "Platform content" }).click();
  await page.getByTestId("platform-section-catalogue").click();
  await page.getByTestId("button-toggle-importer").click();
  await page.getByTestId("status-import-restored").waitFor({ timeout: 15_000 });
  for (const item of chosen) await page.getByTestId(`status-group-${item.number}`).getByText("Saved to draft").waitFor();
  report.checks.restoreAfterReload = true;
  assert.equal((await harness.currentPlatformRow(user.cookie)).draft.products.length, originalProducts.length + 5);
  for (const item of chosen) {
    await page.getByTestId(`status-group-${item.number}`).getByText("Saved to draft").waitFor();
    assert.equal(await page.getByTestId(`checkbox-select-${item.number}`).isDisabled(), true,
      "A saved group must not be reselectable for duplicate import.");
  }
  report.checks.savedBadgesRestoredAfterImmediateReload = true;
  report.checks.duplicateUiGuard = true;
  const duplicateAttempt = await harness.api("/api/staff/content/platform/import/draft", {
    cookie: user.cookie,
    method: "POST",
    body: { expectedDraftUpdatedAt: (await harness.currentPlatformRow(user.cookie)).draftUpdatedAt, products: [added[0]] },
  });
  assert.equal(duplicateAttempt.response.status, 409, `Duplicate API import should return HTTP 409, received ${duplicateAttempt.response.status}.`);
  report.checks.duplicateApiGuard = { status: duplicateAttempt.response.status, error: duplicateAttempt.value?.error ?? null };
  const afterDuplicate = await harness.currentPlatformRow(user.cookie);
  assert.equal(afterDuplicate.draft.products.length, originalProducts.length + 5, "Duplicate retry must not add a sixth product.");
  assert.deepEqual(afterDuplicate.published, originalPublished);
  report.checks.serverAndConsoleErrors = { api: report.errors, console: report.consoleErrors };
  await page.screenshot({ path: resolve(out, "catalogue-import-saved-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve(out, "catalogue-import-saved-phone.png"), fullPage: true });
  await writeReport();
  console.log(JSON.stringify(report));
  await context.close();
} catch (error) {
  report.failure = String(error?.stack ?? error).slice(0, 3000);
  if (page) {
    report.failurePage = { url: page.url(), text: (await page.locator("body").innerText().catch(() => "")).slice(0, 2000) };
    await page.screenshot({ path: resolve(out, "failure-current-state.png"), fullPage: true }).catch(() => {});
  }
  report.uploadPathCount = createdPaths.size;
  console.error(JSON.stringify(report));
  process.exitCode = 1;
} finally {
  try {
    await persistPaths;
    // Restore only this isolated schema's platform draft before deleting exact run-created paths.
    let draftRestored = true;
    if (originalDraft) {
      const current = await harness.currentPlatformRow().catch(() => null);
      if (!current?.draft) {
        draftRestored = false;
        throw new Error("Could not verify isolated draft restoration; exact-path media deletion withheld.");
      }
      if (JSON.stringify(current.draft) !== JSON.stringify(originalDraft)) {
        const restore = await harness.savePlatformContent(harness.ownerCookie(), originalDraft, current.draftUpdatedAt);
        draftRestored = restore.response.status === 200;
        if (!draftRestored) throw new Error(`Isolated draft restore failed (${restore.response.status}); media deletion withheld.`);
      }
    }
    if (createdPaths.size) {
      if (!draftRestored) throw new Error("Media deletion withheld because isolated draft restoration was not confirmed.");
      const objectPaths = [...createdPaths];
      const storageModule = pathToFileURL(resolve(root, "artifacts/api-server/src/lib/media-storage.ts")).href;
      const source = `void (async () => {
        const { createMediaStorageService } = await import(${JSON.stringify(storageModule)});
        const storage = createMediaStorageService();
        const items = JSON.parse(process.env.PILOT_MEDIA_PATHS);
        const results = [];
        for (const objectPath of items) {
          const prefix = "/api/storage/objects/";
          if (typeof objectPath !== "string" || !objectPath.startsWith(prefix)) {
            results.push({ objectPath, deleted: false, errorType: "InvalidObjectPath" }); continue;
          }
          const relative = objectPath.slice(prefix.length);
          if (!relative.startsWith("uploads/")) {
            results.push({ objectPath, deleted: false, errorType: "NotAnUploadedMediaPath" }); continue;
          }
          try {
            await storage.deleteUploadedMedia(relative);
            results.push({ objectPath, deleted: true });
          } catch (error) {
            results.push({ objectPath, deleted: false, errorType: error?.name || "DeleteError" });
          }
        }
        console.log("PILOT_CLEANUP_JSON:" + JSON.stringify(results));
        if (results.some((result) => !result.deleted)) process.exitCode = 1;
      })().catch((error) => { console.error("PILOT_CLEANUP_FATAL:" + (error?.name || "CleanupError")); process.exitCode = 1; });`;
      const cleanup = spawnSync("pnpm", ["--dir", resolve(root, "scripts"), "exec", "tsx", "--eval", source], {
        cwd: root, encoding: "utf8", maxBuffer: 2_000_000,
        env: { ...process.env, PILOT_MEDIA_PATHS: JSON.stringify(objectPaths) },
      });
      const marker = cleanup.stdout?.split(/\r?\n/).find((line) => line.startsWith("PILOT_CLEANUP_JSON:"));
      const results = marker ? JSON.parse(marker.slice("PILOT_CLEANUP_JSON:".length)) : [];
      for (const result of results) {
        pathCleanup.set(result.objectPath, result.deleted
          ? { deleted: true, state: "deleted" }
          : { deleted: false, state: "outstanding", errorType: result.errorType ?? "DeleteError" });
      }
      const outstanding = objectPaths.filter((objectPath) => !results.some((result) => result.objectPath === objectPath && result.deleted));
      await writeFile(outstandingPathsFile, JSON.stringify(outstanding, null, 2));
      await persistCreatedPaths();
      report.cleanup = {
        attempted: objectPaths.length,
        deleted: results.filter((result) => result.deleted).length,
        outstanding,
        ...(cleanup.status !== 0 ? { childExitCode: cleanup.status, childError: safeChildError(cleanup.stderr) } : {}),
      };
      if (cleanup.status !== 0 || outstanding.length) {
        throw new Error(`Exact-path media cleanup incomplete (${outstanding.length} outstanding).`);
      }
    }
  } catch (cleanupError) {
    report.cleanupError = String(cleanupError?.message ?? cleanupError).slice(0, 500);
    const outstanding = [...createdPaths].filter((objectPath) => pathCleanup.get(objectPath)?.deleted !== true);
    if (outstanding.length) {
      await writeFile(outstandingPathsFile, JSON.stringify(outstanding, null, 2)).catch(() => {});
      report.cleanup ??= { attempted: 0, deleted: 0, outstanding };
    }
    process.exitCode = 1;
  }
  await Promise.allSettled([...pendingResponseTasks]);
  report.uploadPathCount ??= createdPaths.size;
  await persistPaths.catch(() => {});
  try { await writeReport(); } catch (error) { console.error(`Fresh report write failed: ${safeChildError(error)}`); process.exitCode = 1; }
  if (harness) await harness.cleanup().catch((error) => { console.error(`Harness cleanup failed: ${safeChildError(error)}`); process.exitCode = 1; });
}
