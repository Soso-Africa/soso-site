import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import type { PlatformContent } from "@/data/platformContent";
import { selectHeroMedia, type HeroMotionEnvironment } from "@/lib/heroMedia";
import { responsiveProductPhoto } from "@/lib/responsive-product-photo";
import { useDocumentVisible } from "@/hooks/use-document-visible";

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
  const containerRef = useRef<HTMLDivElement>(null);
  const manuallyPaused = useRef(false);
  const documentVisible = useDocumentVisible();
  const [inViewport, setInViewport] = useState(false);
  const [activatedVideoUrl, setActivatedVideoUrl] = useState<string>();
  const [environment, setEnvironment] = useState<HeroMotionEnvironment>(() => readEnvironment());
  const [failed, setFailed] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [readyVideoUrl, setReadyVideoUrl] = useState<string>();
  const selected = useMemo(() => selectHeroMedia(
    hero,
    environment,
    (mimeType) => document.createElement("video").canPlayType(mimeType) !== "",
  ), [environment, hero]);
  const shouldPlay = selected.motionAllowed && inViewport && documentVisible && !failed && !manuallyPaused.current;

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      setInViewport(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setInViewport(entry.isIntersecting), { threshold: 0 });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (selected.motionAllowed && inViewport && documentVisible && !failed) {
      setActivatedVideoUrl(selected.videoUrl);
    }
  }, [selected.videoUrl, selected.motionAllowed, inViewport, documentVisible, failed]);

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
    manuallyPaused.current = false;
    setFailed(false);
    setIsPlaying(false);
  }, [selected.videoUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!shouldPlay) {
      video.pause();
      return;
    }
    // Set both properties before requesting playback. Safari may reject muted
    // autoplay when only React's property update has happened.
    video.muted = true;
    video.defaultMuted = true;
    void video.play().catch(() => {
      // Autoplay can still be blocked by OS/browser policy; keep manual play.
      if (videoRef.current === video) setIsPlaying(false);
    });
  }, [selected.videoUrl, shouldPlay, activatedVideoUrl]);

  // Keep an activated source mounted across visibility changes; resetting src
  // when scrolling back can cause another download of the same footage.
  const videoEnabled = selected.motionAllowed && !failed && selected.videoUrl && selected.mimeType
    && activatedVideoUrl === selected.videoUrl;
  const togglePlayback = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      manuallyPaused.current = false;
      try {
        await video.play();
      } catch {
        setIsPlaying(false);
      }
    } else {
      manuallyPaused.current = true;
      video.pause();
    }
  };

  return <div ref={containerRef} className="absolute inset-0 bg-neutral-800" data-testid="home-hero-media">
    {selected.posterUrl && <picture className="block h-full w-full">
      <source media="(max-width: 767px)" srcSet={responsiveProductPhoto(hero.mobileImageUrl, "100vw").srcSet ?? hero.mobileImageUrl} sizes="100vw" />
      <img
        src={hero.imageUrl}
        {...responsiveProductPhoto(hero.imageUrl, "100vw")}
        alt={hero.imageAlt}
        className="h-full w-full object-cover object-top opacity-85"
        loading="eager"
        fetchPriority="high"
      />
    </picture>}
    {videoEnabled && <>
      <video
        key={selected.videoUrl}
        ref={videoRef}
        src={selected.videoUrl}
        className={`absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-150 motion-reduce:transition-none ${readyVideoUrl === selected.videoUrl ? "opacity-85" : "opacity-0"}`}
        poster={selected.posterUrl}
        muted
        loop
        playsInline
        autoPlay={shouldPlay}
        preload={shouldPlay ? "metadata" : "none"}
        aria-hidden="true"
        tabIndex={-1}
        data-testid="home-hero-video"
        onLoadedData={() => setReadyVideoUrl(selected.videoUrl)}
        onPlaying={() => { setIsPlaying(true); setReadyVideoUrl(selected.videoUrl); }}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onError={() => { setFailed(true); setIsPlaying(false); setReadyVideoUrl(undefined); }}
      />
      <button
        type="button"
        onClick={() => void togglePlayback()}
        aria-label={isPlaying ? hero.pauseLabel : hero.playLabel}
        aria-pressed={isPlaying}
        className="absolute bottom-5 right-5 z-20 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/60 bg-black/30 text-white backdrop-blur-sm transition-colors hover:bg-black/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:bottom-8 md:right-8"
        data-testid="button-hero-motion"
      >
        {isPlaying ? <Pause aria-hidden="true" size={14} /> : <Play aria-hidden="true" size={14} />}
      </button>
    </>}
  </div>;
}