import { test } from "node:test";
import assert from "node:assert/strict";
import { errorStatus, exportFileName, subscriberQuery } from "./staff-mail-api";

test("subscriberQuery includes groupId only when set", () => {
  assert.equal(subscriberQuery("confirmed"), "status=confirmed");
  assert.equal(subscriberQuery("all", "g1", "c2"), "status=all&groupId=g1&before=c2");
});
test("exportFileName is xlsx and slugged", () => {
  assert.match(exportFileName("pending", "VIP Lagos!"), /^subscribers-pending-vip-lagos-\d{4}-\d{2}-\d{2}\.xlsx$/);
});
test("errorStatus reads ApiError status", () => {
  assert.equal(errorStatus({ status: 409 }), 409);
  assert.equal(errorStatus(new Error("x")), undefined);
});
