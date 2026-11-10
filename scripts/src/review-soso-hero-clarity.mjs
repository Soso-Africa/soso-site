import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const run = promisify(execFile);
const directory = path.resolve("generated-artifacts/hero-clarity");
const prepared = path.resolve("generated-artifacts/soso-hero-clarity");
const report = JSON.parse(await readFile(path.join(prepared, "preparation-report.json"), "utf8"));
const font = (await run("fc-match", ["-f", "%{file}", "DejaVu Sans"])).stdout.trim();
if (!font) throw new Error("A real font is required for labelled review images.");
const label = (text) => `drawtext=fontfile='${font}':text='${text}':fontsize=23:fontcolor=white:x=18:y=12`;

for (const target of report.exports) {
  const mobile = target.target === "mobile";
  const before = path.join(directory, `live-${target.target}.mp4`);
  const after = path.join(prepared, target.file);
  const width = mobile ? 1440 : 1920, height = 1080;
  const column = mobile ? 720 : 960;
  const fullHeight = mobile ? 540 : 540;
  const crop = mobile ? "480:320:240:240" : "640:320:400:240";
  const detailHeight = mobile ? 480 : 480;
  const size = `${(target.bytes / 1048576).toFixed(1)} MiB`;
  const filters = [
    `[0:v]scale=${width}:${height}:flags=lanczos,split=2[old][oldDetail]`,
    `[1:v]scale=${width}:${height}:flags=lanczos,split=2[new][newDetail]`,
    `[old]scale=${column}:${fullHeight},pad=${column}:${fullHeight + 50}:0:50:black,${label("CURRENT LIVE - video frame")}[a]`,
    `[new]scale=${column}:${fullHeight},pad=${column}:${fullHeight + 50}:0:50:black,${label(`PROPOSED - ${target.width}x${target.height}, ${size}`)}[b]`,
    `[oldDetail]crop=${crop},scale=${column}:${detailHeight}:flags=lanczos,pad=${column}:${detailHeight + 50}:0:50:black,${label("CURRENT - equally enlarged garment detail")}[c]`,
    `[newDetail]crop=${crop},scale=${column}:${detailHeight}:flags=lanczos,pad=${column}:${detailHeight + 50}:0:50:black,${label("PROPOSED - equally enlarged garment detail")}[d]`,
    `[a][b][c][d]xstack=inputs=4:layout=0_0|${column}_0|0_${fullHeight + 50}|${column}_${fullHeight + 50}[review]`,
  ];
  const output = path.join(directory, `${target.target}-clarity-comparison.jpg`);
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-threads", "2",
    "-ss", "10", "-i", before, "-ss", "10", "-i", after,
    "-filter_complex_threads", "2", "-filter_complex", filters.join(";"),
    "-map", "[review]", "-frames:v", "1", "-q:v", "2", "-update", "1", output,
  ], { maxBuffer: 1024 * 1024, timeout: 120_000 });
  console.log(output);
}
await writeFile(path.join(directory, "review-notes.json"), JSON.stringify({
  note: "Same playback time, same display dimensions, equal detail magnification. Frames show video bytes without webpage overlays. No AI enhancement or invented detail.",
  originals: report.source, exports: report.exports,
}, null, 2));
