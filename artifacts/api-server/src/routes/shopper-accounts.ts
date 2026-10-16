import { Router } from "express";
import { z } from "zod";
import {
  GetShopperProfileResponse, UpdateShopperProfileBody, UpdateShopperProfileResponse,
  LinkShopperProfileBody, GetShopperOrdersResponse, GetShopperOrderResponse,
  GetShopperProductionResponse, GetShopperMeasurementsResponse,
  CreateShopperMeasurementBody, CreateShopperMeasurementResponse,
  UpdateShopperMeasurementBody, UpdateShopperMeasurementResponse,
  DeleteShopperMeasurementBody, DeleteShopperMeasurementResponse,
} from "@workspace/api-zod";
import {
  ShopperError, shopperSubject, verifiedShopper, customerRequest, customerPath, linkVerifiedShopper,
} from "../lib/shopper-accounts";
import { readLinkedShopper } from "../lib/shopperIdentity";

const router = Router();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

router.use("/account", async (req, res, next) => {
  res.set({ "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", Vary: "Cookie" });
  try {
    const identity = await verifiedShopper(req);
    if (!(req.method === "POST" && req.path === "/link")) await readLinkedShopper(identity);
    next();
  } catch (error) { respondError(res, error); }
});

function respondError(res: import("express").Response, error: unknown) {
  if (error instanceof z.ZodError) { res.status(400).json({ error: "Check the submitted profile fields.", code: "INVALID_INPUT" }); return; }
  const known = error instanceof ShopperError;
  res.status(known ? error.status : 503).json({
    error: known ? error.message : "Your account could not be loaded. Please try again later.",
    code: known ? error.code : "CUSTOMER_SERVICE_UNAVAILABLE",
  });
}

function strictMeasurement<T extends { entries: Array<{ field: string; value: string }> }>(value: T): T {
  if (new Set(value.entries.map((entry) => entry.field)).size !== value.entries.length
    || value.entries.some((entry) => Number(entry.value) <= 0 || Number(entry.value) > 500)) {
    throw new ShopperError(400, "INVALID_MEASUREMENTS", "Use unique measurement fields with positive values no greater than 500.");
  }
  return value;
}

router.get("/account/profile", async (req, res) => {
  try { res.json(await customerRequest(customerPath(shopperSubject(req)!), GetShopperProfileResponse)); }
  catch (error) { respondError(res, error); }
});
router.post("/account/link", async (req, res) => {
  try {
    const details = LinkShopperProfileBody.strict().parse(req.body);
    res.json(await linkVerifiedShopper(await verifiedShopper(req), details));
  } catch (error) { respondError(res, error); }
});
router.patch("/account/profile", async (req, res) => {
  try {
    const details = UpdateShopperProfileBody.strict().parse(req.body);
    if (!Object.keys(details).length || (details.name !== undefined && !details.name.trim())) {
      throw new ShopperError(400, "INVALID_INPUT", "Provide at least one profile change and a non-empty name.");
    }
    res.json(await customerRequest(customerPath(shopperSubject(req)!), UpdateShopperProfileResponse, "PATCH", details));
  } catch (error) { respondError(res, error); }
});
router.get("/account/orders", async (req, res) => {
  try {
    const offset = z.coerce.number().int().min(0).max(1_000_000).parse(req.query.offset ?? 0);
    res.json(await customerRequest(`${customerPath(shopperSubject(req)!)}/orders?limit=20&offset=${offset}`, GetShopperOrdersResponse));
  } catch (error) { respondError(res, error); }
});
router.get("/account/orders/:orderId", async (req, res) => {
  try {
    const id = z.string().regex(uuid).parse(req.params.orderId);
    res.json(await customerRequest(`${customerPath(shopperSubject(req)!)}/orders/${id}`, GetShopperOrderResponse));
  } catch (error) { respondError(res, error); }
});
router.get("/account/production", async (req, res) => {
  try { res.json(await customerRequest(`${customerPath(shopperSubject(req)!)}/production`, GetShopperProductionResponse)); }
  catch (error) { respondError(res, error); }
});
router.get("/account/measurements", async (req, res) => {
  try { res.json(await customerRequest(`${customerPath(shopperSubject(req)!)}/measurements`, GetShopperMeasurementsResponse)); }
  catch (error) { respondError(res, error); }
});
router.post("/account/measurements", async (req, res) => {
  try {
    const body = strictMeasurement(CreateShopperMeasurementBody.strict().parse(req.body));
    res.json(await customerRequest(`${customerPath(shopperSubject(req)!)}/measurements`, CreateShopperMeasurementResponse, "POST", body));
  } catch (error) { respondError(res, error); }
});
router.put("/account/measurements/:profileId", async (req, res) => {
  try {
    const id = z.string().regex(uuid).parse(req.params.profileId);
    // Orval emits an intersection for allOf; enforce the complete allowlist here.
    const body = strictMeasurement(UpdateShopperMeasurementBody.parse(req.body));
    if (Object.keys(req.body).some((key) => !["name", "unit", "entries", "revision"].includes(key))) {
      throw new ShopperError(400, "INVALID_INPUT", "Only measurement fields and the current revision may be changed.");
    }
    res.json(await customerRequest(`${customerPath(shopperSubject(req)!)}/measurements/${id}`, UpdateShopperMeasurementResponse, "PUT", body));
  } catch (error) { respondError(res, error); }
});
router.delete("/account/measurements/:profileId", async (req, res) => {
  try {
    const id = z.string().regex(uuid).parse(req.params.profileId);
    const body = DeleteShopperMeasurementBody.strict().parse(req.body);
    res.json(await customerRequest(`${customerPath(shopperSubject(req)!)}/measurements/${id}`, DeleteShopperMeasurementResponse, "DELETE", body));
  } catch (error) { respondError(res, error); }
});
export default router;
