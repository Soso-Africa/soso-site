import assert from "node:assert/strict";
import test from "node:test";
import { importStore } from "./import-store";

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
