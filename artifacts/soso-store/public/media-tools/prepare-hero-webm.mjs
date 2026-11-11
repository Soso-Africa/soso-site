#!/usr/bin/env node
// Download alongside prepare-hero.mjs. Offline only, never run by the API.
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { run, probe, fingerprint, MAX_VIDEO_BYTES } from "./prepare-hero.mjs";

// VP9 records the implicit limited range of SDR yuv420p as "tv". This
// container metadata difference is not a pixel-range conversion.
const colourIdentity = (colour) => [colour[0] === "unknown" ? "tv" : colour[0], ...colour.slice(1)];

export async function prepareHeroWebm(source, destination) {
  const input = path.resolve(source);
  if (!/\.mp4$/i.test(input)) throw new Error("Select the actual configured MP4 original.");
  const before = await fingerprint(input, probe(input));
  if (before.bytes > MAX_VIDEO_BYTES) throw new Error("Configured original must fit the 24 MiB hero budget.");
  // Decoder errors are different from a browser lacking H.264. Refuse damaged
  // input instead of hiding corruption behind an alternative encoding.
  run("ffmpeg", ["-v", "error", "-xerror", "-i", input, "-f", "null", "-"]);
  const directory = path.resolve(destination);
  await mkdir(directory, { recursive: false });
  const output = path.join(directory, "hero-alternative.webm");
  try {
    const colourArgs = ["color_range", "colorspace", "color_trc", "color_primaries"]
      .flatMap((flag, i) => before.colour[i] === "unknown" ? [] : [`-${flag}`, before.colour[i]]);
    run("ffmpeg", [
      "-v", "error", "-nostdin", "-n", "-noautorotate", "-i", input,
      "-map", "0:v:0", "-map", "0:a?", "-map_metadata", "-1",
      "-c:v", "libvpx-vp9", "-crf", "30", "-b:v", "0", "-pix_fmt", "yuv420p",
      "-fps_mode", "passthrough", ...colourArgs, "-c:a", "libopus", "-b:a", "96k", output,
    ]);
    run("ffmpeg", ["-v", "error", "-xerror", "-i", output, "-f", "null", "-"]);
    const after = await fingerprint(output, probe(output));
    if (after.bytes > MAX_VIDEO_BYTES || before.width !== after.width || before.height !== after.height
      || before.frames !== after.frames || before.frameRate !== after.frameRate
      || Math.abs(before.duration - after.duration) > 0.15 || before.audioStreams !== after.audioStreams
      || JSON.stringify(colourIdentity(before.colour)) !== JSON.stringify(colourIdentity(after.colour))) {
      throw new Error("VP9 alternative exceeds its budget or changed the source composition/timing/colour.");
    }
    const report = { version: 1, tool: "soso-offline-webm", codec: "vp9", before, after };
    await writeFile(path.join(directory, "hero-webm.json"), JSON.stringify(report, null, 2), { flag: "wx" });
    return report;
  } catch (error) {
    await unlink(output).catch(() => {});
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [, , source, destination] = process.argv;
  if (!source || !destination) {
    console.error('Usage: node prepare-hero-webm.mjs "/path/configured.mp4" "/path/NEW-output-folder"');
    process.exitCode = 1;
  } else {
    prepareHeroWebm(source, destination).then(() => {
      console.log("Original and VP9 decode offline. Compare and approve in Staff; nothing uploaded or published.");
    }).catch((error) => { console.error(error.message); process.exitCode = 1; });
  }
}
