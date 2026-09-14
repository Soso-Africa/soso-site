import assert from "node:assert/strict";
import test from "node:test";
import { selectHeroMedia, videoMimeType, type HeroMediaConfiguration } from "./heroMedia";

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