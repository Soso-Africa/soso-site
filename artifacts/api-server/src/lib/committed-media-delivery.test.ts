import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { S3Client } from "@aws-sdk/client-s3";
import { MediaNotFoundError } from "./cloudinary-storage";
import { resolveCommittedMediaDelivery, type CommittedMediaApproval } from "./committed-media-delivery";
import { prepareMediaForPublication } from "./media-publication";
import { R2StorageService } from "./r2-storage";

function fixture() {
  const publicKeys = new Set<string>();
  const storage = new R2StorageService({
    accountId: "0".repeat(32), accessKeyId: "1".repeat(32), secretAccessKey: "2".repeat(64),
    privateBucket: "soso-media-private", publicBucket: "soso-media-public", namespace: "isolated-test",
  }, { send: async () => { throw new Error("Unexpected S3 request"); } } as unknown as S3Client);
  let origin = "";
  let copies = 0;
  storage.inspectUploadedMedia = async () => ({
    contentType: "image/webp", declaredContentType: "image/webp", size: 100, animated: false,
  });
  storage.stageApprovedOriginal = async (path) => { copies++; publicKeys.add(path); };
  storage.stageApprovedRenditions = async (path) => {
    copies++;
    publicKeys.add(`${path}?w=480`);
  };
  storage.resolveDelivery = async (path, _area, options) => {
    const key = path + (options.width ? `?w=${options.width}` : "");
    if (publicKeys.has(key)) return { url: `${origin}/${key}`, cacheControl: "public" };
    if (options.allowPrivate) return { url: "https://private.example/short-lived", cacheControl: "private, no-store" };
    throw new MediaNotFoundError();
  };
  return { storage, publicKeys, copies: () => copies, origin: (value: string) => { origin = value; } };
}

test("failed publication leaves both the direct origin and anonymous managed path private", async () => {
  for (const failure of ["later revision write", "transaction commit"]) {
    const f = fixture();
    const reference = { path: "uploads/draft.webp", area: "uploads" as const };
    const denied: CommittedMediaApproval = async () => false;
    const server = createServer(async (req, res) => {
      if (req.url?.startsWith("/api/storage/objects/")) {
        try {
          const delivery = await resolveCommittedMediaDelivery(f.storage, reference, { allowPrivate: false }, denied);
          res.writeHead(302, { Location: delivery.url }).end();
        } catch (error) {
          res.writeHead(error instanceof MediaNotFoundError ? 404 : 500).end();
        }
      } else res.writeHead(f.publicKeys.has(req.url!.slice(1)) ? 200 : 404).end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    f.origin(origin);
    try {
      await assert.rejects((async () => {
        await prepareMediaForPublication({ src: `/api/storage/objects/${reference.path}` }, undefined, f.storage);
        throw new Error(failure);
      })(), new RegExp(failure));
      assert.equal(f.copies(), 0);
      assert.equal((await fetch(`${origin}/${reference.path}`)).status, 404);
      assert.equal((await fetch(`${origin}/api/storage/objects/${reference.path}`, { redirect: "manual" })).status, 404);
      assert.equal(f.publicKeys.size, 0);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  }
});

test("draft Staff previews never authorize public copies", async () => {
  const f = fixture();
  const delivery = await resolveCommittedMediaDelivery(f.storage, { path: "uploads/draft.webp", area: "uploads" },
    { allowPrivate: true }, async () => false);
  assert.equal(delivery.cacheControl, "private, no-store");
  assert.equal(f.copies(), 0);
  assert.equal(f.publicKeys.size, 0);
});

test("committed publications are copied lazily; partial delivery failures can retry without another publication", async () => {
  const f = fixture();
  const reference = { path: "uploads/approved.png", area: "uploads" as const };
  let committed = false;
  const approve: CommittedMediaApproval = async (_reference, promote) => {
    if (!committed) return false;
    await promote();
    return true;
  };
  await assert.rejects(resolveCommittedMediaDelivery(f.storage, reference, { allowPrivate: false }, approve), MediaNotFoundError);
  assert.equal(f.publicKeys.size, 0);
  committed = true;
  const copy = f.storage.stageApprovedOriginal;
  f.storage.stageApprovedOriginal = async () => { throw new Error("temporary copy failure"); };
  await assert.rejects(resolveCommittedMediaDelivery(f.storage, reference, { allowPrivate: false }, approve), /copy failure/);
  assert.equal(committed, true, "Delivery failure must not imply the approved publication rolled back");
  f.storage.stageApprovedOriginal = copy;
  const delivered = await resolveCommittedMediaDelivery(f.storage, reference, { allowPrivate: false }, approve);
  assert.ok(delivered.url.endsWith(reference.path));
  assert.ok(f.publicKeys.has(reference.path));
  assert.equal((await resolveCommittedMediaDelivery(f.storage, reference, { width: 480, allowPrivate: false }, approve)).cacheControl, "public");
});

test("already approved media does not query the database or copy bytes again", async () => {
  const f = fixture();
  f.publicKeys.add("uploads/already.webp");
  await resolveCommittedMediaDelivery(f.storage, { path: "uploads/already.webp", area: "uploads" },
    { allowPrivate: false }, async () => { throw new Error("Unexpected approval query"); });
  assert.equal(f.copies(), 0);
});
