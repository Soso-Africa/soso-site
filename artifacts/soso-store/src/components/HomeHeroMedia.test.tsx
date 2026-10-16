import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { HomeHeroMedia } from "./HomeHeroMedia";
import type { PlatformContent } from "../data/platformContent";

test("hero starts only in a visible viewport, pauses in background, retains its source and respects manual pause", async () => {
  const listeners = new Set<() => void>();
  const documentMock = {
    visibilityState: "hidden",
    createElement: () => ({ canPlayType: () => "probably" }),
    addEventListener: (_event: string, callback: () => void) => listeners.add(callback),
    removeEventListener: (_event: string, callback: () => void) => listeners.delete(callback),
  };
  let viewportCallback: (entries: { isIntersecting: boolean }[]) => void = () => {};
  let plays = 0;
  const video = {
    paused: true, muted: true, defaultMuted: true,
    async play() { plays++; this.paused = false; },
    pause() { this.paused = true; },
  };
  const globals: Record<string, unknown> = {
    window: { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) },
    document: documentMock,
    navigator: {},
    IntersectionObserver: class {
      constructor(callback: typeof viewportCallback) { viewportCallback = callback; }
      observe() { viewportCallback([{ isIntersecting: true }]); }
      disconnect() {}
    },
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const original = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, value });
  let renderer: ReactTestRenderer | undefined;
  const hero = {
    mediaMode: "video", videoUrl: "/api/storage/objects/uploads/hero.mp4",
    imageUrl: "/unrelated.jpg", mobileImageUrl: "/unrelated-mobile.jpg", imageAlt: "Unrelated",
    playLabel: "Play video", pauseLabel: "Pause video",
  } as PlatformContent["homepage"]["hero"];
  try {
    await act(async () => {
      renderer = create(<HomeHeroMedia hero={hero} />, { createNodeMock: element => element.type === "video" ? video : {} });
    });
    const root = renderer!.root;
    assert.equal(root.findAllByType("video").length, 0, "Hidden pages do not attach a video download source");
    assert.equal(root.findAllByType("img").length, 0, "Never show unrelated image-mode artwork");
    await act(async () => {
      documentMock.visibilityState = "visible";
      listeners.forEach(callback => callback());
    });
    assert.equal(root.findByType("video").props.src, hero.videoUrl);
    assert.equal(root.findByType("video").props.preload, "metadata");
    assert.ok(plays > 0);
    await act(async () => viewportCallback([{ isIntersecting: false }]));
    assert.equal(video.paused, true);
    assert.equal(root.findByType("video").props.src, hero.videoUrl, "Scrolling out does not discard and reload the source");
    assert.equal(root.findByType("video").props.preload, "none");
    await act(async () => viewportCallback([{ isIntersecting: true }]));
    await act(async () => root.findByType("video").props.onPlaying());
    await act(async () => {
      root.findByType("button").props.onClick();
      root.findByType("video").props.onPause();
    });
    const pausedPlays = plays;
    await act(async () => {
      documentMock.visibilityState = "hidden";
      listeners.forEach(callback => callback());
    });
    await act(async () => {
      documentMock.visibilityState = "visible";
      listeners.forEach(callback => callback());
    });
    assert.equal(plays, pausedPlays, "Returning to the tab must not undo the shopper's manual pause");
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    for (const [key, descriptor] of Object.entries(original)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
