/**
 * Browser-only fixture: real SOSO auth/router/database behavior, synthetic email
 * delivery and JusticeSure responses. Must be run through the isolated-schema runner.
 * Never registered with the API app or included in its production entry point.
 */
import express from "express";
import cookieParser from "cookie-parser";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { createShopperAuthRouter } from "../src/routes/shopper-auth";
import shopperRouter from "../src/routes/shopper";
import { loadShopperSession } from "../src/lib/shopper-auth-session";
import { requireShopperOrigin } from "../src/middlewares/shopperOrigin";
import { JusticeSureCustomersClient, ShopperError, type RemoteCustomer } from "../src/lib/justicesureCustomers";

const schema = (await pool.query("SELECT current_schema() AS schema")).rows[0].schema;
if (!/^soso_api_test_[a-f0-9]+$/.test(schema)) throw new Error("The shopper browser fixture requires an isolated test schema");
const emails: Array<{ email: string; url: string; purpose: string }> = [];
const customers = new Map<string, RemoteCustomer>();
JusticeSureCustomersClient.prototype.link = async (input) => {
  let customer = customers.get(input.externalId);
  if (!customer) {
    customer = {
      id: randomUUID(), externalId: input.externalId, name: input.name, email: input.email,
      verifiedEmail: input.email, phone: null, address: null,
    };
    customers.set(input.externalId, customer);
  }
  return customer;
};
JusticeSureCustomersClient.prototype.profile = async (externalId) => {
  const customer = customers.get(externalId);
  if (!customer) throw new ShopperError(404, "CUSTOMER_NOT_FOUND", "Synthetic customer not linked");
  return customer;
};
JusticeSureCustomersClient.prototype.request = async (path) => {
  if (path.includes("/orders?")) return { orders: [], hasMore: false, nextOffset: null };
  throw new ShopperError(503, "SYNTHETIC_ONLY", "This browser fixture does not call external services.");
};

const app = express();
app.use(express.json(), cookieParser());
app.use((req, _res, next) => {
  // Only event codes are logged. Never log fixture email links or credentials.
  req.log = { error() {}, warn() {} } as never;
  next();
});
app.use("/api", createShopperAuthRouter({
  async ready() { return { publicOrigin: "https://shopper.example.test" }; },
  async send(input) { emails.push({ email: input.email, url: input.url, purpose: input.purpose }); },
}));
app.use("/api/shopper", loadShopperSession, requireShopperOrigin);
app.use("/api", shopperRouter);
app.get("/__test/mail", (_req, res) => { res.set("Cache-Control", "no-store").json(emails); });
const server = app.listen(6607, "127.0.0.1", () => console.log("Owned shopper isolated browser fixture ready on 127.0.0.1:6607"));
async function close() {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
}
for (const signal of ["SIGTERM", "SIGINT"] as const) process.once(signal, () => { void close().then(() => process.exit(0)); });
