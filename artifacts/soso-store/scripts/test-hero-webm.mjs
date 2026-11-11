import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { prepareHeroWebm } from "../public/media-tools/prepare-hero-webm.mjs";

test("offline VP9 preserves the actual configured footage, checks full decode and refuses corrupt originals", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "hero-webm-"));
  try {
    const source = path.join(directory, "configured.mp4");
    const generated = spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=30:duration=1",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", source], { encoding: "utf8" });
    assert.equal(generated.status, 0, generated.stderr);
    const before = await readFile(source);
    const report = await prepareHeroWebm(source, path.join(directory, "export"));
    assert.equal(report.before.frames, report.after.frames);
    assert.equal(report.before.width, report.after.width);
    assert.equal(report.before.height, report.after.height);
    assert.equal(report.codec, "vp9");
    assert.deepEqual(await readFile(source), before);
    const webm = path.join(directory, "export/hero-alternative.webm");
    const probed = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name", "-of", "json", webm], { encoding: "utf8" });
    assert.equal(JSON.parse(probed.stdout).streams[0].codec_name, "vp9");
    await assert.rejects(prepareHeroWebm(source, path.join(directory, "export")), /EEXIST/);
    const damaged = path.join(directory, "damaged.mp4");
    await writeFile(damaged, before.subarray(0, Math.floor(before.length / 2)));
    await assert.rejects(prepareHeroWebm(damaged, path.join(directory, "bad-export")));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
