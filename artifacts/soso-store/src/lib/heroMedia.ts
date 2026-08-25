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
  const posterUrl = environment.isMobile ? hero.mobileImageUrl : hero.imageUrl;
  const videoUrl = environment.isMobile ? hero.mobileVideoUrl : hero.videoUrl;
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