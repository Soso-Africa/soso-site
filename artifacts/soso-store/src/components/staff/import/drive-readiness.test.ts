import assert from "node:assert/strict";
import test from "node:test";
import { driveScanBlocker } from "./drive-readiness";

const connected = { configured: true, connected: true, workspace: false, folders: ["folder-a"], expiresAt: "2099-01-01T00:00:00Z" };
test("scan explains missing setup rather than sending an unauthorised request", () => {
  assert.match(driveScanBlocker(null, ["folder-a"])!, /Checking Google Drive/);
  assert.match(driveScanBlocker({ ...connected, configured: false }, ["folder-a"])!, /not set up on this site/);
  assert.match(driveScanBlocker({ ...connected, connected: false }, ["folder-a"])!, /Connect Google Drive/);
  assert.match(driveScanBlocker(connected, ["folder-b"])!, /Select this spreadsheet folder/);
  assert.match(driveScanBlocker(connected, ["folder-a", "folder-b"])!, /each product/);
  assert.match(driveScanBlocker(connected, [])!, /No spreadsheet Drive folder/);
});
test("only selected folders on a current connection or a development workspace may scan", () => {
  assert.equal(driveScanBlocker(connected, ["folder-a"]), null);
  assert.match(driveScanBlocker({ ...connected, expiresAt: "2000-01-01T00:00:00Z" }, ["folder-a"])!, /expired/);
  assert.equal(driveScanBlocker({ ...connected, configured: false, connected: false, workspace: true, folders: [] }, ["folder-a"]), null);
});
