import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { MAX_PREPARED_HERO_BYTES, previewMatchesEvidence, validatePreparationReport, verifyPreparedHero } from "./heroPreparation";

export function preparationFixture() {
  const sourceBytes = new Uint8Array(200).fill(1);
  const candidateBytes = new Uint8Array(64);
  candidateBytes.set(new TextEncoder().encode("ftypisom"), 4);
  const source = new File([sourceBytes], "original.mp4", { type: "video/mp4" });
  const candidate = new File([candidateBytes], "hero-prepared.mp4", { type: "video/mp4" });
  const evidence = { width: 320, height: 180, duration: 2, frames: 48, frameRate: "24/1", colour: ["tv", "bt709", "bt709", "bt709"], audioStreams: 0 };
  const report = {
    version: 1 as const, tool: "soso-offline-hero" as const, crf: 24,
    before: { ...evidence, bytes: source.size, sha256: createHash("sha256").update(sourceBytes).digest("hex") },
    after: { ...evidence, bytes: candidate.size, sha256: createHash("sha256").update(candidateBytes).digest("hex") },
  };
  const reportFile = new File([JSON.stringify(report)], "hero-preparation.json", { type: "application/json" });
  return { source, candidate, report, reportFile };
}

test("preparation verifies exact source/export hashes, bytes, MIME and extension", async () => {
  const { source, candidate, report, reportFile } = preparationFixture();
  assert.deepEqual(await verifyPreparedHero(source, candidate, reportFile), report);
  await assert.rejects(verifyPreparedHero(new File([new Uint8Array(200)], "other.mp4"), candidate, reportFile), /do not match the preparation report/);
  await assert.rejects(verifyPreparedHero(source, new File([await candidate.arrayBuffer()], "wrong.webm", { type: "video/mp4" }), reportFile), /MP4/);
  await assert.rejects(verifyPreparedHero(source, new File([await candidate.arrayBuffer()], "wrong.mp4", { type: "image/png" }), reportFile), /MIME/);
  await assert.rejects(verifyPreparedHero(source, new File([new Uint8Array(64)], "fake.mp4", { type: "video/mp4" }), reportFile), /container/);
  await assert.rejects(verifyPreparedHero(source, candidate, new File(["null"], "bad.json")), /offline preparation/);
});

test("report rejects changed footage metadata, larger files and over-budget exports", () => {
  const { report } = preparationFixture();
  for (const changes of [
    { width: 640 }, { height: 360 }, { frames: 47 }, { frameRate: "25/1" },
    { duration: 1.5 }, { colour: ["tv", "bt2020", "smpte2084", "bt2020"] },
    { audioStreams: 1 }, { bytes: report.before.bytes }, { bytes: MAX_PREPARED_HERO_BYTES + 1 },
  ]) {
    assert.throws(() => validatePreparationReport({ ...report, after: { ...report.after, ...changes } }));
  }
  assert.equal(previewMatchesEvidence({ videoWidth: 320, videoHeight: 180, duration: 2 }, report.after), true);
  assert.equal(previewMatchesEvidence({ videoWidth: 180, videoHeight: 320, duration: 2 }, report.after), false);
  assert.equal(previewMatchesEvidence({ videoWidth: 320, videoHeight: 180, duration: Infinity }, report.after), false);
});
