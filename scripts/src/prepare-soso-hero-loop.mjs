import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const run = promisify(execFile);
const input = process.argv[2];
if (!input) throw new Error("Supply the original SOSO 4K video.");
const directory = path.resolve("generated-artifacts/soso-hero-loop");
await mkdir(directory, { recursive: true });
const probe = async (file) => JSON.parse((await run("ffprobe", [
  "-v", "error", "-show_streams", "-show_format", "-of", "json", file,
])).stdout);
const hash = async (file) => {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest("hex");
};
const source = await probe(input);
const video = source.streams.find((stream) => stream.codec_type === "video");
if (video?.width !== 3840 || video?.height !== 2160) throw new Error("Unexpected source composition.");
const sourceFrames = 811;
const blendFrames = 18;
const transition = blendFrames / 30;
const offset = (sourceFrames - 2 * blendFrames) / 30;
const targets = [
  { name: "desktop", width: 1920, height: 1080, filter: "scale=1920:1080:flags=lanczos", crf: "22", rate: "2200k", buffer: "4400k" },
  { name: "mobile", width: 720, height: 540, filter: "crop=2880:2160:480:0,scale=720:540:flags=lanczos", crf: "23", rate: "950k", buffer: "1900k" },
];
const reuseDesktop = process.argv.includes("--reuse-desktop");
if (reuseDesktop) {
  const previous = JSON.parse(await readFile(path.join(directory, "preparation-report.json"), "utf8"));
  const desktop = previous.exports.find((item) => item.target === "desktop");
  if (previous.source.sha256 !== await hash(input)
    || desktop?.sha256 !== await hash(path.join(directory, "soso-hero-desktop-loop.mp4"))) {
    throw new Error("Desktop reuse requires matching source and previously verified export hashes.");
  }
}
const filters = [reuseDesktop
  ? "[0:v]fps=30,trim=end_frame=811[ms]"
  : "[0:v]fps=30,trim=end_frame=811,split=2[ds][ms]"];
const encode = [];
for (const target of targets) {
  target.file = path.join(directory, `soso-hero-${target.name}-loop.mp4`);
  if (reuseDesktop && target.name === "desktop") continue;
  const prefix = target.name;
  const sourceLabel = prefix === "desktop" ? "ds" : "ms";
  filters.push(
    `[${sourceLabel}]${target.filter},setsar=1,format=yuv420p,split=2[${prefix}a][${prefix}b]`,
    `[${prefix}a]trim=start_frame=${blendFrames},setpts=PTS-STARTPTS[${prefix}main]`,
    `[${prefix}b]trim=end_frame=${blendFrames},setpts=PTS-STARTPTS[${prefix}head]`,
    `[${prefix}main][${prefix}head]xfade=transition=fade:duration=${transition}:offset=${offset},format=yuv420p[${prefix}]`,
  );
  encode.push(
    "-map", `[${prefix}]`, "-an", "-c:v", "libx264", "-preset", "slow", "-threads", "2",
    "-crf", target.crf, "-maxrate", target.rate, "-bufsize", target.buffer,
    "-pix_fmt", "yuv420p", "-profile:v", "high", "-level:v", "4.1",
    "-g", "60", "-keyint_min", "30", "-color_primaries", "bt709",
    "-color_trc", "bt709", "-colorspace", "bt709", "-map_metadata", "-1",
    "-map_chapters", "-1", "-movflags", "+faststart", target.file,
  );
}
console.log("Preparing both cyclic crossfades from the original master, not recompressing the previous exports.");
await run("ffmpeg", [
  "-hide_banner", "-loglevel", "warning", "-y", "-threads", "2", "-i", input,
  "-filter_complex_threads", "2", "-filter_complex", filters.join(";"), ...encode,
], { maxBuffer: 8 * 1024 * 1024 });
const exports = [];
for (const target of targets) {
  const metadata = await probe(target.file);
  const stream = metadata.streams.find((item) => item.codec_type === "video");
  const size = (await stat(target.file)).size;
  const bytes = await readFile(target.file);
  const atoms = [];
  for (let offset = 0; offset + 8 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    if (length < 8 || offset + length > bytes.length) throw new Error("Invalid MP4 atom");
    atoms.push({ type: bytes.toString("ascii", offset + 4, offset + 8), offset });
    offset += length;
  }
  const fastStart = atoms.find((atom) => atom.type === "moov")?.offset < atoms.find((atom) => atom.type === "mdat")?.offset;
  if (size >= 8 * 1024 * 1024 || !fastStart || metadata.streams.length !== 1
    || stream.width !== target.width || stream.height !== target.height
    || Number(stream.nb_frames) !== sourceFrames - blendFrames) throw new Error("Loop export failed bounds or frame count.");
  await run("ffmpeg", ["-hide_banner", "-v", "error", "-xerror", "-threads", "2", "-i", target.file, "-f", "null", "-"]);
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-threads", "2", "-i", target.file,
    "-frames:v", "1", "-c:v", "libwebp", "-quality", "85", "-update", "1",
    path.join(directory, `soso-hero-${target.name}-poster.webp`),
  ]);
  exports.push({
    target: target.name, file: path.basename(target.file), bytes: size,
    sha256: await hash(target.file), width: stream.width, height: stream.height,
    duration: Number(metadata.format.duration), frames: Number(stream.nb_frames),
    codec: stream.codec_name, pixelFormat: stream.pix_fmt, frameRate: stream.r_frame_rate,
    fastStart, audio: false, reductionPercent: (1 - size / Number(source.format.size)) * 100,
  });
}
const report = {
  source: { file: path.basename(input), sha256: await hash(input), bytes: Number(source.format.size) },
  loop: {
    technique: "Cyclic 18-frame dissolve: start at source frame 18; end by blending source tail into frames 0–17.",
    blendSeconds: transition, fadeOffsetSeconds: offset, expectedFrames: sourceFrames - blendFrames,
    warning: "A real crossfade briefly overlaps two outfits; it conceals the cut but is not continuous same-outfit footage.",
  },
  mobileComposition: "Both comparison figures preserved in a native 4:3 composition without padding, garment stretching, or a single-model crop. Website adoption must fit this composition rather than using a tall cover crop.",
  exports,
  status: "Prepared offline. Not uploaded, staged in Staff, or published.",
};
await writeFile(path.join(directory, "preparation-report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
