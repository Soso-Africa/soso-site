import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import type { PlatformContent } from "@/data/platformContent";
import { selectHeroMedia, type HeroMotionEnvironment } from "@/lib/heroMedia";

type Hero = PlatformContent["homepage"]["hero"];
type NetworkInformation = EventTarget & {
  saveData?: boolean;
  effectiveType?: string;
};

function networkInformation(): NetworkInformation | undefined {
  return (navigator as Navigator & { connection?: NetworkInformation }).connection;
}

function readEnvironment(): HeroMotionEnvironment {
  const connection = networkInformation();
  return {
    isMobile: window.matchMedia("(max-width: 767px)").matches,
    prefersReducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    saveData: connection?.saveData === true,
    effectiveType: connection?.effectiveType,
  };
}

export function HomeHeroMedia({ hero }: { hero: Hero }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [environment, setEnvironment] = useState<HeroMotionEnvironment>(() => readEnvironment());
  const [failed, setFailed] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const selected = useMemo(() => selectHeroMedia(
    hero,
    environment,
    (mimeType) => document.createElement("video").canPlayType(mimeType) !== "",
  ), [environment, hero]);

  useEffect(() => {
    const viewport = window.matchMedia("(max-width: 767px)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = networkInformation();
    const refresh = () => setEnvironment(readEnvironment());
    viewport.addEventListener("change", refresh);
    reducedMotion.addEventListener("change", refresh);
    connection?.addEventListener("change", refresh);
    return () => {
      viewport.removeEventListener("change", refresh);
      reducedMotion.removeEventListener("change", refresh);
      connection?.removeEventListener("change", refresh);
    };
  }, []);

  useEffect(() => {
    setFailed(false);
    setIsPlaying(false);
    setIsVisible(false);
  }, [selected.videoUrl]);

  const videoEnabled = selected.motionAllowed && !failed && selected.videoUrl && selected.mimeType;
  const togglePlayback = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      try {
        await video.play();
      } catch {
        setIsPlaying(false);
      }
    } else {
      video.pause();
    }
  };

  return <div className="absolute inset-0" data-testid="home-hero-media">
    <picture className="block h-full w-full">
      <source media="(max-width: 767px)" srcSet={hero.mobileImageUrl} />
      <img
        src={hero.imageUrl}
        alt={hero.imageAlt}
        className="h-full w-full object-cover object-top opacity-55"
        loading="eager"
        fetchPriority="high"
      />
    </picture>
    {videoEnabled && <>
      <video
        key={selected.videoUrl}
        ref={videoRef}
        className={`absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-500 ${isVisible ? "opacity-55" : "opacity-0"}`}
        poster={selected.posterUrl}
        muted
        loop
        playsInline
        autoPlay
        preload="none"
        aria-hidden="true"
        tabIndex={-1}
        data-testid="home-hero-video"
        onPlaying={() => { setIsPlaying(true); setIsVisible(true); }}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onError={() => { setFailed(true); setIsPlaying(false); setIsVisible(false); }}
      >
        <source src={selected.videoUrl} type={selected.mimeType ?? undefined} />
      </video>
      <button
        type="button"
        onClick={() => void togglePlayback()}
        aria-label={isPlaying ? hero.pauseLabel : hero.playLabel}
        aria-pressed={isPlaying}
        className="absolute bottom-5 right-5 z-20 inline-flex min-h-11 items-center gap-2 border border-white/40 bg-background/75 px-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-white backdrop-blur-sm transition-colors hover:border-primary hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        data-testid="button-hero-motion"
      >
        {isPlaying ? <Pause aria-hidden="true" size={14} /> : <Play aria-hidden="true" size={14} />}
        {isPlaying ? hero.pauseLabel : hero.playLabel}
      </button>
    </>}
  </div>;
}