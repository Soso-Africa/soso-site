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

test("hero media selects responsive poster and video sources", () => {
  const desktop = selectHeroMedia(videoHero, standardEnvironment, () => true);
  assert.deepEqual(desktop, {
    posterUrl: "/media/hero-desktop.jpg",
    videoUrl: "/media/hero-desktop.mp4",
    mimeType: "video/mp4",
    motionAllowed: true,
  });

  const mobile = selectHeroMedia(videoHero, { ...standardEnvironment, isMobile: true }, () => true);
  assert.equal(mobile.posterUrl, "/media/hero-mobile.jpg");
  assert.equal(mobile.videoUrl, "/media/hero-mobile.webm");
  assert.equal(mobile.mimeType, "video/webm");
});

test("hero media keeps the approved image for reduced motion, data saving, and constrained connections", () => {
  for (const environment of [
    { ...standardEnvironment, prefersReducedMotion: true },
    { ...standardEnvironment, saveData: true },
    { ...standardEnvironment, effectiveType: "slow-2g" },
    { ...standardEnvironment, effectiveType: "2g" },
  ]) {
    const selected = selectHeroMedia(videoHero, environment, () => true);
    assert.equal(selected.motionAllowed, false);
    assert.equal(selected.videoUrl, undefined);
    assert.equal(selected.posterUrl, videoHero.imageUrl);
  }
});

test("hero media does not mount unsupported or incomplete video", () => {
  assert.equal(selectHeroMedia(videoHero, standardEnvironment, () => false).motionAllowed, false);
  assert.equal(selectHeroMedia({ ...videoHero, videoUrl: undefined }, standardEnvironment, () => true).motionAllowed, false);
  assert.equal(selectHeroMedia({ ...videoHero, mediaMode: "image" }, standardEnvironment, () => true).motionAllowed, false);
  assert.equal(videoMimeType("/media/hero.mov"), null);
});