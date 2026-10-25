import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { heroLayout, heroUsesOverlayHeader, selectHeroMedia, videoMimeType, type HeroMediaConfiguration } from "./heroMedia";

const videoHero: HeroMediaConfiguration = {
  mediaMode: "video",
  imageUrl: "/media/hero-desktop.jpg",
  mobileImageUrl: "/media/hero-mobile.jpg",
  videoUrl: "/media/hero-desktop.mp4",
  mobileVideoUrl: "/media/hero-mobile.webm",
};
const standardEnvironment = {
  isMobile: false,
  prefersReducedMotion: false,
  saveData: false,
  effectiveType: "4g",
};

test("comparison heroes reserve an uncropped 4:3 phone frame below the header without changing desktop", () => {
  const result = heroLayout({ ...videoHero, mobileVideoLayout: "comparison" }, true);
  assert.equal(result.comparison, true);
  assert.match(result.media, /relative aspect-\[4\/3\]/);
  assert.match(result.media, /md:absolute md:inset-0 md:aspect-auto/);
  assert.match(result.section, /md:h-\[100svh\]/);
  assert.match(result.section, /md:-mt-\[106px\]/);
  assert.ok(!result.section.split(" ").includes("h-[100svh]"), "Phone layout must not fill a tall screen");
  assert.ok(!result.section.split(" ").includes("-mt-[106px]"), "Header must not obscure either model");
  assert.equal(result.cta, "mt-6 md:mt-0");
});

test("existing videos and stills retain their full-height layouts unless video comparison is explicit", () => {
  for (const hero of [
    videoHero,
    { ...videoHero, mobileVideoLayout: "full-height" as const },
    { ...videoHero, mediaMode: "image" as const, mobileVideoLayout: "comparison" as const },
  ]) {
    const result = heroLayout(hero, false);
    assert.equal(result.comparison, false);
    assert.match(result.section, /h-\[100svh\]/);
    assert.match(result.section, /-mt-\[72px\]/);
    assert.equal(result.media, "absolute inset-0");
  }
});

test("phone comparison headers stay readable without changing desktop overlay navigation", () => {
  const hero = { ...videoHero, mobileVideoLayout: "comparison" as const };
  assert.equal(heroUsesOverlayHeader(hero, true), false);
  assert.equal(heroUsesOverlayHeader(hero, false), true);
  assert.equal(heroUsesOverlayHeader(videoHero, true), true);
  assert.equal(heroUsesOverlayHeader(undefined, true), true);
});

test("video heroes select responsive videos without unrelated image posters", () => {
  const desktop = selectHeroMedia(videoHero, standardEnvironment, () => true);
  assert.deepEqual(desktop, {
    posterUrl: undefined,
    videoUrl: "/media/hero-desktop.mp4",
    mimeType: "video/mp4",
    motionAllowed: true,
  });

  const mobile = selectHeroMedia(videoHero, { ...standardEnvironment, isMobile: true }, () => true);
  assert.equal(mobile.posterUrl, undefined);
  assert.equal(mobile.videoUrl, "/media/hero-mobile.webm");
  assert.equal(mobile.mimeType, "video/webm");
});

test("video heroes never restore unrelated images for reduced motion or data saving", () => {
  for (const environment of [
    { ...standardEnvironment, prefersReducedMotion: true },
    { ...standardEnvironment, saveData: true },
    { ...standardEnvironment, effectiveType: "slow-2g" },
    { ...standardEnvironment, effectiveType: "2g" },
  ]) {
    const selected = selectHeroMedia(videoHero, environment, () => true);
    assert.equal(selected.motionAllowed, false);
    assert.equal(selected.videoUrl, undefined);
    assert.equal(selected.posterUrl, undefined);
  }
});

test("image heroes retain their responsive artwork", () => {
  const hero = { ...videoHero, mediaMode: "image" as const };
  assert.equal(selectHeroMedia(hero, standardEnvironment, () => true).posterUrl, hero.imageUrl);
  assert.equal(selectHeroMedia(hero, { ...standardEnvironment, isMobile: true }, () => true).posterUrl, hero.mobileImageUrl);
});

test("hero media does not mount unsupported or incomplete video", () => {
  assert.equal(selectHeroMedia(videoHero, standardEnvironment, () => false).motionAllowed, false);
  assert.equal(selectHeroMedia({ ...videoHero, videoUrl: undefined }, standardEnvironment, () => true).motionAllowed, false);
  assert.equal(selectHeroMedia({ ...videoHero, mediaMode: "image" }, standardEnvironment, () => true).motionAllowed, false);
  assert.equal(videoMimeType("/media/hero.mov"), null);
});

test("approved bundled hero prefers fast-start MP4 on desktop and mobile", () => {
  const bundled = {
    ...videoHero,
    videoUrl: "/media/soso-craft-hero-desktop.webm",
    mobileVideoUrl: "/media/soso-craft-hero-mobile.webm",
  };
  for (const isMobile of [false, true]) {
    const selected = selectHeroMedia(bundled, { ...standardEnvironment, isMobile }, (type) => type === "video/mp4");
    assert.equal(selected.motionAllowed, true);
    assert.equal(selected.videoUrl, `/media/soso-craft-hero-${isMobile ? "mobile" : "desktop"}-v1.mp4`);
    assert.equal(selected.mimeType, "video/mp4");
    assert.equal(selected.posterUrl, undefined);
  }
});

test("bundled hero retains WebM when MP4 cannot play and never rewrites merchant footage", () => {
  const bundled = { ...videoHero, videoUrl: "/media/soso-craft-hero-desktop.webm" };
  const selected = selectHeroMedia(bundled, standardEnvironment, (type) => type === "video/webm");
  assert.equal(selected.videoUrl, bundled.videoUrl);
  assert.equal(selected.motionAllowed, true);
  const merchant = { ...videoHero, videoUrl: "/api/storage/objects/uploads/merchant.webm" };
  assert.equal(selectHeroMedia(merchant, standardEnvironment, () => true).videoUrl, merchant.videoUrl);
});

test("bundled MP4 variants stay small and place playback metadata before video bytes", () => {
  for (const viewport of ["desktop", "mobile"]) {
    const bytes = readFileSync(new URL(`../../public/media/soso-craft-hero-${viewport}-v1.mp4`, import.meta.url));
    const original = readFileSync(new URL(`../../public/media/soso-craft-hero-${viewport}.webm`, import.meta.url));
    assert.ok(bytes.length < 1024 * 1024, `${viewport} MP4 must remain under 1 MiB`);
    assert.ok(bytes.length < original.length * 0.7, `${viewport} MP4 must save at least 30% of transfer`);
    const atoms: string[] = [];
    for (let offset = 0; offset + 8 <= bytes.length;) {
      const size = bytes.readUInt32BE(offset);
      assert.ok(size >= 8 && offset + size <= bytes.length, "MP4 atoms must be complete");
      atoms.push(bytes.toString("ascii", offset + 4, offset + 8));
      offset += size;
    }
    assert.equal(atoms[0], "ftyp");
    assert.ok(atoms.includes("moov") && atoms.includes("mdat"));
    assert.ok(atoms.indexOf("moov") < atoms.indexOf("mdat"), "Metadata must allow playback before the full download");
  }
});