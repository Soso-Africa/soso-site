import React, { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "wouter";
import { trackStorefrontEvent } from "@/components/ConsentManager";
import { responsiveProductPhoto } from "@/lib/responsive-product-photo";

export function CategoryFeature({
  categoryName, eyebrow, description, images, mobileImages, imageAlt, href, isEven, testId,
  desktopCropPosition = "center", mobileCropPosition = "center", imageMode = "static", rotationMs = 5000,
}: {
  categoryName: string; eyebrow: string; description: string; images: string[]; mobileImages?: string[];
  imageAlt: string; href: string; isEven: boolean; testId: string; desktopCropPosition?: string;
  mobileCropPosition?: string; imageMode?: "static" | "crossfade"; rotationMs?: number;
}) {
  const safeImages = images.slice(0, 4).filter(Boolean);
  const imageSignature = `${safeImages.join("|")}::${mobileImages?.join("|") ?? ""}`;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [layersReady, setLayersReady] = useState(false);
  const [loadedIndexes, setLoadedIndexes] = useState<number[]>([]);
  const [visible, setVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const impressionSent = useRef(false);
  const rotating = imageMode === "crossfade" && safeImages.length > 1;
  const allImagesLoaded = safeImages.every((_, index) => loadedIndexes.includes(index));

  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry) return;
      setVisible(entry.isIntersecting && entry.intersectionRatio > 0);
      if (entry.intersectionRatio >= 0.25 && !impressionSent.current) {
        impressionSent.current = true;
        trackStorefrontEvent("category_impression", { placement: "homepage_category", category: categoryName });
      }
    }, { threshold: [0, 0.25] });
    observer.observe(node);
    return () => observer.disconnect();
  }, [categoryName]);

  useEffect(() => {
    setCurrentIndex(0);
    setLayersReady(false);
    setLoadedIndexes([]);
  }, [imageSignature]);

  useEffect(() => {
    if (!rotating) return;
    const node = sectionRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setLayersReady(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      setLayersReady(true);
      observer.disconnect();
    }, { rootMargin: "300px 0px", threshold: 0 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [rotating, imageSignature]);

  useEffect(() => {
    if (!visible || !rotating || !layersReady || !allImagesLoaded) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setInterval> | undefined;
    const updateTimer = () => {
      if (timer) clearInterval(timer);
      if (document.hidden || reducedMotion.matches) return;
      timer = setInterval(() => setCurrentIndex((current) => (current + 1) % safeImages.length), rotationMs);
    };
    document.addEventListener("visibilitychange", updateTimer);
    reducedMotion.addEventListener("change", updateTimer);
    updateTimer();
    return () => { if (timer) clearInterval(timer); document.removeEventListener("visibilitychange", updateTimer); reducedMotion.removeEventListener("change", updateTimer); };
  }, [allImagesLoaded, layersReady, rotating, rotationMs, safeImages.length, visible]);

  const sourceFor = (index: number) => mobileImages?.[index] || safeImages[index];
  const renderImage = (index: number) => {
    const active = index === currentIndex;
    const swivel = index % 2 === 0 ? "0.7deg" : "-0.7deg";
    return safeImages[index] && (
    <picture
      key={safeImages[index]}
      aria-hidden={!active || undefined}
      className="absolute -inset-[1.5%] transform-gpu overflow-hidden will-change-[opacity,transform]"
      style={{
        zIndex: active ? 1 : 0,
        opacity: active ? 1 : 0,
        transform: active ? "scale(1) rotate(0deg)" : `scale(1.045) rotate(${swivel})`,
        transition: "opacity 1600ms cubic-bezier(0.33, 1, 0.68, 1), transform 1600ms cubic-bezier(0.33, 1, 0.68, 1)",
      }}
    >
      {sourceFor(index) !== safeImages[index] && <source media="(max-width: 767px)" srcSet={responsiveProductPhoto(sourceFor(index), "100vw").srcSet ?? sourceFor(index)} sizes="100vw" />}
      <img src={safeImages[index]} alt={active ? imageAlt : ""} aria-hidden={!active || undefined} width={1200} height={1600}
        {...responsiveProductPhoto(safeImages[index], "(max-width: 767px) 100vw, 50vw")}
        loading="lazy" decoding="async"
        onLoad={() => setLoadedIndexes((loaded) => loaded.includes(index) ? loaded : [...loaded, index])}
        className="h-full w-full object-cover object-[var(--mobile-position)] md:object-[var(--desktop-position)]"
        style={{ "--desktop-position": desktopCropPosition, "--mobile-position": mobileCropPosition } as CSSProperties} />
    </picture>
  );
  };

  return <section ref={sectionRef} className="bg-background" data-testid={testId} data-merchandising-value={categoryName}>
    <div className="mx-auto flex min-h-[70vh] flex-col md:flex-row">
      <Link href={href} aria-label={`Shop ${categoryName}`} onClick={() => trackStorefrontEvent("cta_clicked", { placement: "homepage_category", category: categoryName, action: "image_click" })}
        className={`relative block w-full aspect-[3/4] overflow-hidden md:w-1/2 md:aspect-auto ${isEven ? "md:order-2" : "md:order-1"}`}>
        {(rotating && layersReady ? safeImages : safeImages.slice(0, 1)).map((_, index) => renderImage(index))}
      </Link>
      <div className={`flex w-full flex-col justify-center bg-muted/10 px-8 py-16 md:w-1/2 md:px-16 lg:px-24 ${isEven ? "md:order-1" : "md:order-2"}`}>
        <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.3em] text-secondary">{eyebrow}</p>
        <h2 className="soso-display mb-6 text-4xl text-foreground lg:text-5xl">{categoryName}</h2>
        <p className="mb-8 max-w-sm text-[13px] leading-relaxed text-secondary">{description}</p>
        <Link href={href} onClick={() => trackStorefrontEvent("cta_clicked", { placement: "homepage_category", category: categoryName, action: "cta_click" })}
          className="self-start border-b border-foreground pb-1 text-[11px] font-bold uppercase tracking-[0.2em] text-foreground transition-colors hover:border-secondary hover:text-secondary">Shop {categoryName}</Link>
      </div>
    </div>
  </section>;
}