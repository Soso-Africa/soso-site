import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import {
  GetVerifiedShopperOrderResponse as GetShopperOrderResponse,
  GetVerifiedShopperOrdersResponse as GetShopperOrdersResponse,
  GetVerifiedShopperProfileResponse as GetShopperProfileResponse,
  LinkVerifiedShopperProfileBody as LinkShopperProfileBody,
  UpdateVerifiedShopperProfileBody as UpdateShopperProfileBody,
} from "@workspace/api-zod";
import { JusticeSureCustomersClient, ShopperError, type RemoteCustomer } from "../lib/justicesureCustomers";
import { assertCustomerIdentity, linkShopper, readLinkedShopper, shopperBinding, verifiedShopper } from "../lib/shopperIdentity";

const router: IRouter = Router();
router.use("/shopper", (_req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  res.set("Vary", "Cookie");
  next();
});
const profile = (customer: RemoteCustomer) => GetShopperProfileResponse.parse({
  name: customer.name, email: customer.verifiedEmail, phone: customer.phone, address: customer.address, linked: true,
});
async function handle(req: Request, res: Response, work: () => Promise<unknown>): Promise<void> {
  try { res.json(await work()); }
  catch (error) {
    if (error instanceof ShopperError) {
      res.status(error.status).json({ error: error.message, code: error.code });
    } else {
      req.log.error({ code: "SHOPPER_REQUEST_FAILED" }, "Shopper request failed");
      res.status(503).json({ error: "Your account request could not be completed. Please retry.", code: "SHOPPER_REQUEST_FAILED" });
    }
  }
}

router.post("/shopper/link", async (req, res): Promise<void> => {
  await handle(req, res, async () => {
    const parsed = LinkShopperProfileBody.strict().safeParse(req.body);
    if (!parsed.success) throw new ShopperError(400, "INVALID_REQUEST", "Provide only your profile name.");
    return profile(await linkShopper(await verifiedShopper(req), parsed.data.name));
  });
});
router.get("/shopper/profile", async (req, res): Promise<void> => {
  await handle(req, res, async () => profile(await readLinkedShopper(await verifiedShopper(req))));
});
router.patch("/shopper/profile", async (req, res): Promise<void> => {
  await handle(req, res, async () => {
    const parsed = UpdateShopperProfileBody.strict().safeParse(req.body);
    if (!parsed.success || !parsed.data.name.trim()) throw new ShopperError(400, "INVALID_REQUEST", "Check your name, phone and saved address.");
    const identity = await verifiedShopper(req);
    const client = new JusticeSureCustomersClient();
    await readLinkedShopper(identity, client);
    const customer = await client.update(identity.externalId, {
      name: parsed.data.name.trim(), phone: parsed.data.phone?.trim() || null, address: parsed.data.address?.trim() || null,
    });
    assertCustomerIdentity(customer, identity, await shopperBinding(identity, client));
    return profile(customer);
  });
});

const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const remoteOrder = z.object({
  id: z.string().uuid(), number: z.string().nullable(), status: z.string(),
  createdAt: z.string().nullable(), currency: z.literal("NGN"),
  amounts: z.object({ totalKobo: money, paidKobo: money }),
  payment: z.object({ status: z.string().nullable() }),
  source: z.string().nullable().optional(),
});
function summary(value: unknown) {
  const order = remoteOrder.parse(value);
  return {
    id: order.id, number: order.number, status: order.status, createdAt: order.createdAt, currency: order.currency,
    totalMinor: String(order.amounts.totalKobo), paidMinor: String(order.amounts.paidKobo),
    paymentStatus: order.payment.status, source: order.source ?? null,
  };
}
router.get("/shopper/orders", async (req, res): Promise<void> => {
  await handle(req, res, async () => {
    const offset = z.coerce.number().int().min(0).max(100000).safeParse(req.query.offset ?? 0);
    if (!offset.success || Object.keys(req.query).some((key) => key !== "offset")) throw new ShopperError(400, "INVALID_REQUEST", "Invalid order page.");
    const identity = await verifiedShopper(req);
    const client = new JusticeSureCustomersClient();
    await readLinkedShopper(identity, client);
    const result = z.object({
      orders: z.array(z.unknown()).max(50), hasMore: z.boolean(), nextOffset: z.number().int().min(0).max(100000).nullable(),
    }).parse(await client.request(`/${encodeURIComponent(identity.externalId)}/orders?limit=20&offset=${offset.data}`));
    return GetShopperOrdersResponse.parse({ ...result, orders: result.orders.map(summary) });
  });
});
router.get("/shopper/orders/:id", async (req, res): Promise<void> => {
  await handle(req, res, async () => {
    const orderId = z.string().uuid().safeParse(req.params.id);
    if (!orderId.success) throw new ShopperError(400, "INVALID_REQUEST", "Invalid order.");
    const identity = await verifiedShopper(req);
    const client = new JusticeSureCustomersClient();
    await readLinkedShopper(identity, client);
    const result = z.object({ order: remoteOrder.extend({
      items: z.array(z.object({ name: z.string(), quantity: z.number().nonnegative(), totalKobo: money })),
      fulfillment: z.object({ status: z.string().nullable() }),
      delivery: z.object({ status: z.string().nullable(), trackingReference: z.string().nullable() }),
    }) }).parse(await client.request(`/${encodeURIComponent(identity.externalId)}/orders/${orderId.data}`));
    if (result.order.id !== orderId.data) throw new ShopperError(502, "INVALID_ORDER_RESPONSE", "Customer service returned a different order.");
    return GetShopperOrderResponse.parse({
      order: summary(result.order),
      items: result.order.items.map((item) => ({ name: item.name, quantity: item.quantity, totalMinor: String(item.totalKobo) })),
      fulfillmentStatus: result.order.fulfillment.status,
      deliveryStatus: result.order.delivery.status,
      trackingReference: result.order.delivery.trackingReference,
    });
  });
});
export default router;
