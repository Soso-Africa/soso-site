import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { prepareHero } from "../public/media-tools/prepare-hero.mjs";

test("offline preparation preserves footage, reports savings and cannot overwrite originals or exports", async () => {
  const generated = new URL("../../../generated-artifacts/", import.meta.url);
  await mkdir(generated, { recursive: true });
  const directory = await mkdtemp(path.join(generated.pathname, "hero-preparation-"));
  try {
    const source = path.join(directory, "actual-source.mp4");
    const ffmpeg = spawnSync("ffmpeg", [
      "-v", "error", "-nostdin", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=24",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000",
      "-t", "2", "-c:v", "libx264", "-crf", "0", "-pix_fmt", "yuv420p",
      "-color_range", "tv", "-colorspace", "bt709", "-color_trc", "bt709", "-color_primaries", "bt709",
      "-c:a", "aac", source,
    ], { encoding: "utf8" });
    assert.equal(ffmpeg.status, 0, ffmpeg.stderr);
    const original = await readFile(source);
    const outputDirectory = path.join(directory, "new-export");
    const report = await prepareHero(source, outputDirectory);
    assert.ok(report.after.bytes < report.before.bytes);
    assert.ok(report.after.bytes <= 8 * 1024 * 1024);
    assert.equal(report.before.width, report.after.width);
    assert.equal(report.before.height, report.after.height);
    assert.equal(report.before.frames, report.after.frames);
    assert.equal(report.before.audioStreams, 1);
    assert.equal(report.after.audioStreams, 1);
    assert.deepEqual(report.before.colour, report.after.colour);
    const output = await readFile(path.join(outputDirectory, "hero-prepared.mp4"));
    assert.ok(output.indexOf("moov") < output.indexOf("mdat"), "fast-start metadata precedes footage");
    assert.deepEqual(JSON.parse(await readFile(path.join(outputDirectory, "hero-preparation.json"), "utf8")), report);
    await assert.rejects(prepareHero(source, outputDirectory), /EEXIST/);
    await assert.rejects(prepareHero(source, path.join(directory, "bad-quality"), 35), /CRF/);
    assert.deepEqual(await readFile(source), original);
    assert.deepEqual(await readFile(path.join(outputDirectory, "hero-prepared.mp4")), output);
    const incompatible = path.join(directory, "hdr.mp4");
    const hdr = spawnSync("ffmpeg", ["-v", "error", "-i", source, "-c:v", "libx264", "-color_trc", "smpte2084", "-c:a", "copy", incompatible], { encoding: "utf8" });
    assert.equal(hdr.status, 0, hdr.stderr);
    await assert.rejects(prepareHero(incompatible, path.join(directory, "hdr-output")), /colour\/rotation\/aspect/);
    // Already compact footage must not be offered as a larger "optimization".
    await assert.rejects(prepareHero(path.join(outputDirectory, "hero-prepared.mp4"), path.join(directory, "larger"), 18), /not smaller/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
