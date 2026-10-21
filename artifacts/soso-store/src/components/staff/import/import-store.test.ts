import assert from "node:assert/strict";
import test from "node:test";
import { localImportStore as importStore, createImportStore } from "./import-store";

test("session persistence resolves only after transaction commit, so immediate restore sees saved metadata", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
  const values = new Map<string, unknown>();
  let requestSucceeded = false;
  let committed = false;
  let notifyRequestSuccess!: () => void;
  const requestSuccess = new Promise<void>((resolve) => { notifyRequestSuccess = resolve; });
  const factory = {
    open() {
      const request: Record<string, any> = {};
      setTimeout(() => {
        request.result = {
          close() {},
          transaction() {
            const tx: Record<string, any> = {};
            tx.objectStore = () => ({
              put(value: unknown, key: string) {
                const result: Record<string, any> = { result: key };
                setTimeout(() => { requestSucceeded = true; result.onsuccess?.(); notifyRequestSuccess(); }, 0);
                setTimeout(() => { values.set(key, structuredClone(value)); committed = true; tx.oncomplete?.(); }, 15);
                return result;
              },
              get(key: string) {
                const result = { result: values.get(key) };
                setTimeout(() => tx.oncomplete?.(), 0);
                return result;
              },
            });
            return tx;
          },
        };
        request.onsuccess?.();
      }, 0);
      return request;
    },
  };
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: factory });
  try {
    const session = { groups: { 2: { savedAt: "2026-10-20T12:00:00Z", photos: [{ path: "/api/storage/objects/uploads/example.jpg" }] } }, selected: [] };
    let resolved = false;
    const writing = importStore.putSession("staff-test", session).then(() => { resolved = true; });
    await requestSuccess;
    assert.equal(requestSucceeded, true);
    assert.equal(resolved, false);
    await writing;
    assert.equal(committed, true);
    assert.deepEqual(await importStore.getSession("staff-test"), session);
    assert.equal(await importStore.getSession("different-staff"), undefined);
  } finally {
    if (previous) Object.defineProperty(globalThis, "indexedDB", previous);
    else Reflect.deleteProperty(globalThis, "indexedDB");
  }
});

test("server reviews restore without IndexedDB, serialize saves and reject stale devices and identities", async () => {
  const original = globalThis.fetch;
  let version = 0;
  let review: unknown = null;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/import-review") && init?.method === "PUT") {
      const body = JSON.parse(String(init.body));
      if (body.version !== version) return Response.json({ error: "Changed on another device" }, { status: 409 });
      version++; review = body.review;
      return Response.json({ version, review });
    }
    if (url.endsWith("/import-review")) return Response.json({ version, review });
    if (url.endsWith("/import-ledger")) return Response.json([{ id: "receipt", path: "/api/storage/objects/uploads/exact.jpg", status: "complete", hash: "a".repeat(64) }]);
    throw new Error(`Unexpected request: ${url}`);
  };
  try {
    const first = createImportStore();
    await assert.rejects(first.listReceipts("owner"), /authenticate/);
    assert.equal(await first.restore("owner"), undefined);
    const otherDevice = createImportStore();
    await otherDevice.restore("owner");
    await Promise.all([
      first.putSession("owner", { selected: [2] }),
      first.putSession("owner", { selected: [2, 3] }),
    ]);
    assert.equal(version, 2);
    assert.deepEqual(review, { selected: [2, 3] });
    await assert.rejects(otherDevice.putSession("owner", { selected: [] }));
    assert.deepEqual(review, { selected: [2, 3] });
    const freshDevice = createImportStore();
    assert.deepEqual(await freshDevice.restore("owner"), { selected: [2, 3] });
    assert.equal((await freshDevice.listReceipts("owner"))[0]?.path, "/api/storage/objects/uploads/exact.jpg");
    await assert.rejects(freshDevice.listReceipts("different-owner"), /authenticate/);
    await first.putSession("owner", null);
    assert.equal(review, null);
  } finally { globalThis.fetch = original; }
});
