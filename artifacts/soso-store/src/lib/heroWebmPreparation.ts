import { MAX_PREPARED_HERO_BYTES, type HeroPreparationReport } from "./heroPreparation";

export type HeroWebmReport = Omit<HeroPreparationReport, "tool" | "crf"> & {
  tool: "soso-offline-webm"; codec: "vp9";
};
// WebM makes SDR yuv420p's default limited range explicit; full range is
// refused by the offline tool, never converted silently.
const colourIdentity = (colour: string[]) => [colour[0] === "unknown" ? "tv" : colour[0], ...colour.slice(1)];
export async function verifyHeroWebm(source: File, webm: File, reportFile: File): Promise<HeroWebmReport> {
  if (!/\.mp4$/i.test(source.name) || source.type !== "video/mp4"
    || !/^[A-Za-z0-9][A-Za-z0-9._ -]{0,159}\.webm$/i.test(webm.name) || webm.type !== "video/webm"
    || [source.size, webm.size].some((size) => size < 1 || size > MAX_PREPARED_HERO_BYTES)
    || reportFile.size > 16 * 1024) throw new Error("Choose the configured MP4, VP9 WebM (each up to 24 MiB), and offline JSON report.");
  const report = JSON.parse(await reportFile.text()) as HeroWebmReport;
  const valid = (item: HeroWebmReport["before"]) => item && /^[a-f0-9]{64}$/.test(item.sha256)
    && Number.isInteger(item.width) && item.width > 0 && Number.isInteger(item.height) && item.height > 0
    && Number.isInteger(item.frames) && item.frames > 0 && Number.isFinite(item.duration) && item.duration > 0
    && typeof item.frameRate === "string" && /^\d+\/[1-9]\d*$/.test(item.frameRate)
    && Array.isArray(item.colour) && item.colour.length === 4
    && item.colour.every((entry) => typeof entry === "string")
    && Number.isInteger(item.audioStreams) && item.audioStreams >= 0;
  if (report.version !== 1 || report.tool !== "soso-offline-webm" || report.codec !== "vp9"
    || !valid(report.before) || !valid(report.after)
    || report.before.bytes !== source.size || report.after.bytes !== webm.size
    || report.before.width !== report.after.width || report.before.height !== report.after.height
    || report.before.frames !== report.after.frames || report.before.frameRate !== report.after.frameRate
    || report.before.audioStreams !== report.after.audioStreams
    || JSON.stringify(colourIdentity(report.before.colour)) !== JSON.stringify(colourIdentity(report.after.colour))
    || Math.abs(report.before.duration - report.after.duration) > 0.15) {
    throw new Error("Report does not prove an unchanged composition and complete same-footage VP9 export.");
  }
  for (const [file, evidence] of [[source, report.before], [webm, report.after]] as const) {
    const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    const hex = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
    if (hex !== evidence.sha256) throw new Error("Files changed or do not match this report.");
  }
  return report;
}
