export type HeroMediaConfiguration = {
  mediaMode: "image" | "video";
  imageUrl: string;
  mobileImageUrl: string;
  videoUrl?: string;
  mobileVideoUrl?: string;
};

export type HeroMotionEnvironment = {
  isMobile: boolean;
  prefersReducedMotion: boolean;
  saveData: boolean;
  effectiveType?: string;
};

export function videoMimeType(path: string): "video/mp4" | "video/webm" | null {
  const pathname = path.split(/[?#]/, 1)[0]?.toLowerCase() ?? "";
  if (pathname.endsWith(".mp4")) return "video/mp4";
  if (pathname.endsWith(".webm")) return "video/webm";
  return null;
}

export function selectHeroMedia(
  hero: HeroMediaConfiguration,
  environment: HeroMotionEnvironment,
  canPlayType: (mimeType: string) => boolean,
) {
  // Image-mode artwork is not necessarily a frame from the uploaded video.
  const posterUrl = hero.mediaMode === "image"
    ? (environment.isMobile ? hero.mobileImageUrl : hero.imageUrl)
    : undefined;
  const configuredVideoUrl = environment.isMobile ? hero.mobileVideoUrl : hero.videoUrl;
  // These are alternate encodings of the same approved bundled footage, not
  // replacements for merchant uploads. Prefer fast-start H.264 for Safari and
  // lower transfer cost, retaining WebM for browsers without MP4 support.
  const bundledVideo = configuredVideoUrl?.match(/^(.*\/media\/soso-craft-hero-(?:desktop|mobile))\.webm$/);
  const videoUrl = bundledVideo && canPlayType("video/mp4")
    ? `${bundledVideo[1]}-v1.mp4`
    : configuredVideoUrl;
  const mimeType = videoUrl ? videoMimeType(videoUrl) : null;
  const constrainedConnection = environment.effectiveType === "slow-2g"
    || environment.effectiveType === "2g";
  const motionAllowed = hero.mediaMode === "video"
    && !environment.prefersReducedMotion
    && !environment.saveData
    && !constrainedConnection
    && Boolean(videoUrl)
    && Boolean(mimeType)
    && canPlayType(mimeType!);

  return {
    posterUrl,
    videoUrl: motionAllowed ? videoUrl : undefined,
    mimeType: motionAllowed ? mimeType : null,
    motionAllowed,
  };
}