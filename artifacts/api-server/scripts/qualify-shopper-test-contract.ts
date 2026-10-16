/**
 * Synthetic merchant-contract qualification, NOT an end-user auth test.
 * Writes only to a jsk_test_ credential's Test workspace. No order/payment.
 * One synthetic customer remains for audit; created measurements are deleted.
 * Logs contain step/status only, never credentials or customer payloads.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  GetShopperProfileResponse, UpdateShopperProfileResponse,
  GetShopperOrdersResponse, GetShopperOrderResponse, GetShopperProductionResponse,
  GetShopperMeasurementsResponse, CreateShopperMeasurementResponse,
  UpdateShopperMeasurementResponse, DeleteShopperMeasurementResponse,
} from "@workspace/api-zod";
import { justiceSureConfig } from "../src/lib/justicesureCommerce";
import { customerRequest, customerPath, linkVerifiedShopper, ShopperError } from "../src/lib/shopper-accounts";

const config = justiceSureConfig();
if (process.env.NODE_ENV === "production" || !config.apiKey?.startsWith("jsk_test_")
  || config.baseUrl !== "https://justicesure.ai/api/v1/commerce") {
  throw new Error("Qualification requires the documented origin and a Test credential outside production.");
}
const runId = randomUUID();
const identity = {
  externalId: `soso:qa:contract:${runId}`, email: `soso-qa-${runId}@example.test`, name: "SOSO Synthetic QA Shopper",
};
const path = customerPath(identity.externalId);
let step = "link";
let measurement: { id: string; revision: number } | undefined;
const ok = () => console.log(JSON.stringify({ environment: "test", step, status: "passed" }));
try {
  const linked = await linkVerifiedShopper(identity, {});
  assert.equal(linked.customer.externalId, identity.externalId);
  ok();
  step = "idempotent-link";
  assert.equal((await linkVerifiedShopper(identity, {})).customer.id, linked.customer.id);
  ok();
  step = "profile-read";
  const profile = await customerRequest(path, GetShopperProfileResponse);
  assert.equal(profile.customer.id, linked.customer.id);
  ok();
  step = "profile-update";
  const changed = await customerRequest(path, UpdateShopperProfileResponse, "PATCH", { name: "SOSO Synthetic QA Updated", address: "Synthetic QA address; not for fulfilment" });
  assert.equal(changed.customer.name, "SOSO Synthetic QA Updated");
  ok();
  step = "orders";
  const orders = await customerRequest(`${path}/orders?limit=20&offset=0`, GetShopperOrdersResponse);
  assert.equal(orders.orders.length, 0);
  ok();
  step = "unknown-owned-order-denied";
  await assert.rejects(customerRequest(`${path}/orders/${randomUUID()}`, GetShopperOrderResponse),
    (error: unknown) => error instanceof ShopperError && error.status === 404);
  ok();
  step = "production";
  await customerRequest(`${path}/production`, GetShopperProductionResponse);
  ok();
  if (profile.capabilities?.measurements) {
    step = "measurements-read";
    const measurements = await customerRequest(`${path}/measurements`, GetShopperMeasurementsResponse);
    ok();
    if (!measurements.fields.length || !measurements.units.length) throw new Error("Enabled measurements require field and unit metadata.");
    const field = measurements.fields[0];
    const payload = { name: "Synthetic QA Fit", unit: measurements.units[0], entries: [{ ...field, value: "40" }] };
    step = "measurement-create";
    measurement = await customerRequest(`${path}/measurements`, CreateShopperMeasurementResponse, "POST", payload);
    ok();
    const previous = measurement;
    step = "measurement-update";
    measurement = await customerRequest(`${path}/measurements/${measurement.id}`, UpdateShopperMeasurementResponse, "PUT", { ...payload, name: "Synthetic QA Revised", revision: measurement.revision });
    assert.ok(measurement.revision > previous.revision);
    ok();
    step = "stale-measurement-update-denied";
    await assert.rejects(customerRequest(`${path}/measurements/${measurement.id}`, UpdateShopperMeasurementResponse, "PUT", { ...payload, revision: previous.revision }),
      (error: unknown) => error instanceof ShopperError && error.status === 409);
    ok();
    step = "measurement-delete";
    await customerRequest(`${path}/measurements/${measurement.id}`, DeleteShopperMeasurementResponse, "DELETE", { revision: measurement.revision });
    measurement = undefined;
    ok();
    step = "measurement-deletion-confirmed";
    assert.equal((await customerRequest(`${path}/measurements`, GetShopperMeasurementsResponse)).profiles.length, 0);
    ok();
  } else {
    console.log(JSON.stringify({ environment: "test", step: "measurement-read-and-writes", status: "not-enabled-by-merchant-capability" }));
  }
} catch (error) {
  console.log(JSON.stringify({ environment: "test", step, status: "failed",
    code: error instanceof ShopperError ? error.code : "ASSERTION_FAILED" }));
  process.exitCode = 1;
} finally {
  if (measurement) {
    try {
      await customerRequest(`${path}/measurements/${measurement.id}`, DeleteShopperMeasurementResponse, "DELETE", { revision: measurement.revision });
      console.log(JSON.stringify({ environment: "test", step: "measurement-cleanup", status: "passed" }));
    } catch { console.log(JSON.stringify({ environment: "test", step: "measurement-cleanup", status: "needs-review" })); }
  }
}
