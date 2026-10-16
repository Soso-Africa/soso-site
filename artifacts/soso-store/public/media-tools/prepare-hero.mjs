#!/usr/bin/env node
// Offline only: download and run on your own computer with Node.js and FFmpeg.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const MAX_VIDEO_BYTES = 8 * 1024 * 1024;

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} failed. Install Node.js 20+ and FFmpeg locally. ${result.error?.message ?? result.stderr}`);
  }
  return result.stdout;
}

function probe(file) {
  const data = JSON.parse(run("ffprobe", [
    "-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", file,
  ]));
  const videos = data.streams.filter((stream) => stream.codec_type === "video");
  if (videos.length !== 1) throw new Error("Use a source with exactly one video stream.");
  const video = videos[0];
  const duration = Number(video.duration ?? data.format.duration);
  const frames = Number(video.nb_read_frames);
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isSafeInteger(frames) || frames < 1) {
    throw new Error("Source duration/frame count could not be verified.");
  }
  // Refuse implicit tone mapping, gamut/range conversion, rotation or resampling.
  // These sources need an explicitly reviewed SDR export, not a silent conversion.
  if (video.pix_fmt !== "yuv420p"
    || !["unknown", "tv", undefined].includes(video.color_range)
    || !["unknown", "bt709", undefined].includes(video.color_space)
    || !["unknown", "bt709", undefined].includes(video.color_transfer)
    || !["unknown", "bt709", undefined].includes(video.color_primaries)
    || !["1:1", "N/A", undefined].includes(video.sample_aspect_ratio)
    || video.width % 2 || video.height % 2
    || Number(video.tags?.rotate ?? 0) !== 0
    || video.side_data_list?.some((item) => Number(item.rotation ?? 0) !== 0)) {
    throw new Error("Source requires colour/rotation/aspect conversion. Export and approve a square-pixel, unrotated SDR yuv420p source first; this tool will not silently alter it.");
  }
  return {
    width: video.width, height: video.height, duration, frames,
    frameRate: video.avg_frame_rate,
    colour: [video.color_range, video.color_space, video.color_transfer, video.color_primaries].map((value) => value ?? "unknown"),
    audioStreams: data.streams.filter((stream) => stream.codec_type === "audio").length,
  };
}

async function fingerprint(file, metadata) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return { name: path.basename(file), bytes: (await stat(file)).size, sha256: hash.digest("hex"), ...metadata };
}

export async function prepareHero(source, destination, crf = 24) {
  if (!Number.isInteger(crf) || crf < 18 || crf > 28) throw new Error("Quality CRF must be an integer from 18 (higher quality) to 28 (smaller). Default: 24.");
  const input = path.resolve(source);
  if (!(await stat(input)).isFile()) throw new Error("Source must be a local file, not a URL.");
  const before = await fingerprint(input, probe(input));
  // An exclusive new directory guarantees neither source nor prior exports are overwritten.
  const directory = path.resolve(destination);
  await mkdir(directory, { recursive: false });
  const output = path.join(directory, "hero-prepared.mp4");
  try {
    const colourArgs = [];
    for (const [index, flag] of ["-color_range", "-colorspace", "-color_trc", "-color_primaries"].entries()) {
      if (before.colour[index] !== "unknown") colourArgs.push(flag, before.colour[index]);
    }
    run("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-n", "-noautorotate", "-i", input,
      "-map", "0:v:0", "-map", "0:a?", "-map_metadata", "-1",
      "-c:v", "libx264", "-preset", "slow", "-crf", String(crf), "-pix_fmt", "yuv420p",
      "-fps_mode", "passthrough", ...colourArgs,
      "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", output,
    ]);
    const after = await fingerprint(output, probe(output));
    if (before.width !== after.width || before.height !== after.height
      || before.frames !== after.frames || before.frameRate !== after.frameRate
      || Math.abs(before.duration - after.duration) > 0.1
      || before.audioStreams !== after.audioStreams
      || JSON.stringify(before.colour) !== JSON.stringify(after.colour)) {
      throw new Error("Export did not preserve dimensions, duration, frames, audio streams or colour metadata.");
    }
    if (after.bytes >= before.bytes || after.bytes > MAX_VIDEO_BYTES) {
      throw new Error("Export is not smaller or exceeds 8 MiB. Try a higher CRF (up to 28) and review quality; never trim or crop approved footage to fit.");
    }
    const report = {
      version: 1, tool: "soso-offline-hero", crf, before, after,
      savedBytes: before.bytes - after.bytes,
      reviewRequired: true,
    };
    await writeFile(path.join(directory, "hero-preparation.json"), JSON.stringify(report, null, 2), { flag: "wx" });
    console.log(`Original: ${before.bytes} bytes; prepared: ${after.bytes} bytes; saved: ${report.savedBytes} bytes (${(100 * report.savedBytes / before.bytes).toFixed(1)}%).`);
    console.log("Not approved or published. Compare both local files in Staff, approve quality, upload to draft, save and publish normally. Keep your original.");
    return report;
  } catch (error) {
    await unlink(output).catch(() => {});
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [, , source, destination, quality] = process.argv;
  if (!source || !destination) {
    console.error('Usage: node prepare-hero.mjs "/path/to/source.mp4" "/path/to/NEW-output-folder" [CRF 18-28]');
    process.exitCode = 1;
  } else {
    prepareHero(source, destination, quality === undefined ? 24 : Number(quality)).catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
  }
}
