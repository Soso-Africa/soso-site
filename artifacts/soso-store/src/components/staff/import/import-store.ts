/** Server is authoritative; IndexedDB is only a best-effort cache of safe metadata. */
import { customFetch, getImportLedger, getImportReview, putImportReview, type ImportUploadReceipt } from "@workspace/api-client-react";
const DB = "soso-catalogue-import";
const VERSION = 1;

export type UploadReceipt = { hash: string; path: string; name: string; size: number; uploadedAt: string };

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB unavailable"));
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("receipts")) db.createObjectStore("receipts");
      if (!db.objectStoreNames.contains("sessions")) db.createObjectStore("sessions");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    // Resolve only once the transaction has committed, not when the request succeeds.
    tx.oncomplete = () => resolve(req.result as T);
    tx.onerror = () => reject(tx.error ?? req.error);
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  }).finally(() => db.close());
}

export const localImportStore = {
  getReceipt: (staffId: string, hash: string) => run<UploadReceipt | undefined>("receipts", "readonly", (s) => s.get(`${staffId}:${hash}`)),
  putReceipt: (staffId: string, r: UploadReceipt) => run<IDBValidKey>("receipts", "readwrite", (s) => s.put(r, `${staffId}:${r.hash}`)),
  getSession: <T>(staffId: string) => run<T | undefined>("sessions", "readonly", (s) => s.get(staffId)),
  putSession: (staffId: string, value: unknown) => run<IDBValidKey>("sessions", "readwrite", (s) => s.put(value, staffId)),
  clearSession: (staffId: string) => run<undefined>("sessions", "readwrite", (s) => s.delete(staffId)),
};

// Per mounted authenticated importer, not a process-global cache that could leak
// receipts or overwrite a newer device's review after an identity change.
export function createImportStore() {
  let owner: string | null = null;
  let version = 0;
  let queue: Promise<unknown> = Promise.resolve();
  const checkOwner = (id: string) => {
    if (owner !== id) throw new Error("Reopen the importer to authenticate recovery.");
  };
  return {
    async restore<T>(id: string): Promise<T | undefined> {
      const saved = await getImportReview();
      owner = id; version = saved.version;
      // Never silently promote legacy local receipts: their ownership and
      // verification were not recorded by this server ledger.
      return saved.review as T | undefined ?? undefined;
    },
    async listReceipts(id: string): Promise<ImportUploadReceipt[]> {
      checkOwner(id);
      return getImportLedger();
    },
    async putSession(id: string, value: unknown) {
      checkOwner(id);
      const snapshot = structuredClone(value);
      const work = queue.then(async () => {
        checkOwner(id);
        const saved = await putImportReview({ version, review: snapshot as Record<string, unknown> | null });
        version = saved.version;
        await localImportStore.putSession(id, saved.review).catch(() => undefined);
      });
      queue = work.catch(() => undefined);
      return work;
    },
    async cleanup(id: string, receiptId: string) {
      checkOwner(id);
      return customFetch(`/api/storage/import-ledger/${encodeURIComponent(receiptId)}/cleanup`, { method: "POST", responseType: "json" });
    },
  };
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
