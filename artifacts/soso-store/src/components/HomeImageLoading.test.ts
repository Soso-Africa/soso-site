import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const readSource = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const homeSource = readSource("../pages/Home.tsx");
const categorySource = readSource("./CategoryFeature.tsx");
const journalSource = readSource("./HomeJournalPreview.tsx");

function assertImagesLazyAndAsync(source: string, name: string) {
  const imageTagPattern = new RegExp("<" + "img\\b[^>]*>", "gs");
  const imageTags = [...source.matchAll(imageTagPattern)].map(([tag]) => tag);
  assert.ok(imageTags.length > 0, `${name} should contain image elements`);
  for (const tag of imageTags) {
    assert.match(tag, /loading="lazy"/, `${name} image should load lazily`);
    assert.match(tag, /decoding="async"/, `${name} image should decode asynchronously`);
  }
}

test("homepage below-the-fold image elements are lazy and asynchronously decoded", () => {
  assertImagesLazyAndAsync(homeSource, "Home");
  assertImagesLazyAndAsync(categorySource, "CategoryFeature");
  assertImagesLazyAndAsync(journalSource, "HomeJournalPreview");
  assert.doesNotMatch(homeSource, /eager=\{index === 0\}/);
});

test("rotating category layers are prepared near the viewport and rotate only when visible and loaded", () => {
  assert.match(categorySource, /rootMargin: "300px 0px", threshold: 0/);
  assert.match(categorySource, /entry\.intersectionRatio >= 0\.25/);
  assert.match(categorySource, /\(rotating && layersReady \? safeImages : safeImages\.slice\(0, 1\)\)/);
  assert.match(categorySource, /if \(!visible \|\| !rotating \|\| !layersReady \|\| !allImagesLoaded\) return;/);
  assert.match(categorySource, /prefers-reduced-motion: reduce/);
});