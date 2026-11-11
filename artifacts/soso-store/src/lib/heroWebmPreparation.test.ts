import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { verifyHeroWebm } from "./heroWebmPreparation";

test("local WebM approval verifies report identity, unchanged framing, duration and hashes", async () => {
  const source = new File(["synthetic mp4"], "original.mp4", { type: "video/mp4" });
  const webm = new File(["synthetic webm"], "hero-alternative.webm", { type: "video/webm" });
  const evidence = async (file: File) => ({
    bytes: file.size, sha256: createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex"),
    width: 320, height: 240, frames: 30, frameRate: "30/1", duration: 1,
    colour: ["unknown", "unknown", "unknown", "unknown"], audioStreams: 0,
  });
  const report = { version: 1, tool: "soso-offline-webm", codec: "vp9", before: await evidence(source), after: await evidence(webm) };
  const json = (value: unknown) => new File([JSON.stringify(value)], "hero-webm.json");
  assert.equal((await verifyHeroWebm(source, webm, json(report))).codec, "vp9");
  await assert.rejects(verifyHeroWebm(source, webm, json({ ...report, after: { ...report.after, frames: 20 } })), /unchanged/);
  await assert.rejects(verifyHeroWebm(source, webm, json({ ...report, after: { ...report.after, sha256: "a".repeat(64) } })), /changed/);
  await assert.rejects(verifyHeroWebm(source, webm, json({ ...report, codec: "vp8" })), /unchanged/);
  await assert.rejects(verifyHeroWebm(source, new File(["x"], "other.webm", { type: "video/mp4" }), json(report)), /configured MP4/);
  await assert.rejects(verifyHeroWebm(source, webm, json({ ...report, after: { ...report.after, duration: 2 } })), /unchanged/);
});
