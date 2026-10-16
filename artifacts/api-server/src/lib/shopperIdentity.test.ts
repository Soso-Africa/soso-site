import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { eq } from "drizzle-orm";
import { db, shopperCustomersTable } from "@workspace/db";
import { JusticeSureCustomersClient, ShopperError, type RemoteCustomer } from "./justicesureCustomers";
import { assertCustomerIdentity, linkShopper, readLinkedShopper, shopperExternalId, type VerifiedShopper } from "./shopperIdentity";

function identity(): VerifiedShopper {
  const subject = `user_${randomUUID()}`;
  const issuer = "https://synthetic.clerk.example";
  return { issuer, subject, externalId: shopperExternalId(issuer, subject), email: "synthetic@example.com", name: "Synthetic Shopper" };
}
function clientFor(who: VerifiedShopper) {
  const client = new JusticeSureCustomersClient({ baseUrl: "https://merchant.example/api/v1/commerce", apiKey: "jsk_test_synthetic", runtimeReady: false });
  let links = 0;
  const remote: RemoteCustomer = {
    id: randomUUID(), externalId: who.externalId, name: who.name!, email: who.email, verifiedEmail: who.email, phone: null, address: null,
  };
  client.link = async () => { links++; return remote; };
  client.profile = async () => remote;
  return { client, remote, links: () => links };
}
test("external identity includes the authentication issuer, not the shopper's email", () => {
  assert.notEqual(shopperExternalId("https://a.example", "user_1"), shopperExternalId("https://b.example", "user_1"));
  assert.equal(shopperExternalId("https://a.example", "user_1"), shopperExternalId("https://a.example", "user_1"));
  assert.match(shopperExternalId("https://a.example", "user_1"), /^soso:[a-f0-9]{64}$/);
});
test("customer mismatch is rejected even with a matching email", () => {
  const who = identity();
  const { remote } = clientFor(who);
  assert.throws(() => assertCustomerIdentity({ ...remote, externalId: "other" }, who), ShopperError);
  assert.throws(() => assertCustomerIdentity({ ...remote, verifiedEmail: "other@example.com" }, who), ShopperError);
});
test("persistent link replays safely; changed tenant or verified email cannot replace it", async () => {
  const who = identity();
  const { client, remote, links } = clientFor(who);
  try {
    assert.equal((await linkShopper(who, undefined, client)).id, remote.id);
    assert.equal((await linkShopper(who, "Do not overwrite", client)).id, remote.id);
    assert.equal(links(), 1);
    await assert.rejects(readLinkedShopper({ ...who, email: "changed@example.com" }, client), (e: unknown) => e instanceof ShopperError && e.code === "CUSTOMER_IDENTITY_CONFLICT");
    client.profile = async () => ({ ...remote, id: randomUUID() });
    await assert.rejects(readLinkedShopper(who, client), (e: unknown) => e instanceof ShopperError && e.code === "CUSTOMER_IDENTITY_CONFLICT");
    assert.equal(links(), 1);
    const other = new JusticeSureCustomersClient({ baseUrl: client.origin, apiKey: "jsk_live_synthetic", runtimeReady: false });
    await assert.rejects(readLinkedShopper(who, other), (e: unknown) => e instanceof ShopperError && e.code === "CUSTOMER_NOT_FOUND");
  } finally { await db.delete(shopperCustomersTable).where(eq(shopperCustomersTable.authSubject, who.subject)); }
});
test("concurrent signup resolves to exactly one local and remote identity", async () => {
  const who = identity();
  const { client, remote } = clientFor(who);
  try {
    const linked = await Promise.all([linkShopper(who, undefined, client), linkShopper(who, undefined, client)]);
    assert.ok(linked.every((result) => result.id === remote.id));
    const rows = await db.select().from(shopperCustomersTable).where(eq(shopperCustomersTable.authSubject, who.subject));
    assert.equal(rows.length, 1);
  } finally { await db.delete(shopperCustomersTable).where(eq(shopperCustomersTable.authSubject, who.subject)); }
});
